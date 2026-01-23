// --- START OF FILE index.js ---

import 'dotenv/config';
import { Telegraf, Markup, session } from 'telegraf';
import { getUser, updateUser } from './lib/db.js';
import { EventEmitter } from 'events';
import axios from 'axios'; // Untuk download file JSON session

// Import Automator
import { GitHubAutomator } from './github_automator.js';

// Import Handlers
import { setupMenuHandler } from './handlers/menu.js';
import { setupAdminHandler } from './handlers/admin.js';
import { setupKTMHandler } from './handlers/ktm.js';
import { setupCanvaHandler } from './handlers/canva.js';

const bot = new Telegraf(process.env.BOT_TOKEN, { handlerTimeout: 900000 });
const inputEvents = new EventEmitter();
const waitingForInput = {}; 
const activeSessions = {}; // Menyimpan instance GitHubAutomator aktif per user

// --- FUNGSI HELPER ---
const safeDelete = async (chatId, msgId) => { try { await bot.telegram.deleteMessage(chatId, msgId); } catch (e) {} };

const askUser = (chatId, question, isPassword = false) => {
    return new Promise(async (resolve) => {
        const qMsg = await bot.telegram.sendMessage(chatId, question, { parse_mode: 'Markdown' });
        waitingForInput[chatId] = true;
        
        const timeout = setTimeout(() => {
            if(waitingForInput[chatId]) {
                delete waitingForInput[chatId];
                resolve(null);
                bot.telegram.sendMessage(chatId, "❌ Waktu habis.");
            }
        }, 300000); // 5 menit

        inputEvents.once(`input_${chatId}`, async (answer, answerMsgId) => {
            clearTimeout(timeout);
            delete waitingForInput[chatId];
            await safeDelete(chatId, answerMsgId);
            if (isPassword) await safeDelete(chatId, qMsg.message_id);
            resolve(answer);
        });
    });
};

// --- MIDDLEWARE ---
bot.use(session());
bot.use(async (ctx, next) => {
    if (ctx.from) try { getUser(ctx.from.id); } catch(e) {}

    // Handle File Upload (Import Session JSON)
    if (ctx.message && ctx.message.document && ctx.from.id.toString() === process.env.OWNER_ID) {
        const doc = ctx.message.document;
        if (doc.file_name.endsWith('.json') && doc.file_name.startsWith('GH_SESSION')) {
            ctx.reply("♻️ Membaca file sesi...");
            try {
                const link = await ctx.telegram.getFileLink(doc.file_id);
                const response = await axios.get(link.href);
                const sessionData = response.data;
                
                // Recreate Automator
                const automator = new GitHubAutomator(ctx, null, null, null, sessionData, askUser);
                activeSessions[ctx.from.id] = automator;
                
                ctx.reply(`✅ Sesi dipulihkan untuk: *${sessionData.profile.fullName}*\nSilakan lanjutkan step di menu /autogh`, { parse_mode: 'Markdown' });
                return;
            } catch (e) {
                ctx.reply("❌ Gagal load sesi: " + e.message);
                return;
            }
        }
    }

    if (ctx.message && ctx.message.text) {
        const text = ctx.message.text;
        if (waitingForInput[ctx.from.id] && !text.startsWith('/')) {
            inputEvents.emit(`input_${ctx.from.id}`, text, ctx.message.message_id);
            return;
        }
        
        const user = getUser(ctx.from.id);
        if (user && user.state) {
             if (user.state.startsWith('CANVA_WIZARD_')) {
                canvaHandler.handleWizardText(ctx).catch(()=>{});
                return;
            }
            if (user.state.startsWith('KTM_WIZARD_')) {
                ktmHandler.handleWizardText(ctx).catch(()=>{});
                return;
            }
        }
    }
    await next(); 
});

// --- HANDLERS ---
setupMenuHandler(bot);  
setupAdminHandler(bot); 
const ktmHandler = setupKTMHandler(bot); 
const canvaHandler = setupCanvaHandler(bot); 

// ==========================================================
// --- MENU PANEL ADMIN (/autogh) ---
// ==========================================================
bot.command('autogh', (ctx) => {
    if (ctx.from.id.toString() !== process.env.OWNER_ID) return;
    
    // Tampilkan Menu Panel
    const session = activeSessions[ctx.from.id];
    const status = session ? `🟢 AKTIF (${session.profile.fullName})` : "🔴 TIDAK AKTIF";

    ctx.reply(
        `🛠 *GITHUB AUTOMATION PANEL*\nStatus Sesi: ${status}\n\nPilih Tahapan:`,
        Markup.inlineKeyboard([
            [Markup.button.callback('🆕 Buat Sesi Baru', 'gh_new_session')],
            [Markup.button.callback('1️⃣ Login', 'gh_step_1'), Markup.button.callback('2️⃣ Set Nama', 'gh_step_2')],
            [Markup.button.callback('3️⃣ Set Billing', 'gh_step_3'), Markup.button.callback('4️⃣ Apply Edu', 'gh_step_4')],
            [Markup.button.callback('💾 Export Session (JSON)', 'gh_export')]
        ])
    );
});

// --- ACTIONS PANEL ---
bot.action('gh_new_session', async (ctx) => {
    ctx.answerCbQuery();
    const username = await askUser(ctx.chat.id, '🤖 Username GitHub:');
    if(!username) return;
    const password = await askUser(ctx.chat.id, '🔑 Password GitHub:', true);
    if(!password) return;
    const email = await askUser(ctx.chat.id, '📧 Email Student:');
    if(!email) return;

    // Buat Automator Baru
    activeSessions[ctx.chat.id] = new GitHubAutomator(ctx, username, password, email, null, askUser);
    ctx.reply("✅ Sesi Baru Dibuat! Silakan klik tombol step 1-4.");
});

const checkSession = (ctx) => {
    if (!activeSessions[ctx.chat.id]) {
        ctx.reply("⚠️ Belum ada sesi aktif. Klik 'Buat Sesi Baru' atau kirim file JSON sesi.");
        return false;
    }
    return true;
};

bot.action('gh_step_1', async (ctx) => {
    if (!checkSession(ctx)) return;
    ctx.answerCbQuery();
    await activeSessions[ctx.chat.id].step1_Login();
});

bot.action('gh_step_2', async (ctx) => {
    if (!checkSession(ctx)) return;
    ctx.answerCbQuery();
    await activeSessions[ctx.chat.id].step2_SetName();
});

bot.action('gh_step_3', async (ctx) => {
    if (!checkSession(ctx)) return;
    ctx.answerCbQuery();
    await activeSessions[ctx.chat.id].step3_SetBilling();
});

bot.action('gh_step_4', async (ctx) => {
    if (!checkSession(ctx)) return;
    ctx.answerCbQuery();
    await activeSessions[ctx.chat.id].step4_ApplyEdu();
});

bot.action('gh_export', async (ctx) => {
    if (!checkSession(ctx)) return;
    ctx.answerCbQuery();
    const json = activeSessions[ctx.chat.id].exportState();
    const buffer = Buffer.from(json, 'utf-8');
    await ctx.replyWithDocument(
        { source: buffer, filename: `GH_SESSION_${activeSessions[ctx.chat.id].username}.json` },
        { caption: "💾 File Sesi. Kirim file ini ke bot untuk melanjutkan nanti." }
    );
});


// --- COMMAND START ---
bot.start(async (ctx) => {
    try {
        const user = getUser(ctx.from.id, ctx.startPayload);
        let msg = `👋 *Halo, ${ctx.from.first_name}!*\nMenu Admin ada di /autogh (Owner Only)`;
        
        let keyboard = [
            ['💳 Generate KTM (Indo)', '🎓 Canva Education (K-12)'],
            ['👤 Profil Saya', '📅 Daily Check-in']
        ];
        
        if (ctx.from.id.toString() === process.env.OWNER_ID) keyboard.push(['/autogh']);

        ctx.replyWithMarkdown(msg, Markup.keyboard(keyboard).resize());
    } catch (e) { console.error(e); }
});

bot.launch().then(() => console.log('🚀 BOT SIAP! Mode Panel Admin Aktif.'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));