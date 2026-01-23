// --- START OF FILE index.js ---

import 'dotenv/config';
import { Telegraf, Markup, session } from 'telegraf';
import { getUser, updateUser } from './lib/db.js';
import axios from 'axios';

// Import Automator
import { GitHubAutomator } from './github_automator.js';

// Import Handlers
import { setupMenuHandler } from './handlers/menu.js';
import { setupAdminHandler } from './handlers/admin.js';
import { setupKTMHandler } from './handlers/ktm.js';
import { setupCanvaHandler } from './handlers/canva.js';

const bot = new Telegraf(process.env.BOT_TOKEN, { handlerTimeout: Infinity });

// --- STATE MANAGEMENT ANTI-MACET ---
// Kita simpan "Janji" (Promise) yang sedang menunggu jawaban di sini
const pendingPrompts = {}; 
const activeSessions = {}; 

// --- FUNGSI HELPER ---
const safeDelete = async (chatId, msgId) => { try { await bot.telegram.deleteMessage(chatId, msgId); } catch (e) {} };

// Fungsi Tanya Jawab (Revolusi: Tanpa Event Emitter)
const askUser = (chatId, question, isPassword = false) => {
    return new Promise(async (resolve) => {
        // 1. Kirim Pertanyaan
        let qMsg;
        try {
            qMsg = await bot.telegram.sendMessage(chatId, question, { parse_mode: 'Markdown' });
        } catch (e) {
            console.error("Gagal kirim prompt:", e);
            resolve(null);
            return;
        }

        // 2. Simpan "Kunci" jawaban di memori global
        // Nanti middleware akan mencari kunci ini untuk membuka gembok promise
        pendingPrompts[chatId] = {
            resolve: async (answer, msgId) => {
                // Bersih-bersih pesan
                await safeDelete(chatId, msgId); // Hapus jawaban user
                if (isPassword) await safeDelete(chatId, qMsg.message_id); // Hapus pertanyaan (kalo password)
                resolve(answer);
            },
            timestamp: Date.now()
        };
    });
};

// --- MIDDLEWARE UTAMA (ROUTER) ---
bot.use(session());

bot.use(async (ctx, next) => {
    // Init User DB
    if (ctx.from) {
        try { getUser(ctx.from.id); } catch(e) {}
    }

    // Handle Pesan Teks
    if (ctx.message && ctx.message.text) {
        const userId = ctx.from.id;
        const text = ctx.message.text;

        // 1. CEK APAKAH USER SEDANG DITANYA? (PRIORITAS TERTINGGI)
        if (pendingPrompts[userId] && !text.startsWith('/')) {
            const prompt = pendingPrompts[userId];
            delete pendingPrompts[userId]; // Hapus status nunggu
            
            // Panggil fungsi resolve yang kita simpan tadi
            await prompt.resolve(text, ctx.message.message_id);
            return; // STOP! Jangan diproses handler lain
        }
        
        // 2. CEK FILE UPLOAD (IMPORT SESSION)
        // (Kode import session ada di bawah khusus document, ini hanya fallback text)
    }
    
    // Handle Document (Import JSON)
    if (ctx.message && ctx.message.document && ctx.from.id.toString() === process.env.OWNER_ID) {
        const doc = ctx.message.document;
        if (doc.file_name && doc.file_name.endsWith('.json') && doc.file_name.startsWith('GH_SESSION')) {
             try {
                const link = await ctx.telegram.getFileLink(doc.file_id);
                const response = await axios.get(link.href);
                const sessionData = response.data;
                
                // Restore Sesi
                const automator = new GitHubAutomator(ctx, null, null, null, sessionData, askUser);
                activeSessions[ctx.from.id] = automator;
                
                ctx.reply(`✅ Sesi dipulihkan: *${sessionData.profile.fullName}*\nLanjut ke menu /autogh`, { parse_mode: 'Markdown' });
                return;
            } catch (e) {
                ctx.reply(`❌ Gagal restore: ${e.message}`);
                return;
            }
        }
    }

    // 3. WIZARD HANDLER (KTM/CANVA)
    if (ctx.message && ctx.message.text) {
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

// --- LOAD MODUL ---
setupMenuHandler(bot);  
setupAdminHandler(bot); 
const ktmHandler = setupKTMHandler(bot); 
const canvaHandler = setupCanvaHandler(bot); 

// ==========================================================
// --- MENU ADMIN (/autogh) ---
// ==========================================================
bot.command('autogh', (ctx) => {
    if (ctx.from.id.toString() !== process.env.OWNER_ID) return;
    
    const session = activeSessions[ctx.from.id];
    let status = "🔴 TIDAK AKTIF";
    if (session) {
        status = `🟢 AKTIF (${session.profile.fullName.split(' ')[0]})`;
    }

    ctx.reply(
        `🛠 *GITHUB AUTOMATION PANEL*\nStatus: ${status}\n\n👇 *PILIH TAHAPAN:*`,
        Markup.inlineKeyboard([
            [Markup.button.callback('🆕 Input Data Baru', 'gh_new')],
            [Markup.button.callback('1️⃣ Login', 'gh_1'), Markup.button.callback('2️⃣ Profile', 'gh_2')],
            [Markup.button.callback('3️⃣ Billing', 'gh_3'), Markup.button.callback('4️⃣ Apply Edu', 'gh_4')],
            [Markup.button.callback('💾 Simpan Sesi (JSON)', 'gh_save')]
        ])
    );
});

// --- ACTIONS ---

// Helper Cek Sesi
const requireSession = (ctx) => {
    if (!activeSessions[ctx.chat.id]) {
        ctx.reply("⚠️ Belum ada data. Klik '🆕 Input Data Baru' dulu.");
        return false;
    }
    return true;
};

bot.action('gh_new', async (ctx) => {
    ctx.answerCbQuery();
    await ctx.deleteMessage(); // Bersihkan menu biar rapi

    // Tanya data berurutan
    const username = await askUser(ctx.chat.id, '🤖 Masukkan *Username GitHub*:');
    if(!username) return ctx.reply("Batal.");

    const password = await askUser(ctx.chat.id, '🔑 Masukkan *Password GitHub*: (Auto Hapus)', true);
    if(!password) return ctx.reply("Batal.");

    const email = await askUser(ctx.chat.id, '📧 Masukkan *Email Student*:');
    if(!email) return ctx.reply("Batal.");

    // Simpan ke memori
    activeSessions[ctx.chat.id] = new GitHubAutomator(ctx, username, password, email, null, askUser);
    
    ctx.reply(`✅ Data tersimpan!\nTarget: ${username}\nSekarang klik tombol *1️⃣ Login* di menu /autogh`);
});

bot.action('gh_1', async (ctx) => {
    if(!requireSession(ctx)) return;
    ctx.answerCbQuery();
    await activeSessions[ctx.chat.id].step1_Login();
});

bot.action('gh_2', async (ctx) => {
    if(!requireSession(ctx)) return;
    ctx.answerCbQuery();
    await activeSessions[ctx.chat.id].step2_SetName();
});

bot.action('gh_3', async (ctx) => {
    if(!requireSession(ctx)) return;
    ctx.answerCbQuery();
    await activeSessions[ctx.chat.id].step3_SetBilling();
});

bot.action('gh_4', async (ctx) => {
    if(!requireSession(ctx)) return;
    ctx.answerCbQuery();
    await activeSessions[ctx.chat.id].step4_ApplyEdu();
});

bot.action('gh_save', async (ctx) => {
    if(!requireSession(ctx)) return;
    ctx.answerCbQuery();
    const json = activeSessions[ctx.chat.id].exportState();
    await ctx.replyWithDocument(
        { source: Buffer.from(json, 'utf-8'), filename: `GH_SESSION_${activeSessions[ctx.chat.id].username}.json` },
        { caption: "Simpan file ini. Forward ke bot ini kapan saja untuk melanjutkan." }
    );
});


// --- START ---
bot.start(async (ctx) => {
    try {
        const user = getUser(ctx.from.id, ctx.startPayload);
        updateUser(ctx.from.id, { state: null, tempData: {} });
        
        // Bersihkan prompt nyangkut jika ada
        if (pendingPrompts[ctx.from.id]) delete pendingPrompts[ctx.from.id];

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
bot.launch({ dropPendingUpdates: true });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// --- END OF FILE index.js ---