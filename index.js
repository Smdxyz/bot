// --- START OF FILE index.js ---

import 'dotenv/config';
import { Telegraf, Markup, session } from 'telegraf';
import { Prompt } from '@telegraf/prompt';
import { getUser, updateUser } from './lib/db.js';
import { GitHubAutomator } from './github_automator.js';

// Import Handlers
import { setupMenuHandler } from './handlers/menu.js';
import { setupAdminHandler } from './handlers/admin.js';
import { setupKTMHandler } from './handlers/ktm.js';
import { setupCanvaHandler } from './handlers/canva.js';

const bot = new Telegraf(process.env.BOT_TOKEN);
const prompt = new Prompt();

// --- MIDDLEWARE ---
bot.use(session());
bot.use(prompt.middleware());

bot.use(async (ctx, next) => {
    if (ctx.from && ctx.message && ctx.message.text && !ctx.message.text.startsWith('/')) {
        // Logika getUser Anda, pastikan ini tidak mengganggu wizard
        const user = getUser(ctx.from.id);
        if(!user.state) { // Hanya proses jika tidak dalam state wizard
           // Lakukan sesuatu jika perlu
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
// --- COMMAND BARU & DIUBAH: /autogh ---
// ==========================================================
bot.command('autogh', async (ctx) => {
    if (ctx.from.id.toString() !== process.env.OWNER_ID) {
        return ctx.reply("⛔️ Perintah ini hanya untuk admin.");
    }
    
    try {
        await ctx.deleteMessage().catch(()=>{}); // Hapus command /autogh

        const username = await ctx.prompt.text('🤖 Silakan masukkan *username* GitHub Anda:', { parse_mode: 'Markdown' });
        await ctx.deleteMessage(ctx.message.message_id + 1).catch(()=>{});

        const password = await ctx.prompt.text('🔑 Silakan masukkan *password* GitHub Anda: (pesan akan dihapus)', {
            parse_mode: 'Markdown',
            on_message_sent: (sentMessage) => {
                setTimeout(() => ctx.telegram.deleteMessage(ctx.chat.id, sentMessage.message_id).catch(()=>{}), 2000);
            }
        });
        await ctx.deleteMessage(ctx.message.message_id + 2).catch(()=>{});
        
        const email = await ctx.prompt.text('📧 Masukkan *email student* untuk pendaftaran (contoh: student@campus.edu):', { parse_mode: 'Markdown' });
        await ctx.deleteMessage(ctx.message.message_id + 3).catch(()=>{});

        await ctx.reply('🚀 *Memulai Proses Otomatisasi GitHub...*\nIni akan memakan waktu beberapa menit. Saya akan memberikan update di setiap langkah.', { parse_mode: 'Markdown'});

        const automator = new GitHubAutomator(ctx, username, password, email);
        const result = await automator.run();

        if (result.success) {
            await ctx.reply('✅ *SELURUH PROSES SELESAI!*\nSemua langkah telah berhasil dijalankan. Recovery codes telah dikirim dalam file terpisah.', { parse_mode: 'Markdown' });
        } else {
            await ctx.reply('⚠️ Proses dihentikan karena terjadi kesalahan. Lihat pesan error di atas.');
        }

    } catch (e) {
        if (e.message.includes('timeout')) {
            await ctx.reply("❌ Waktu habis. Anda tidak memasukkan input dalam 60 detik. Silakan ulangi /autogh.");
        } else {
            console.error("Error pada command /autogh:", e);
            await ctx.reply(`Terjadi kesalahan tak terduga: ${e.message}`);
        }
    }
});


// --- COMMAND START (DENGAN LOGIKA REFERRAL) ---
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
    // Hanya tampilkan tombol /autogh untuk admin
    if (ctx.from.id.toString() === process.env.OWNER_ID) {
        keyboard.splice(3, 0, ['/autogh']);
    }

    welcomeMsg += `\n\nSilakan pilih salah satu menu di bawah ini:`;
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

// ==========================================================
// CENTRAL TEXT LISTENER (ROUTER UNTUK WIZARD)
// ==========================================================
bot.on('text', async (ctx) => {
    if(!ctx.from) return; // Abaikan jika bukan dari user
    
    const user = getUser(ctx.from.id);
    const text = ctx.message.text;

    // Abaikan jika user sedang tidak dalam state wizard
    if (!user.state) return;
    
    // 1. ROUTER: Arahkan ke handler Canva jika state-nya cocok
    if (user.state.startsWith('CANVA_WIZARD_')) {
        canvaHandler.handleWizardText(ctx);
        return;
    }

    // 2. ROUTER: Arahkan ke handler KTM jika state-nya cocok
    if (user.state.startsWith('KTM_WIZARD_')) {
        ktmHandler.handleWizardText(ctx);
        return;
    }
});


// JALANKAN BOT
bot.launch().then(() => console.log('🚀 BOT MODULAR SIAP BERAKSI!'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// --- END OF FILE index.js ---