// --- START OF FILE index.js ---

import 'dotenv/config';
import { Telegraf, Markup, session } from 'telegraf';
import { getUser, updateUser } from './lib/db.js';
import axios from 'axios';
import { GitHubAutomator } from './github_automator.js';

// Import Handlers
import { setupMenuHandler } from './handlers/menu.js';
import { setupAdminHandler } from './handlers/admin.js';
import { setupKTMHandler } from './handlers/ktm.js';
import { setupCanvaHandler } from './handlers/canva.js';

const bot = new Telegraf(process.env.BOT_TOKEN, { handlerTimeout: 900000 });

// Global Error Handler (Biar PM2 gak restart terus)
process.on('uncaughtException', (err) => console.error('🔥 Uncaught:', err));
process.on('unhandledRejection', (reason) => console.error('🔥 Rejection:', reason));

const adminSessions = {}; // Hanya untuk input sementara (username/pass/email)
const safeDelete = async (ctx, msgId) => { try { await ctx.deleteMessage(msgId); } catch (e) {} };

// --- MIDDLEWARE ---
bot.use(session());

bot.use(async (ctx, next) => {
    if (ctx.from) try { getUser(ctx.from.id); } catch (e) {}

    if (ctx.message && ctx.message.text) {
        const text = ctx.message.text;
        const userId = ctx.from.id;
        const user = getUser(userId);

        // A. JALUR ADMIN (INPUT DATA)
        if (adminSessions[userId] && adminSessions[userId].step) {
            const step = adminSessions[userId].step;
            await safeDelete(ctx, ctx.message.message_id);

            if (step === 'WAITING_USERNAME') {
                adminSessions[userId].username = text;
                adminSessions[userId].step = 'WAITING_PASSWORD';
                const msg = await ctx.reply('🔑 Masukkan *Password*: (Auto Hapus)', { parse_mode: 'Markdown' });
                adminSessions[userId].lastBotMsg = msg.message_id;
            } 
            else if (step === 'WAITING_PASSWORD') {
                adminSessions[userId].password = text;
                adminSessions[userId].step = 'WAITING_EMAIL';
                if(adminSessions[userId].lastBotMsg) await safeDelete(ctx, adminSessions[userId].lastBotMsg);
                await ctx.reply('📧 Masukkan *Email Student*:');
            } 
            else if (step === 'WAITING_EMAIL') {
                adminSessions[userId].email = text;
                adminSessions[userId].step = null;
                
                // BUAT DATA & SIMPAN KE DB
                const { username, password, email } = adminSessions[userId];
                const automator = new GitHubAutomator(ctx, username, password, email);
                
                // Simpan state awal ke DB
                updateUser(userId, { ghSession: JSON.parse(automator.exportState()) });
                
                await ctx.reply(`✅ Data Tersimpan di Database!\n👤 Target: ${username}`);
                showAdminPanel(ctx, automator);
            }
            else if (step === 'WAITING_OTP') {
                // Restore automator dari DB buat handle OTP
                if (user.ghSession) {
                    const automator = new GitHubAutomator(ctx, null, null, null, user.ghSession);
                    // Kita oper OTP via emit atau callback sederhana
                    // Karena struktur baru, kita selesaikan Promise manual di automator
                    if (global.otpResolver && global.otpUserId === userId) {
                        global.otpResolver(text);
                        global.otpResolver = null;
                        adminSessions[userId].step = null;
                        await ctx.reply("🔄 Memproses OTP...");
                    }
                }
            }
            return;
        }

        // B. WIZARD MENU
        if (user && user.state) {
            if (user.state.startsWith('CANVA_WIZARD_')) { await canvaHandler.handleWizardText(ctx); return; }
            if (user.state.startsWith('KTM_WIZARD_')) { await ktmHandler.handleWizardText(ctx); return; }
        }
    }
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
    if (automator && automator.profile) status = `🟢 AKTIF (${automator.profile.fullName})`;

    ctx.reply(
        `🛠 *GITHUB PANEL (DB MODE)*\nStatus: ${status}\n\n👇 *PILIH TAHAPAN:*`,
        Markup.inlineKeyboard([
            [Markup.button.callback('🆕 Data Baru', 'gh_new')],
            [Markup.button.callback('1️⃣ Login', 'gh_1'), Markup.button.callback('2️⃣ Profile', 'gh_2')],
            [Markup.button.callback('3️⃣ Billing', 'gh_3'), Markup.button.callback('4️⃣ Apply Edu', 'gh_4')]
        ])
    );
};

// Helper Rehydrate Automator
const getAutomator = (ctx) => {
    const user = getUser(ctx.chat.id);
    if (!user.ghSession) {
        ctx.reply("⚠️ Tidak ada sesi di database. Klik '🆕 Data Baru'.");
        return null;
    }
    // Rehydrate dari JSON DB
    return new GitHubAutomator(ctx, null, null, null, user.ghSession);
};

// Helper Save Session
const saveSession = (ctx, automator) => {
    updateUser(ctx.chat.id, { ghSession: JSON.parse(automator.exportState()) });
};

bot.command('autogh', (ctx) => {
    if (ctx.from.id.toString() !== process.env.OWNER_ID) return;
    const automator = getAutomator(ctx); // Coba load kalau ada
    showAdminPanel(ctx, automator); // Tetap show panel walau null
});

bot.action('gh_new', async (ctx) => {
    ctx.answerCbQuery();
    await ctx.deleteMessage();
    adminSessions[ctx.chat.id] = { step: 'WAITING_USERNAME' };
    ctx.reply('🤖 Masukkan *Username GitHub*:');
});

// STEP 1: Login
bot.action('gh_1', async (ctx) => {
    const auto = getAutomator(ctx);
    if(!auto) return;
    ctx.answerCbQuery();
    
    // Callback OTP khusus
    auto.setOtpCallback(() => {
        adminSessions[ctx.chat.id] = { step: 'WAITING_OTP' };
        return ctx.reply("📩 Masukkan *OTP Email* GitHub sekarang:");
    });

    try {
        await auto.step1_Login();
        saveSession(ctx, auto); // SAVE KE DB SETELAH SUKSES
    } catch(e) {
        ctx.reply(`❌ Error Step 1: ${e.message}`);
    }
});

// STEP 2: Profile
bot.action('gh_2', async (ctx) => {
    const auto = getAutomator(ctx);
    if(!auto) return;
    ctx.answerCbQuery();
    try {
        await auto.step2_SetName();
        saveSession(ctx, auto); // SAVE KE DB
    } catch(e) {
        ctx.reply(`❌ Error Step 2: ${e.message}`);
    }
});

// STEP 3: Billing
bot.action('gh_3', async (ctx) => {
    const auto = getAutomator(ctx);
    if(!auto) return;
    ctx.answerCbQuery();
    try {
        await auto.step3_SetBilling();
        saveSession(ctx, auto); // SAVE KE DB
    } catch(e) {
        ctx.reply(`❌ Error Step 3: ${e.message}`);
    }
});

// STEP 4: Edu
bot.action('gh_4', async (ctx) => {
    const auto = getAutomator(ctx);
    if(!auto) return;
    ctx.answerCbQuery();
    try {
        await auto.step4_ApplyEdu();
        saveSession(ctx, auto); // SAVE KE DB
    } catch(e) {
        ctx.reply(`❌ Error Step 4: ${e.message}`);
    }
});

// START
bot.start(async (ctx) => {
    const user = getUser(ctx.from.id, ctx.startPayload);
    updateUser(ctx.from.id, { state: null }); // Reset wizard state
    let kb = [['💳 Generate KTM', '🎓 Canva Edu'], ['👤 Profil', '📅 Check-in']];
    if (ctx.from.id.toString() === process.env.OWNER_ID) kb.push(['/autogh']);
    ctx.reply(`Halo ${ctx.from.first_name}!`, Markup.keyboard(kb).resize());
});

bot.launch({ dropPendingUpdates: true });
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));