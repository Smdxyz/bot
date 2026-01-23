// --- START OF FILE index.js ---

import 'dotenv/config';
import { Telegraf, Markup, session } from 'telegraf';
import { getUser, updateUser } from './lib/db.js';
import { EventEmitter } from 'events';

// Import Automator
import { GitHubAutomator } from './github_automator.js';

// Import Handlers
import { setupMenuHandler } from './handlers/menu.js';
import { setupAdminHandler } from './handlers/admin.js';
import { setupKTMHandler } from './handlers/ktm.js';
import { setupCanvaHandler } from './handlers/canva.js';

// Opsi polling diperpanjang biar gak gampang timeout
const bot = new Telegraf(process.env.BOT_TOKEN, {
    handlerTimeout: 900000 // 15 menit (biar aman kalau proses lama)
});

const inputEvents = new EventEmitter();
const waitingForInput = {}; 

// --- FUNGSI HELPER ADMIN ---
const safeDelete = async (chatId, msgId) => {
    try { await bot.telegram.deleteMessage(chatId, msgId); } catch (e) {}
};

const askUser = (chatId, question, isPassword = false) => {
    return new Promise(async (resolve) => {
        let qMsg;
        try {
            qMsg = await bot.telegram.sendMessage(chatId, question, { parse_mode: 'Markdown' });
        } catch (e) {
            console.error("Gagal kirim pertanyaan:", e.message);
            resolve(null);
            return;
        }

        waitingForInput[chatId] = true;
        
        // Timeout 3 menit buat nunggu user ngetik
        const timeout = setTimeout(async () => {
            if(waitingForInput[chatId]) {
                delete waitingForInput[chatId];
                resolve(null);
                await bot.telegram.sendMessage(chatId, "❌ Waktu habis. Silakan ulangi perintah.");
            }
        }, 180000);

        inputEvents.once(`input_${chatId}`, async (answer, answerMsgId) => {
            clearTimeout(timeout);
            delete waitingForInput[chatId];
            
            await safeDelete(chatId, answerMsgId);
            if (isPassword && qMsg) await safeDelete(chatId, qMsg.message_id);
            
            resolve(answer);
        });
    });
};

// --- MIDDLEWARE ---
bot.use(session());

// Middleware Log & User Init
bot.use(async (ctx, next) => {
    if (ctx.from) {
        // Init user di DB (ringan, sinkronus)
        try { getUser(ctx.from.id); } catch(e) { console.error("DB Init Error:", e.message); }
    }

    if (ctx.message && ctx.message.text) {
        const text = ctx.message.text;
        
        // 1. Cek Admin Input (Priority High)
        if (waitingForInput[ctx.from.id] && !text.startsWith('/')) {
            inputEvents.emit(`input_${ctx.from.id}`, text, ctx.message.message_id);
            return; // STOP! Jangan lanjut ke handler lain
        }
        
        // 2. Cek Wizard State (KTM/Canva)
        const user = getUser(ctx.from.id);
        if (user && user.state) {
             if (user.state.startsWith('CANVA_WIZARD_')) {
                // Jalankan di background biar gak ngeblok polling
                canvaHandler.handleWizardText(ctx).catch(e => console.error("Canva Wizard Error:", e));
                return;
            }
            if (user.state.startsWith('KTM_WIZARD_')) {
                ktmHandler.handleWizardText(ctx).catch(e => console.error("KTM Wizard Error:", e));
                return;
            }
        }
    }

    // 3. Lanjut ke handler biasa
    await next(); 
});

// --- LOAD HANDLERS ---
setupMenuHandler(bot);  
setupAdminHandler(bot); 
const ktmHandler = setupKTMHandler(bot); 
const canvaHandler = setupCanvaHandler(bot); 

// ==========================================================
// --- COMMAND ADMIN: /autogh ---
// ==========================================================
bot.command('autogh', async (ctx) => {
    const ownerId = process.env.OWNER_ID ? process.env.OWNER_ID.toString() : '';
    if (ctx.from.id.toString() !== ownerId) return;

    await safeDelete(ctx.chat.id, ctx.message.message_id);

    // Jalankan logika admin di dalam async function terpisah
    // supaya tidak memblokir main thread bot
    (async () => {
        try {
            const username = await askUser(ctx.chat.id, '🤖 Masukkan *Username GitHub*:');
            if (!username) return;

            const password = await askUser(ctx.chat.id, '🔑 Masukkan *Password GitHub*: (Auto Hapus)', true);
            if (!password) return;

            const email = await askUser(ctx.chat.id, '📧 Masukkan *Email Student*:');
            if (!email) return;

            const statusMsg = await ctx.reply('🚀 *Running GitHub Automator...*', { parse_mode: 'Markdown'});

            const automator = new GitHubAutomator(ctx, username, password, email, askUser);
            await automator.run();
            
            await safeDelete(ctx.chat.id, statusMsg.message_id);

        } catch (e) {
            console.error("AutoGH Crash:", e);
            ctx.reply(`❌ System Error: ${e.message}`);
        }
    })();
});

// --- COMMAND START ---
bot.start(async (ctx) => {
    try {
        const payload = ctx.startPayload;
        const user = getUser(ctx.from.id, payload);
        updateUser(ctx.from.id, { state: null, tempData: {} });

        let msg = `👋 *Halo, ${ctx.from.first_name}!*\n\nSelamat datang di Bot Dokumen.`;
        if (user.isNew && user.referrerId) msg += `\n🎁 Bonus Referral +1500 Koin!`;

        const btns = [
            ['💳 Generate KTM (Indo)', '🎓 Canva Education (K-12)'],
            ['👤 Profil Saya', '📅 Daily Check-in'],
            [`🔗 Link Referral Saya`],
            ['ℹ️ Info Bot', '🆘 Bantuan']
        ];

        if (ctx.from.id.toString() === process.env.OWNER_ID) {
            btns.push(['/autogh']);
        }

        ctx.replyWithMarkdown(msg, Markup.keyboard(btns).resize());
    } catch (e) {
        console.error("Start Error:", e);
    }
});

// ERROR HANDLING
bot.catch((err, ctx) => {
    // Error timeout 90000ms biasanya dari sini kalau koneksi lambat
    // Kita tangkap biar gak crash process
    console.error(`[BOT ERROR] ${ctx.updateType}`, err.message);
});

// START
console.log('🚀 BOT STARTING...');
bot.launch({ dropPendingUpdates: true })
   .then(() => console.log('✅ BOT STARTED!'))
   .catch(e => console.error("❌ Failed to start bot:", e));

// STOP
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// --- END OF FILE index.js ---