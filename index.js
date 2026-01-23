// --- START OF FILE index.js ---

import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import { getUser, updateUser } from './lib/db.js';
import { EventEmitter } from 'events'; // Native Node.js, gak perlu install

// BARU: Impor Automator
import { GitHubAutomator } from './github_automator.js';

// Import Handlers
import { setupMenuHandler } from './handlers/menu.js';
import { setupAdminHandler } from './handlers/admin.js';
import { setupKTMHandler } from './handlers/ktm.js';
import { setupCanvaHandler } from './handlers/canva.js';

const bot = new Telegraf(process.env.BOT_TOKEN);

// --- SISTEM PROMPT MANUAL (PENGGANTI @telegraf/prompt) ---
const inputEvents = new EventEmitter();
const waitingForInput = {}; // Menyimpan status user yang sedang diajak ngobrol

// Fungsi helper untuk bertanya dan menunggu jawaban
const askUser = (chatId, question, isPassword = false) => {
    return new Promise(async (resolve) => {
        // Kirim pertanyaan
        const msg = await bot.telegram.sendMessage(chatId, question, { parse_mode: 'Markdown' });
        
        // Tandai user ini sedang menunggu input
        waitingForInput[chatId] = true;

        // Listener sekali pakai untuk jawaban
        inputEvents.once(`input_${chatId}`, async (answer, msgId) => {
            delete waitingForInput[chatId]; // Hapus status menunggu
            
            // Hapus pesan input user biar bersih (opsional)
            try {
                await bot.telegram.deleteMessage(chatId, msgId);
                if (isPassword) await bot.telegram.deleteMessage(chatId, msg.message_id); // Hapus pertanyaan password juga
            } catch (e) {}

            resolve(answer);
        });
    });
};

// --- MIDDLEWARE ---
bot.use(async (ctx, next) => {
    // Cek apakah user ada di DB
    if (ctx.from && ctx.message && ctx.message.text && !ctx.message.text.startsWith('/')) {
        // Jika user sedang dalam mode tanya-jawab admin, jangan proses command lain/DB
        if (waitingForInput[ctx.from.id]) {
            inputEvents.emit(`input_${ctx.from.id}`, ctx.message.text, ctx.message.message_id);
            return; // Stop di sini, jangan lanjut ke handler lain
        }
        
        const user = getUser(ctx.from.id);
        // Router untuk Wizard Canva/KTM (jika ada state)
        if (user.state && user.state.startsWith('CANVA_WIZARD_')) {
            canvaHandler.handleWizardText(ctx);
            return;
        }
        if (user.state && user.state.startsWith('KTM_WIZARD_')) {
            ktmHandler.handleWizardText(ctx);
            return;
        }
    }
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
    // Security Check
    if (ctx.from.id.toString() !== process.env.OWNER_ID) {
        return ctx.reply("⛔️ Perintah ini hanya untuk admin.");
    }
    
    try {
        await ctx.deleteMessage().catch(()=>{});

        // Pakai fungsi askUser buatan kita sendiri
        const username = await askUser(ctx.chat.id, '🤖 Silakan masukkan *Username GitHub*:');
        const password = await askUser(ctx.chat.id, '🔑 Silakan masukkan *Password GitHub*: (Pesan ini akan dihapus)', true);
        const email = await askUser(ctx.chat.id, '📧 Masukkan *Email Student* (wajib akses inbox):');

        await ctx.reply('🚀 *Memulai Proses Otomatisasi...*\n_Duduk manis, biarkan bot bekerja._', { parse_mode: 'Markdown'});

        // Inisialisasi Automator dengan fungsi askUser agar bisa minta OTP nanti
        const automator = new GitHubAutomator(ctx, username, password, email, askUser);
        const result = await automator.run();

        if (result.success) {
            await ctx.reply('✅ *SUKSES BESAR!* Akun GitHub Education sedang diproses. Cek file recovery codes di atas.', { parse_mode: 'Markdown' });
        } else {
            await ctx.reply('⚠️ Proses berhenti. Cek log error.');
        }

    } catch (e) {
        console.error("AutoGH Error:", e);
        ctx.reply(`Error: ${e.message}`);
    }
});

// --- COMMAND START ---
bot.start(async (ctx) => {
    const payload = ctx.startPayload;
    const user = getUser(ctx.from.id, payload);
    updateUser(ctx.from.id, { state: null, tempData: {} });

    let welcomeMsg = `👋 *Halo, ${ctx.from.first_name}!*\n\nSelamat datang di Bot Dokumen All-in-One.`;
    if (user.isNew && user.referrerId) {
        welcomeMsg += `\n\n🎁 *BONUS REFERRAL!* +1500 Koin!`;
        bot.telegram.sendMessage(user.referrerId, `🎉 Referral Sukses! +3000 Koin`).catch(e => {});
    }

    let keyboard = [
        ['💳 Generate KTM (Indo)', '🎓 Canva Education (K-12)'],
        ['👤 Profil Saya', '📅 Daily Check-in'],
        [`🔗 Link Referral Saya`],
        ['ℹ️ Info Bot', '🆘 Bantuan']
    ];
    if (ctx.from.id.toString() === process.env.OWNER_ID) {
        keyboard.splice(3, 0, ['/autogh']); // Menu rahasia admin
    }

    ctx.replyWithMarkdown(welcomeMsg, Markup.keyboard(keyboard).resize());
});

// Listener Tombol
bot.hears('🔗 Link Referral Saya', (ctx) => {
    const user = getUser(ctx.from.id);
    ctx.reply(`🔗 Link: https://t.me/${ctx.botInfo.username}?start=${user.ref_code}`);
});

// JALANKAN BOT
bot.launch().then(() => console.log('🚀 BOT MODULAR SIAP & LEBIH KUAT!'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));