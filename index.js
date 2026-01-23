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

// Setup Bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// --- TAMENG ANTI-MODAR (Global Error Handler) ---
// Ini mencegah bot mati sendiri kalau ada error tak terduga
process.on('uncaughtException', (err) => {
    console.error('🔥 CRITICAL ERROR (Uncaught):', err);
    // Jangan exit! Biarkan bot tetap hidup.
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 CRITICAL ERROR (Unhandled Rejection):', reason);
    // Jangan exit!
});

// --- GLOBAL VARIABLES ---
const adminSessions = {}; // Menyimpan data input sementara (Username, Pass, Email)
const activeAutomators = {}; // Menyimpan objek GitHubAutomator yang sudah jadi

// Helper Hapus Pesan Aman
const safeDelete = async (ctx, msgId) => {
    try { await ctx.deleteMessage(msgId); } catch (e) {}
};

// --- MIDDLEWARE ---
bot.use(session());

bot.use(async (ctx, next) => {
    // 1. Init User Database
    if (ctx.from) {
        try { getUser(ctx.from.id); } catch (e) {}
    }

    // 2. Handle Text Input (Logika Utama Tanpa Promise Ribet)
    if (ctx.message && ctx.message.text) {
        const text = ctx.message.text;
        const userId = ctx.from.id;
        const user = getUser(userId);

        // --- A. JALUR ADMIN (INPUT DATA GITHUB) ---
        // Kita cek apakah admin sedang dalam proses input data?
        if (adminSessions[userId] && adminSessions[userId].step) {
            const step = adminSessions[userId].step;
            
            // Hapus pesan user biar rapi/aman
            await safeDelete(ctx, ctx.message.message_id);

            if (step === 'WAITING_USERNAME') {
                adminSessions[userId].username = text;
                adminSessions[userId].step = 'WAITING_PASSWORD';
                const msg = await ctx.reply('🔑 Masukkan *Password GitHub*: (Pesan ini akan dihapus otomatis)', { parse_mode: 'Markdown' });
                adminSessions[userId].lastBotMsg = msg.message_id;
            } 
            else if (step === 'WAITING_PASSWORD') {
                adminSessions[userId].password = text;
                adminSessions[userId].step = 'WAITING_EMAIL';
                // Hapus pertanyaan password sebelumnya
                if(adminSessions[userId].lastBotMsg) await safeDelete(ctx, adminSessions[userId].lastBotMsg);
                await ctx.reply('📧 Masukkan *Email Student*:');
            } 
            else if (step === 'WAITING_EMAIL') {
                adminSessions[userId].email = text;
                adminSessions[userId].step = null; // Selesai input
                
                // Inisialisasi Automator
                const { username, password, email } = adminSessions[userId];
                activeAutomators[userId] = new GitHubAutomator(ctx, username, password, email);
                
                await ctx.reply(`✅ Data Tersimpan!\n👤 Target: ${username}\n📧 Email: ${email}\n\nSilakan gunakan panel di bawah:`);
                showAdminPanel(ctx);
            }
            else if (step === 'WAITING_OTP') {
                 // Kalau lagi nunggu OTP (dari request Automator)
                 if (activeAutomators[userId]) {
                     activeAutomators[userId].resolveOtp(text); // Kirim OTP ke automator
                     adminSessions[userId].step = null;
                     await ctx.reply("🔄 Memproses OTP...");
                 }
            }

            return; // Stop, jangan proses handler lain
        }

        // --- B. JALUR WIZARD USER BIASA (KTM/CANVA) ---
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

    // 3. Handle File Upload (Import Session JSON)
    if (ctx.message && ctx.message.document && ctx.from.id.toString() === process.env.OWNER_ID) {
        const doc = ctx.message.document;
        if (doc.file_name && doc.file_name.endsWith('.json') && doc.file_name.startsWith('GH_SESSION')) {
             try {
                const link = await ctx.telegram.getFileLink(doc.file_id);
                const response = await axios.get(link.href);
                const sessionData = response.data;
                
                // Restore Sesi
                activeAutomators[ctx.from.id] = new GitHubAutomator(ctx, null, null, null, sessionData);
                
                ctx.reply(`✅ Sesi dipulihkan: *${sessionData.profile.fullName}*\nLanjut ke menu /autogh`, { parse_mode: 'Markdown' });
                return;
            } catch (e) {
                ctx.reply(`❌ Gagal restore: ${e.message}`);
                return;
            }
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
// --- FITUR ADMIN ---
// ==========================================================

const showAdminPanel = (ctx) => {
    const session = activeAutomators[ctx.chat.id];
    let status = "🔴 TIDAK AKTIF";
    if (session) status = `🟢 AKTIF (${session.username})`;

    ctx.reply(
        `🛠 *GITHUB AUTOMATION PANEL*\nStatus: ${status}\n\n👇 *PILIH TAHAPAN:*`,
        Markup.inlineKeyboard([
            [Markup.button.callback('🆕 Input Data Baru', 'gh_new')],
            [Markup.button.callback('1️⃣ Login', 'gh_1'), Markup.button.callback('2️⃣ Profile', 'gh_2')],
            [Markup.button.callback('3️⃣ Billing', 'gh_3'), Markup.button.callback('4️⃣ Apply Edu', 'gh_4')],
            [Markup.button.callback('💾 Simpan Sesi', 'gh_save')]
        ])
    );
};

// Command Pemicu
bot.command('autogh', (ctx) => {
    if (ctx.from.id.toString() !== process.env.OWNER_ID) return;
    showAdminPanel(ctx);
});

// Actions
bot.action('gh_new', async (ctx) => {
    ctx.answerCbQuery();
    await ctx.deleteMessage();
    
    // Mulai State Machine Manual
    adminSessions[ctx.chat.id] = { step: 'WAITING_USERNAME' };
    ctx.reply('🤖 Masukkan *Username GitHub*:');
});

// Helper cek sesi
const requireSession = (ctx) => {
    if (!activeAutomators[ctx.chat.id]) {
        ctx.reply("⚠️ Belum ada data. Klik '🆕 Input Data Baru' dulu.");
        return false;
    }
    return true;
};

// Step Actions
bot.action('gh_1', async (ctx) => {
    if(!requireSession(ctx)) return;
    ctx.answerCbQuery();
    // Di sini kita kasih callback buat minta OTP jika butuh
    activeAutomators[ctx.chat.id].setOtpCallback(() => {
        adminSessions[ctx.chat.id] = { step: 'WAITING_OTP' }; // Set state nunggu OTP
        return ctx.reply("📩 Masukkan *OTP Email* GitHub sekarang:");
    });
    await activeAutomators[ctx.chat.id].step1_Login();
});

bot.action('gh_2', async (ctx) => { if(requireSession(ctx)) { ctx.answerCbQuery(); await activeAutomators[ctx.chat.id].step2_SetName(); }});
bot.action('gh_3', async (ctx) => { if(requireSession(ctx)) { ctx.answerCbQuery(); await activeAutomators[ctx.chat.id].step3_SetBilling(); }});
bot.action('gh_4', async (ctx) => { if(requireSession(ctx)) { ctx.answerCbQuery(); await activeAutomators[ctx.chat.id].step4_ApplyEdu(); }});

bot.action('gh_save', async (ctx) => {
    if(!requireSession(ctx)) return;
    ctx.answerCbQuery();
    const json = activeAutomators[ctx.chat.id].exportState();
    await ctx.replyWithDocument(
        { source: Buffer.from(json, 'utf-8'), filename: `GH_SESSION_${activeAutomators[ctx.chat.id].username}.json` }
    );
});


// --- START ---
bot.start(async (ctx) => {
    try {
        const user = getUser(ctx.from.id, ctx.startPayload);
        updateUser(ctx.from.id, { state: null, tempData: {} });
        
        // Reset Admin Session jika user restart
        if (adminSessions[ctx.from.id]) delete adminSessions[ctx.from.id];

        let keyboard = [
            ['💳 Generate KTM (Indo)', '🎓 Canva Education (K-12)'],
            ['👤 Profil Saya', '📅 Daily Check-in']
        ];
        if (ctx.from.id.toString() === process.env.OWNER_ID) keyboard.push(['/autogh']);

        ctx.replyWithMarkdown(`👋 Halo, ${ctx.from.first_name}!`, Markup.keyboard(keyboard).resize());
    } catch (e) {}
});

// START
console.log('🚀 BOT STABIL SIAP!');
bot.launch({ dropPendingUpdates: true }).catch(e => console.error("Launch Error:", e));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));