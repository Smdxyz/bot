// --- START OF FILE index.js ---

import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import { getUser, updateUser } from './lib/db.js';

// Import Handlers
import { setupMenuHandler } from './handlers/menu.js';
import { setupAdminHandler } from './handlers/admin.js';
import { setupKTMHandler } from './handlers/ktm.js';
import { setupCanvaHandler } from './handlers/canva.js';

const bot = new Telegraf(process.env.BOT_TOKEN);

// --- MIDDLEWARE ---
bot.use(async (ctx, next) => {
    // Middleware ini memastikan data user ada saat memproses pesan biasa
    if (ctx.from && ctx.message && ctx.message.text && !ctx.message.text.startsWith('/start')) {
        getUser(ctx.from.id);
    }
    await next();
});

// --- LOAD HANDLERS ---
setupMenuHandler(bot);
setupAdminHandler(bot);
// Muat handler dan simpan fungsi yang diexport
const ktmHandler = setupKTMHandler(bot);
const canvaHandler = setupCanvaHandler(bot);

// --- COMMAND START (DENGAN LOGIKA REFERRAL) ---
bot.start(async (ctx) => {
    const payload = ctx.startPayload;
    const user = getUser(ctx.from.id, payload);

    // Reset state jika user start ulang untuk menghindari wizard macet
    updateUser(ctx.from.id, { state: null, tempData: {} });

    let welcomeMsg = `👋 *Halo, ${ctx.from.first_name}!*\n\nSelamat datang di Bot Dokumen All-in-One.`;
    
    if (user.isNew && user.referrerId) {
        welcomeMsg += `\n\n🎁 *BONUS REFERRAL!* Kamu diundang dan mendapat +1500 Koin tambahan!\nTotal Saldo Awal: ${user.balance} Koin`;
        bot.telegram.sendMessage(user.referrerId, `🎉 *Referral Sukses!*\nTemanmu ${ctx.from.first_name} telah bergabung. Kamu mendapatkan +3000 Koin!`, { parse_mode: 'Markdown' }).catch(e => {});
    }

    welcomeMsg += `\n\nSilakan pilih salah satu menu di bawah ini:`;

    ctx.replyWithMarkdown(
        welcomeMsg,
        Markup.keyboard([
            ['💳 Generate KTM (Indo)', '🎓 Canva Education (K-12)'],
            ['👤 Profil Saya', '📅 Daily Check-in'],
            [`🔗 Link Referral Saya`],
            ['ℹ️ Info Bot', '🆘 Bantuan']
        ]).resize()
    );
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
    const user = getUser(ctx.from.id);
    const text = ctx.message.text;

    // 1. ROUTER: Arahkan ke handler Canva jika state-nya cocok
    if (user.state && user.state.startsWith('CANVA_WIZARD_')) {
        canvaHandler.handleWizardText(ctx);
        return;
    }

    // 2. ROUTER: Arahkan ke handler KTM jika state-nya cocok
    if (user.state && user.state.startsWith('KTM_WIZARD_')) {
        ktmHandler.handleWizardText(ctx);
        return;
    }

    // 3. FALLBACK: Handle input manual KTM format lama (fitur power user)
    if (text.includes('|') && !user.state) {
        const parts = text.split('|').map(s => s.trim());
        if (parts.length < 3) return ctx.reply('⚠️ Format cepat: `Univ | Nama | Gender`', { parse_mode: 'Markdown' });
        
        const manualData = { univName: parts[0], fullName: parts[1], gender: parts[2] };
        ktmHandler.processKTM(ctx, 'manual', manualData);
    }
});


// JALANKAN BOT
bot.launch().then(() => console.log('🚀 BOT MODULAR SIAP BERAKSI!'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// --- END OF FILE index.js ---