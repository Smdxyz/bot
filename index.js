// --- START OF FILE index.js ---

import 'dotenv/config';
import { Telegraf, Markup, session } from 'telegraf';
import { getUser, updateUser } from './lib/db.js';
import { GitHubAutomator } from './services/github/automator.js';

// Import Handlers
import { setupMenuHandler } from './handlers/menu.js';
import { setupAdminHandler } from './handlers/admin.js';
import { setupKTMHandler } from './handlers/ktm.js';
import { setupCanvaHandler } from './handlers/canva.js';

const bot = new Telegraf(process.env.BOT_TOKEN, { handlerTimeout: 900000 });

process.on('uncaughtException', (err) => console.error('🔥 Uncaught:', err));
process.on('unhandledRejection', (reason) => console.error('🔥 Rejection:', reason));

const adminFlows = {}; 
const safeDelete = async (ctx, msgId) => { try { await ctx.deleteMessage(msgId); } catch (e) {} };

bot.use(session());

bot.use(async (ctx, next) => {
    if (!ctx.from) return next();
    const userId = ctx.from.id;
    
    // Inisialisasi user di awal
    getUser(userId); 
    const user = getUser(userId);

    // Prioritas utama: Menangani input untuk alur admin yang aktif
    if (adminFlows[userId] && adminFlows[userId].step) {
        const flow = adminFlows[userId];
        const text = ctx.message?.text;

        if (!text) { // Abaikan update non-teks
            return;
        }

        await safeDelete(ctx, ctx.message.message_id);
        if(flow.lastBotMsg) {
            await safeDelete(ctx, flow.lastBotMsg);
            delete flow.lastBotMsg; // Hapus setelah digunakan
        }

        switch (flow.step) {
            case 'WAITING_USERNAME':
                flow.username = text;
                flow.step = 'WAITING_PASSWORD';
                const msgPass = await ctx.reply('🔑 Masukkan *Password*: (Auto Hapus)', { parse_mode: 'Markdown' });
                flow.lastBotMsg = msgPass.message_id;
                break;

            case 'WAITING_PASSWORD':
                flow.password = text;
                flow.step = 'WAITING_EMAIL';
                const msgEmail = await ctx.reply('📧 Masukkan *Email Student*: (Auto Hapus)', { parse_mode: 'Markdown' });
                flow.lastBotMsg = msgEmail.message_id;
                break;

            case 'WAITING_EMAIL':
                flow.email = text;
                
                const { username, password, email } = flow;
                const automator = new GitHubAutomator(ctx, { username, password, email });
                
                updateUser(userId, { ghSession: JSON.parse(automator.exportData()) });
                delete adminFlows[userId]; // Selesaikan alur
                
                await ctx.reply(`✅ Data Tersimpan di Database!\n👤 Target: ${username}`);
                showAdminPanel(ctx, automator);
                break;
            
            case 'WAITING_OTP':
                if (flow.resolveOtp) {
                    flow.resolveOtp(text); // Kirim OTP ke Promise yang sedang menunggu
                    // Hapus state setelah OTP terkirim, biarkan proses async berlanjut
                    delete flow.resolveOtp; 
                    flow.step = null; 
                    await ctx.reply("🔄 Memproses OTP...");
                }
                break;
        }
        return; // Hentikan middleware di sini karena input sudah diproses
    }

    // Prioritas kedua: Menangani input untuk wizard KTM/Canva
    if (user && user.state) {
        if (user.state.startsWith('CANVA_WIZARD_')) { await canvaHandler.handleWizardText(ctx); return; }
        if (user.state.startsWith('KTM_WIZARD_')) { await ktmHandler.handleWizardText(ctx); return; }
    }
    
    // Jika tidak ada alur aktif, lanjutkan ke handler Telegraf lainnya (.command, .hears)
    await next();
});

// Load Handlers
setupMenuHandler(bot);
setupAdminHandler(bot);
const ktmHandler = setupKTMHandler(bot);
const canvaHandler = setupCanvaHandler(bot);

// --- ADMIN PANEL ---
const showAdminPanel = (ctx, automator) => {
    let status = "🔴 TIDAK AKTIF";
    if (automator?.config?.username) {
        status = `🟢 AKTIF (${automator.config.username})`;
    }

    ctx.reply(
        `🛠 *GITHUB PANEL (DB MODE)*\nStatus: ${status}\n\n👇 *PILIH TAHAPAN:*`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🆕 Data Baru', 'gh_new')],
            [Markup.button.callback('1️⃣ Login', 'gh_1'), Markup.button.callback('2️⃣ Profile', 'gh_2')],
            [Markup.button.callback('🔐 Setup 2FA', 'gh_2fa'), Markup.button.callback('3️⃣ Billing', 'gh_3')],
            [Markup.button.callback('4️⃣ Apply Edu', 'gh_4')]
        ])
    });
};

const getAutomator = (ctx) => {
    const user = getUser(ctx.chat.id);
    if (!user.ghSession) {
        return null;
    }
    return new GitHubAutomator(ctx, null, user.ghSession);
};

const saveSession = (ctx, automator) => {
    updateUser(ctx.chat.id, { ghSession: JSON.parse(automator.exportData()) });
};

bot.command('autogh', (ctx) => {
    if (ctx.from.id.toString() !== process.env.OWNER_ID) return;
    const automator = getAutomator(ctx);
    showAdminPanel(ctx, automator);
});

bot.action('gh_new', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(()=>{});
    adminFlows[ctx.chat.id] = { step: 'WAITING_USERNAME' };
    const msg = await ctx.reply('🤖 Masukkan *Username GitHub*: (Auto Hapus)', { parse_mode: 'Markdown' });
    adminFlows[ctx.chat.id].lastBotMsg = msg.message_id;
});

// Fungsi terpusat untuk membuat callback OTP
const createOtpCallback = (ctx) => (type) => {
    let prompt;
    if (type === 'authenticator_setup') {
        prompt = "📱 Scan QR / gunakan Setup Key, lalu masukkan 6-digit kode dari *Authenticator App* Anda:";
    } else if (type === 'authenticator') {
        prompt = "📱 Masukkan kode dari *Authenticator App* Anda:";
    } else {
        prompt = "📩 Masukkan kode verifikasi dari *Email* Anda:";
    }

    return new Promise(async (resolve) => {
        const msg = await ctx.reply(prompt, { parse_mode: 'Markdown' });
        adminFlows[ctx.from.id] = {
            step: 'WAITING_OTP',
            resolveOtp: resolve,
            lastBotMsg: msg.message_id,
        };
    });
};

// === PERBAIKAN LOGIKA ERROR HANDLING DI SEMUA ACTION HANDLER ===

async function runAutomatorStep(ctx, stepFunction, successMessage) {
    const auto = getAutomator(ctx);
    if (!auto) {
        await ctx.answerCbQuery('Sesi tidak ditemukan. Buat data baru dulu.', { show_alert: true });
        return;
    }
    
    await ctx.answerCbQuery();
    await ctx.reply(`🚀 Memulai proses...`);

    try {
        const result = await stepFunction(auto);
        saveSession(ctx, auto);
        await ctx.reply(successMessage(auto, result), { parse_mode: 'Markdown' });
    } catch (e) {
        console.error(`🔥 Error pada step: ${e.stack}`);
        await ctx.reply(`❌ Terjadi error: ${e.message}`);
    } finally {
        // Bersihkan state menunggu OTP jika ada, untuk mencegah bot stuck
        if (adminFlows[ctx.from.id]?.step === 'WAITING_OTP') {
            delete adminFlows[ctx.from.id];
        }
    }
}

bot.action('gh_1', async (ctx) => {
    await runAutomatorStep(
        ctx,
        (auto) => auto.runStep1_Login(createOtpCallback(ctx)),
        (auto) => `✅ Login sebagai *${auto.config.username}* berhasil! Sesi disimpan.`
    );
});

bot.action('gh_2', async (ctx) => {
    await runAutomatorStep(
        ctx,
        (auto) => auto.runStep2_Profile(),
        (auto) => `✅ Step 2 Selesai. Nama profil telah diatur menjadi *${auto.config.fullName}*.`
    );
});

bot.action('gh_2fa', async (ctx) => {
    await runAutomatorStep(
        ctx,
        (auto) => auto.runStep2_5_2FASetup(), // Tidak perlu OTP callback lagi
        (auto, result) => {
            const { setupKey, recoveryCodes } = result;
            const fileContent = `Two-Factor Authentication Setup for GitHub: ${auto.config.username}\n\n` +
                                `===================================================\n` +
                                `IMPORTANT: Simpan informasi ini di tempat yang aman.\n` +
                                `===================================================\n\n` +
                                `Setup Key (untuk dimasukkan manual ke authenticator app):\n${setupKey}\n\n` +
                                `Recovery Codes (jika Anda kehilangan akses ke authenticator):\n` +
                                `${recoveryCodes.join('\n')}\n`;

            ctx.replyWithDocument(
                { source: Buffer.from(fileContent, 'utf-8'), filename: `github-2fa-recovery-${auto.config.username}.txt` },
                { caption: `✅ 2FA berhasil diaktifkan! **SIMPAN FILE INI DENGAN AMAN!**` }
            );
            return '✅ Step 2.5 Selesai. File recovery dikirim.';
        }
    );
});

bot.action('gh_3', async (ctx) => {
    await runAutomatorStep(
        ctx,
        (auto) => auto.runStep3_Billing(),
        () => "✅ Step 3 Selesai. Informasi penagihan telah disimpan."
    );
});

bot.action('gh_4', async (ctx) => {
    await runAutomatorStep(
        ctx,
        (auto) => auto.runStep4_Education(),
        () => "✅ Step 4 (Final) Selesai. Aplikasi GitHub Student Developer Pack telah berhasil dikirim dan sedang ditinjau."
    );
});

bot.start(async (ctx) => {
    getUser(ctx.from.id, ctx.startPayload);
    updateUser(ctx.from.id, { state: null });
    let kb = [['💳 Generate KTM (Indo)', '🎓 Canva Education (K-12)'], ['👤 Profil Saya', '📅 Daily Check-in'], ['ℹ️ Info Bot', '🆘 Bantuan']];
    if (ctx.from.id.toString() === process.env.OWNER_ID) kb.push(['/autogh']);
    
    ctx.reply(`Halo ${ctx.from.first_name}! Selamat datang.`, Markup.keyboard(kb).resize());
});

bot.launch({ dropPendingUpdates: true });
console.log("🚀 Bot is running...");
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
// --- END OF FILE index.js ---