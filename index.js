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

// Error handling global yang lebih berisik
process.on('uncaughtException', (err) => console.error('🔥 CRITICAL UNCAUGHT:', err));
process.on('unhandledRejection', (reason) => console.error('🔥 CRITICAL REJECTION:', reason));

// Gunakan String untuk ID agar konsisten
const adminFlows = {}; 
const safeDelete = async (ctx, msgId) => { try { await ctx.deleteMessage(msgId); } catch (e) {} };

bot.use(session());

// --- MIDDLEWARE DEBUGGING UTAMA ---
bot.use(async (ctx, next) => {
    if (!ctx.from) return next();
    
    // Konversi ke String biar aman
    const userId = String(ctx.from.id);
    const text = ctx.message?.text;

    // LOG 1: Cek apakah pesan masuk
    if (text) {
        console.log(`[DEBUG] Pesan masuk dari ${userId}: "${text}"`);
        console.log(`[DEBUG] Status Flow saat ini:`, adminFlows[userId] ? adminFlows[userId].step : "TIDAK ADA FLOW");
    }

    getUser(ctx.from.id); 
    const user = getUser(ctx.from.id);

    // LOGIKA HANDLING FLOW ADMIN
    if (adminFlows[userId] && adminFlows[userId].step) {
        const flow = adminFlows[userId];

        if (!text) return; // Abaikan kalau bukan text (misal stiker)

        // Hapus pesan user biar rapi
        await safeDelete(ctx, ctx.message.message_id);
        if(flow.lastBotMsg) {
            await safeDelete(ctx, flow.lastBotMsg);
            delete flow.lastBotMsg; 
        }

        console.log(`[DEBUG] Memproses step: ${flow.step}`);

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
                
                // Mulai sesi baru
                const automator = new GitHubAutomator(ctx, { username, password, email });
                updateUser(userId, { ghSession: JSON.parse(automator.exportData()) });
                
                delete adminFlows[userId]; // Reset flow
                
                await ctx.reply(`✅ Data Tersimpan!\n👤 Target: ${username}`);
                showAdminPanel(ctx, automator);
                break;
            
            case 'WAITING_OTP':
                console.log("[DEBUG] Masuk case WAITING_OTP");
                if (flow.resolveOtp) {
                    console.log("[DEBUG] Resolver ditemukan, mengirim OTP ke automator...");
                    
                    // 1. Matikan timeout biar gak error double
                    if (flow.timeout) clearTimeout(flow.timeout);
                    
                    // 2. Beri feedback visual DULUAN biar user tau bot hidup
                    await ctx.reply("mbentarrr... lagi dikirim ke github 🔄");

                    // 3. Kirim data ke proses login yang sedang 'await'
                    flow.resolveOtp(text); 
                    
                    // 4. Bersihkan memory
                    delete flow.resolveOtp; 
                    // JANGAN delete adminFlows[userId] disini, biarkan runAutomatorStep yang handle
                    // flow.step = 'PROCESSING'; // Opsional: ubah status biar gak nerima input lagi
                } else {
                    console.log("[DEBUG] ANEH: Step WAITING_OTP ada, tapi function resolveOtp hilang!");
                    await ctx.reply("⚠️ Sesi OTP kadaluarsa/error. Coba login ulang.");
                    delete adminFlows[userId];
                }
                break;
        }
        return; // Stop middleware disini kalau sudah diproses
    }

    // Prioritas kedua: Wizard KTM/Canva
    if (user && user.state) {
        if (user.state.startsWith('CANVA_WIZARD_')) { await canvaHandler.handleWizardText(ctx); return; }
        if (user.state.startsWith('KTM_WIZARD_')) { await ktmHandler.handleWizardText(ctx); return; }
    }
    
    await next();
});

// Load Handlers
setupMenuHandler(bot);
setupAdminHandler(bot);
const ktmHandler = setupKTMHandler(bot);
const canvaHandler = setupCanvaHandler(bot);

// --- ADMIN PANEL FUNCTIONS ---
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
    const userId = String(ctx.chat.id); // Konsisten String
    const user = getUser(ctx.chat.id);
    if (!user.ghSession) return null;
    return new GitHubAutomator(ctx, null, user.ghSession);
};

const saveSession = (ctx, automator) => {
    updateUser(ctx.chat.id, { ghSession: JSON.parse(automator.exportData()) });
};

// --- ACTION HANDLERS ---

// Helper untuk OTP Callback
const createOtpCallback = (ctx) => (type) => {
    const userId = String(ctx.from.id);
    let prompt = type === 'authenticator' 
        ? "📱 Masukkan kode *Authenticator*:" 
        : "📩 Masukkan kode *Email*:";

    return new Promise((resolve, reject) => {
        ctx.reply(prompt, { parse_mode: 'Markdown' }).then((msg) => {
            console.log(`[DEBUG] Menunggu OTP dari user: ${userId}`);
            
            // Timeout 3 menit
            const timeoutId = setTimeout(() => {
                console.log(`[DEBUG] Timeout OTP untuk ${userId}`);
                if (adminFlows[userId]) delete adminFlows[userId];
                reject(new Error("Kelamaan ngisinya bos (Timeout)"));
            }, 180000); 

            adminFlows[userId] = {
                step: 'WAITING_OTP',
                resolveOtp: resolve,
                lastBotMsg: msg.message_id,
                timeout: timeoutId
            };
        });
    });
};

// Helper Wrapper untuk Step Automator
async function runAutomatorStep(ctx, stepFunction, successMessage) {
    const userId = String(ctx.from.id);
    const auto = getAutomator(ctx);
    
    if (!auto) {
        return ctx.answerCbQuery('Buat Data Baru dulu!', { show_alert: true });
    }
    
    await ctx.answerCbQuery();
    await ctx.reply(`🚀 Sabar, lagi proses...`);

    // Bersihkan flow lama jika ada (kecuali session data)
    if (adminFlows[userId]) delete adminFlows[userId];

    try {
        const result = await stepFunction(auto);
        saveSession(ctx, auto); // Simpan cookie terbaru
        
        const message = typeof successMessage === 'function' ? successMessage(auto, result) : successMessage;
        await ctx.reply(message, { parse_mode: 'Markdown' });
        
    } catch (e) {
        console.error(`[ERROR EXECUTION]`, e);
        await ctx.reply(`❌ GAGAL: ${e.message}`);
    } finally {
        // Hapus status WAITING_OTP jika masih nyangkut
        if (adminFlows[userId]) delete adminFlows[userId];
    }
}

// --- COMMANDS ---
bot.command('autogh', (ctx) => {
    if (ctx.from.id.toString() !== process.env.OWNER_ID) return;
    const automator = getAutomator(ctx);
    showAdminPanel(ctx, automator);
});

bot.action('gh_new', async (ctx) => {
    const userId = String(ctx.chat.id);
    await ctx.answerCbQuery();
    adminFlows[userId] = { step: 'WAITING_USERNAME' };
    const msg = await ctx.reply('🤖 Masukkan *Username GitHub*:');
    adminFlows[userId].lastBotMsg = msg.message_id;
});

bot.action('gh_1', (ctx) => runAutomatorStep(ctx, 
    (auto) => auto.runStep1_Login(createOtpCallback(ctx)), 
    (auto) => `✅ Login sukses: *${auto.config.username}*`
));

// ... (Action gh_2, gh_2fa, gh_3, gh_4 sama seperti sebelumnya, pakai runAutomatorStep)
bot.action('gh_2', (ctx) => runAutomatorStep(ctx, (auto) => auto.runStep2_Profile(), "✅ Profile Updated"));
bot.action('gh_3', (ctx) => runAutomatorStep(ctx, (auto) => auto.runStep3_Billing(), "✅ Billing Updated"));
bot.action('gh_4', (ctx) => runAutomatorStep(ctx, (auto) => auto.runStep4_Education(), "✅ Applied Student Pack"));

bot.start((ctx) => {
    getUser(ctx.from.id, ctx.startPayload);
    ctx.reply(`Halo bos!`, Markup.keyboard([['/autogh']]).resize());
});

bot.launch({ dropPendingUpdates: true });
console.log("🚀 Bot is running in DEBUG MODE...");
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));