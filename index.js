import 'dotenv/config'; 
import { Telegraf, Markup } from 'telegraf';
import { getUser, updateUser } from './lib/db.js';

// Import Handlers
import { setupMenuHandler } from './handlers/menu.js';
import { setupAdminHandler } from './handlers/admin.js';
import { setupKTMHandler } from './handlers/ktm.js';
import { setupCanvaHandler } from './handlers/canva.js';
// FIX: Hapus 'countryData' dari import karena sudah tidak ada di file aslinya
import { getCountryData } from './lib/data_countries.js'; 

const bot = new Telegraf(process.env.BOT_TOKEN);

// --- MIDDLEWARE ---
bot.use(async (ctx, next) => {
    // Middleware ini berjalan di setiap request
    // Kita handle user creation di command start khusus untuk referral
    // Untuk command lain, getUser dipanggil on-demand di handler masing-masing atau disini
    if (ctx.from && ctx.message && ctx.message.text && !ctx.message.text.startsWith('/start')) {
        getUser(ctx.from.id);
    }
    await next();
});

// --- LOAD HANDLERS ---
setupMenuHandler(bot);
setupAdminHandler(bot);
const ktmHandler = setupKTMHandler(bot);
const canvaHandler = setupCanvaHandler(bot);

// --- COMMAND START (WITH REFERRAL LOGIC) ---
bot.start(async (ctx) => {
    const payload = ctx.startPayload; // Mengambil text setelah /start (misal: ref123)
    
    // getUser menghandle logika cek user baru & bonus referral
    const user = getUser(ctx.from.id, payload);

    // Reset state jika user start ulang
    updateUser(ctx.from.id, { state: null, tempData: {} });

    let welcomeMsg = `👋 *Halo, ${ctx.from.first_name}!*\n\nSelamat datang di Bot Dokumen All-in-One.`;
    
    // Notifikasi jika user baru via referral
    if (user.isNew && user.referrerId) {
        welcomeMsg += `\n\n🎁 *REFERRAL BONUS!* Kamu diundang dan mendapat +1500 Koin tambahan!\nTotal Saldo Awal: ${user.balance}`;
        
        // Notifikasi ke Pengundang
        bot.telegram.sendMessage(user.referrerId, `🎉 *Referral Sukses!*\nTemanmu ${ctx.from.first_name} telah bergabung.\nKamu mendapatkan +3000 Koin!`, {parse_mode: 'Markdown'}).catch(e => {});
    }

    welcomeMsg += `\nSilakan pilih menu:`;

    // Link Referral user ini
    const refLink = `https://t.me/${ctx.botInfo.username}?start=${user.ref_code}`;

    ctx.replyWithMarkdown(
        welcomeMsg,
        Markup.keyboard([
            ['💳 Generate KTM (Indo)', '🎓 Canva Education (K-12)'],
            ['👤 Profil Saya', '📅 Daily Check-in'],
            [`🔗 Link Ref: ${user.ref_code}`], // Tombol copy ref
            ['ℹ️ Info Bot', '🆘 Bantuan']
        ]).resize()
    );
});

// Listener Tombol Ref Link (biar user gampang copy)
bot.hears(/^🔗 Link Ref: (.+)$/, (ctx) => {
    const code = ctx.match[1];
    const link = `https://t.me/${ctx.botInfo.username}?start=${code}`;
    ctx.reply(`🔗 *Link Referral Kamu:*\n\`${link}\`\n\nBagikan link ini. Jika ada teman yang start bot lewat link ini:\n💰 Kamu dapat: 3000 Koin\n💰 Temanmu dapat: 1500 Koin`, { parse_mode: 'Markdown' });
});

// ==========================================================
// CENTRAL TEXT LISTENER (Untuk Manual Input & Wizard)
// ==========================================================
bot.on('text', async (ctx) => {
    const user = getUser(ctx.from.id);
    const text = ctx.message.text;

    // 1. WIZARD CANVA MANUAL (State Based)
    if (user.state && user.state.startsWith('WIZARD_')) {
        if (user.state === 'WIZARD_NAME') {
            updateUser(ctx.from.id, { state: 'WIZARD_SCHOOL', tempData: { ...user.tempData, fullName: text } });
            ctx.reply(`✅ Nama: ${text}\n\nMasukkan Nama Sekolah:`);
        } else if (user.state === 'WIZARD_SCHOOL') {
             updateUser(ctx.from.id, { state: 'WIZARD_GENDER', tempData: { ...user.tempData, schoolName: text } });
             ctx.reply(`✅ Sekolah: ${text}\nPilih Gender:`, Markup.inlineKeyboard([
                 [Markup.button.callback('Pria', 'btn_gender_male'), Markup.button.callback('Wanita', 'btn_gender_female')]
             ]));
        }
        return;
    }

    // 2. MANUAL KTM (Format |)
    if (text.includes('|') && !user.state) {
        const parts = text.split('|').map(s => s.trim());
        if (parts.length < 3) return ctx.reply('⚠️ Format: Univ | Nama | Gender');
        
        const manualData = { univName: parts[0], fullName: parts[1], gender: parts[2] };
        ktmHandler.processKTM(ctx, 'manual', manualData);
    }
});

// Listener Tombol Gender (Bagian dari Canva Wizard)
bot.action(/^btn_gender_(.+)$/, async (ctx) => {
    const user = getUser(ctx.from.id);
    if (user.state === 'WIZARD_GENDER') {
        ctx.deleteMessage();
        const gender = ctx.match[1] === 'male' ? 'pria' : 'wanita';
        const temp = user.tempData;
        const cKey = temp.countryKey;
        
        // FIX: Gunakan getCountryData, bukan countryData
        const cData = getCountryData(cKey); 
        
        // Fallback jika data negara tidak ketemu
        if (!cData) return ctx.reply("Terjadi kesalahan mengambil data negara.");

        // Finalize Data
        const finalData = {
            ...temp,
            gender: gender,
            city: temp.schoolName, // Manual input biasanya sekolah/kota jadi satu context kalau simple
            address: "School District",
            position: cData.positions[0],
            idNum: "99999",
            birthDate: "01/01/1985" // Default manual
        };
        
        updateUser(ctx.from.id, { state: null, tempData: {} });
        
        // Panggil fungsi dari canva.js
        canvaHandler.processDocs(ctx, finalData, cKey);
    }
});

bot.launch().then(() => console.log('🚀 BOT MODULAR READY!'));
process.once('SIGINT', () => bot.stop('SIGINT'));