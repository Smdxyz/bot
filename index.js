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

const bot = new Telegraf(process.env.BOT_TOKEN);
const inputEvents = new EventEmitter();
const waitingForInput = {}; 

// --- FUNGSI HELPER ADMIN (Ditaruh atas biar aman) ---
const safeDelete = async (chatId, msgId) => {
    try { await bot.telegram.deleteMessage(chatId, msgId); } catch (e) {}
};

const askUser = (chatId, question, isPassword = false) => {
    return new Promise(async (resolve) => {
        const qMsg = await bot.telegram.sendMessage(chatId, question, { parse_mode: 'Markdown' });
        waitingForInput[chatId] = true;
        
        // Timeout 2 menit biar gak gantung selamanya
        const timeout = setTimeout(() => {
            if(waitingForInput[chatId]) {
                delete waitingForInput[chatId];
                resolve(null); // Return null kalau timeout
                bot.telegram.sendMessage(chatId, "❌ Waktu habis. Silakan ulangi perintah.");
            }
        }, 120000);

        inputEvents.once(`input_${chatId}`, async (answer, answerMsgId) => {
            clearTimeout(timeout);
            delete waitingForInput[chatId];
            await safeDelete(chatId, answerMsgId);
            if (isPassword) await safeDelete(chatId, qMsg.message_id);
            resolve(answer);
        });
    });
};

// --- MIDDLEWARE PRIORITAS (Wajib Jalan Duluan) ---
bot.use(session());

bot.use(async (ctx, next) => {
    // 1. Pastikan User Ada di DB
    if (ctx.from) {
        try {
            getUser(ctx.from.id);
        } catch (e) {
            console.error("Database Error:", e.message);
            // Jangan stop bot, lanjut aja biar command lain bisa jalan
        }
    }

    // 2. Cek Input Text
    if (ctx.message && ctx.message.text) {
        const text = ctx.message.text;

        // A. JIKA ADMIN SEDANG INPUT DATA (Priority 1)
        if (waitingForInput[ctx.from.id] && !text.startsWith('/')) {
            inputEvents.emit(`input_${ctx.from.id}`, text, ctx.message.message_id);
            return; // Stop, jangan proses sebagai command lain
        }
        
        // B. JIKA SEDANG WIZARD (KTM/CANVA) (Priority 2)
        const user = getUser(ctx.from.id);
        if (user && user.state) {
             if (user.state.startsWith('CANVA_WIZARD_')) {
                await canvaHandler.handleWizardText(ctx);
                return;
            }
            if (user.state.startsWith('KTM_WIZARD_')) {
                await ktmHandler.handleWizardText(ctx);
                return;
            }
        }
    }

    // 3. Lanjut ke Handler Biasa (Menu, Command, dll)
    await next(); 
});

// --- LOAD MODUL ---
// Urutan ini penting!
setupMenuHandler(bot);  // Menu Profil, Cek in
setupAdminHandler(bot); // Admin Command
const ktmHandler = setupKTMHandler(bot); // KTM
const canvaHandler = setupCanvaHandler(bot); // Canva

// ==========================================================
// --- COMMAND ADMIN: /autogh ---
// ==========================================================
bot.command('autogh', async (ctx) => {
    const ownerId = process.env.OWNER_ID ? process.env.OWNER_ID.toString() : '';
    if (ctx.from.id.toString() !== ownerId) return;

    await safeDelete(ctx.chat.id, ctx.message.message_id);

    try {
        const username = await askUser(ctx.chat.id, '🤖 Masukkan *Username GitHub*:');
        if (!username) return; // Handle timeout/cancel

        const password = await askUser(ctx.chat.id, '🔑 Masukkan *Password GitHub*: (Auto Hapus)', true);
        if (!password) return;

        const email = await askUser(ctx.chat.id, '📧 Masukkan *Email Student*:');
        if (!email) return;

        const statusMsg = await ctx.reply('🚀 *Running GitHub Automator...*', { parse_mode: 'Markdown'});

        // Jalankan Automator
        const automator = new GitHubAutomator(ctx, username, password, email, askUser);
        await automator.run();
        
        await safeDelete(ctx.chat.id, statusMsg.message_id);

    } catch (e) {
        console.error("AutoGH Crash:", e);
        ctx.reply(`❌ System Error: ${e.message}`);
    }
});

// --- COMMAND START ---
bot.start(async (ctx) => {
    // Reset state biar gak nyangkut
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

        // Tombol Admin (Hidden)
        if (ctx.from.id.toString() === process.env.OWNER_ID) {
            btns.push(['/autogh']);
        }

        ctx.replyWithMarkdown(msg, Markup.keyboard(btns).resize());
    } catch (e) {
        console.error("Start Error:", e);
        ctx.reply("⚠️ Terjadi kesalahan saat memuat profil. Coba lagi.");
    }
});

// Listener Link Referral
bot.hears('🔗 Link Referral Saya', (ctx) => {
    const user = getUser(ctx.from.id);
    ctx.reply(`Link Anda:\nhttps://t.me/${ctx.botInfo.username}?start=${user.ref_code}`);
});

// ERROR HANDLING GLOBAL (Biar bot gak mati total kalau ada error)
bot.catch((err, ctx) => {
    console.error(`Ooops, encountered an error for ${ctx.updateType}`, err);
    // Jangan reply ke user kalau errornya aneh-aneh, cukup log di console
});

// JALANKAN
bot.launch({ dropPendingUpdates: true }).then(() => console.log('✅ BOT STARTED SUCCESSFULLY'));

// Graceful Stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// --- END OF FILE index.js ---