// --- START OF FILE index.js ---

import 'dotenv/config';
import { Telegraf, Markup, session } from 'telegraf';
import { getUser, updateUser } from './lib/db.js';
import { EventEmitter } from 'events';

// BARU: Impor Automator
import { GitHubAutomator } from './github_automator.js';

// Import Handlers
import { setupMenuHandler } from './handlers/menu.js';
import { setupAdminHandler } from './handlers/admin.js';
import { setupKTMHandler } from './handlers/ktm.js';
import { setupCanvaHandler } from './handlers/canva.js';

const bot = new Telegraf(process.env.BOT_TOKEN);

// --- SISTEM TANYA JAWAB MANUAL (EVENT BASED) ---
const inputEvents = new EventEmitter();
const waitingForInput = {}; 

// Fungsi helper hapus pesan biar gak error kalau pesan udah ilang
const safeDelete = async (chatId, msgId) => {
    try {
        await bot.telegram.deleteMessage(chatId, msgId);
    } catch (e) {
        // Abaikan error kalau pesan udah kehapus duluan
    }
};

// Fungsi Helper Bertanya
const askUser = (chatId, question, isPassword = false) => {
    return new Promise(async (resolve) => {
        // 1. Kirim Pertanyaan
        const qMsg = await bot.telegram.sendMessage(chatId, question, { parse_mode: 'Markdown' });
        
        // 2. Tandai lagi nunggu jawaban
        waitingForInput[chatId] = true;
        console.log(`[BOT] Menunggu input dari ${chatId}...`);

        // 3. Pasang kuping (listener) buat jawaban
        inputEvents.once(`input_${chatId}`, async (answer, answerMsgId) => {
            delete waitingForInput[chatId]; // Udah dijawab, hapus status nunggu
            
            // Hapus jawaban user biar bersih
            await safeDelete(chatId, answerMsgId);
            
            // Kalau ini password, hapus juga pertanyaannya biar rahasia
            if (isPassword) {
                await safeDelete(chatId, qMsg.message_id);
            }

            resolve(answer);
        });
    });
};

// --- MIDDLEWARE UTAMA ---
bot.use(session());

bot.use(async (ctx, next) => {
    // Cek apakah ini pesan teks biasa
    if (ctx.from && ctx.message && ctx.message.text && !ctx.message.text.startsWith('/')) {
        
        // A. CEK APAKAH LAGI MODE TANYA JAWAB ADMIN?
        if (waitingForInput[ctx.from.id]) {
            console.log(`[BOT] Menerima input dari ${ctx.from.first_name}: ${ctx.message.text}`);
            // Kirim sinyal ke function askUser di atas
            inputEvents.emit(`input_${ctx.from.id}`, ctx.message.text, ctx.message.message_id);
            return; // STOP DISINI, jangan diproses handler lain
        }
        
        // B. Kalau bukan mode admin, proses user biasa (DB & Wizard)
        const user = getUser(ctx.from.id);
        
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
    
    // Hapus command /autogh nya
    await safeDelete(ctx.chat.id, ctx.message.message_id);

    try {
        console.log(`[AUTOGH] Memulai sesi untuk ${ctx.from.first_name}`);

        // 1. Tanya Username
        const username = await askUser(ctx.chat.id, '🤖 Silakan masukkan *Username GitHub*:');
        
        // 2. Tanya Password
        const password = await askUser(ctx.chat.id, '🔑 Silakan masukkan *Password GitHub*: (Pesan ini akan dihapus otomatis)', true);
        
        // 3. Tanya Email
        const email = await askUser(ctx.chat.id, '📧 Masukkan *Email Student* (wajib akses inbox):');

        // Konfirmasi mulai
        const statusMsg = await ctx.reply('🚀 *Memulai Proses Otomatisasi...*\n_Mohon tunggu, bot sedang bekerja di server..._', { parse_mode: 'Markdown'});

        // Inisialisasi Automator
        // Kita passing 'askUser' supaya automator bisa nanya OTP kalau butuh
        const automator = new GitHubAutomator(ctx, username, password, email, askUser);
        const result = await automator.run();

        if (result.success) {
            await ctx.reply('✅ *SUKSES BESAR!* Akun GitHub Education sedang diproses. Cek file recovery codes di atas.', { parse_mode: 'Markdown' });
        } else {
            await ctx.reply('⚠️ Proses berhenti. Cek log error di atas.');
        }
        
        // Hapus pesan "sedang bekerja" biar bersih
        await safeDelete(ctx.chat.id, statusMsg.message_id);

    } catch (e) {
        console.error("AutoGH Error:", e);
        ctx.reply(`❌ Error Fatal: ${e.message}`);
    }
});

// --- COMMAND START ---
bot.start(async (ctx) => {
    const payload = ctx.startPayload;
    const user = getUser(ctx.from.id, payload);
    updateUser(ctx.from.id, { state: null, tempData: {} });

    let welcomeMsg = `👋 *Halo, ${ctx.from.first_name}!*\n\nSelamat datang di Bot Dokumen All-in-One.`;
    
    if (user.isNew && user.referrerId) {
        welcomeMsg += `\n\n🎁 *BONUS REFERRAL!* Kamu diundang dan mendapat +1500 Koin tambahan!\nTotal Saldo Awal: ${user.balance} Koin`;
        bot.telegram.sendMessage(user.referrerId, `🎉 *Referral Sukses!*\nTemanmu ${ctx.from.first_name} telah bergabung. Kamu mendapatkan +3000 Koin!`, { parse_mode: 'Markdown' }).catch(e => {});
    }

    let keyboard = [
        ['💳 Generate KTM (Indo)', '🎓 Canva Education (K-12)'],
        ['👤 Profil Saya', '📅 Daily Check-in'],
        [`🔗 Link Referral Saya`],
        ['ℹ️ Info Bot', '🆘 Bantuan']
    ];
    // Hanya tampilkan tombol /autogh untuk admin di keyboard (opsional)
    if (ctx.from.id.toString() === process.env.OWNER_ID) {
        keyboard.push(['/autogh']); 
    }

    ctx.replyWithMarkdown(welcomeMsg, Markup.keyboard(keyboard).resize());
});

// Listener Tombol Link Referral
bot.hears('🔗 Link Referral Saya', (ctx) => {
    const user = getUser(ctx.from.id);
    const link = `https://t.me/${ctx.botInfo.username}?start=${user.ref_code}`;
    ctx.reply(
        `🔗 *Link Referral Anda:*\n\`${link}\`\n\n` +
        `Bagikan link ini ke teman Anda. Jika mereka bergabung melalui link ini:\n` +
        `💰 Anda akan mendapatkan: *3000 Koin*\n` +
        `💰 Teman Anda akan mendapatkan: *1500 Koin*`,
        { parse_mode: 'Markdown' }
    );
});

// JALANKAN BOT
bot.launch().then(() => console.log('🚀 BOT MODULAR SIAP!'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// --- END OF FILE index.js ---