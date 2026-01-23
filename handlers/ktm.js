import { Markup } from 'telegraf';
import { getUser, updateUser, calculatePrice } from '../lib/db.js';
import { generatePersonImage } from '../lib/api.js';
import { drawKTM } from '../lib/painter.js';
import { generateFullRandom, generateSemiAuto } from '../lib/randomizer.js';
import { broadcastSuccess } from './admin.js';

export const setupKTMHandler = (bot) => {
    
    // Menu Utama KTM
    bot.hears('💳 Generate KTM', (ctx) => {
        const basePrice = 3000;
        const finalPrice = calculatePrice(ctx.from.id, basePrice);
        
        // Reset state jika user sedang di tengah wizard lain
        updateUser(ctx.from.id, { state: null, tempData: {} });

        ctx.replyWithMarkdown(
            `🇮🇩 *KTM GENERATOR INDONESIA*\n\n` +
            `💰 Harga Normal: ~${basePrice}~ Koin\n` +
            `👑 Harga VIP: *${finalPrice} Koin*\n\n` +
            `Pilih metode pembuatan:`,
            Markup.inlineKeyboard([
                [Markup.button.callback('🎲 Random Data', 'ktm_mode_random')],
                [Markup.button.callback('✍️ Isi Manual (Wizard)', 'ktm_mode_manual')],
                [Markup.button.callback('❌ Tutup', 'cancel_process')]
            ])
        );
    });

    // Action: Mode Random
    bot.action('ktm_mode_random', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.deleteMessage();
        processKTM(ctx, 'random');
    });

    // Action: Mode Manual (Mulai Wizard)
    bot.action('ktm_mode_manual', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.deleteMessage();
        
        updateUser(ctx.from.id, { state: 'KTM_INPUT_GENDER', tempData: {} });
        
        ctx.reply('👨‍🎓 *WIZARD KTM (1/3)*\n\nPilih jenis kelamin untuk foto AI:', 
            Markup.inlineKeyboard([
                [Markup.button.callback('👨 Laki-laki', 'ktm_gen_pria'), Markup.button.callback('👩 Perempuan', 'ktm_gen_wanita')],
                [Markup.button.callback('❌ Batal', 'cancel_process')]
            ])
        );
    });

    // Action: Pilih Gender Manual
    bot.action(/^ktm_gen_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const gender = ctx.match[1];
        const user = getUser(ctx.from.id);
        
        updateUser(ctx.from.id, { 
            state: 'KTM_INPUT_UNIV', 
            tempData: { ...user.tempData, gender } 
        });

        await ctx.editMessageText(`✅ Gender: *${gender === 'pria' ? 'Laki-laki' : 'Perempuan'}*\n\n🏫 *WIZARD KTM (2/3)*\nKetikkan **NAMA UNIVERSITAS**\n(Contoh: Universitas Gadjah Mada)`, { parse_mode: 'Markdown' });
    });
};

// Handler Input Teks Manual (Dipanggil oleh index.js)
export const handleKTMText = async (ctx, user) => {
    const text = ctx.message.text;

    if (user.state === 'KTM_INPUT_UNIV') {
        updateUser(ctx.from.id, { 
            state: 'KTM_INPUT_NAME', 
            tempData: { ...user.tempData, univName: text } 
        });
        await ctx.reply(`✅ Univ: *${text}*\n\n👤 *WIZARD KTM (3/3)*\nKetikkan **NAMA LENGKAP** mahasiswa:`, { parse_mode: 'Markdown' });
    } 
    else if (user.state === 'KTM_INPUT_NAME') {
        const finalData = { ...user.tempData, fullName: text };
        // Reset state agar tidak nyangkut
        updateUser(ctx.from.id, { state: null, tempData: {} }); 
        await processKTM(ctx, 'manual', finalData);
    }
};

// Fungsi Utama Pemrosesan
async function processKTM(ctx, mode, inputData = null) {
    const basePrice = 3000;
    const finalPrice = calculatePrice(ctx.from.id, basePrice);
    const user = getUser(ctx.from.id);

    if (user.balance < finalPrice) {
        return ctx.reply(`❌ *Saldo Tidak Cukup!*\n\nBiaya: ${finalPrice} Koin\nSaldo Anda: ${user.balance} Koin\n\nSilakan gunakan daily absen atau hubungi admin.`);
    }

    const loading = await ctx.reply('⏳ *Sedang memproses...*\n_Mohon tunggu sekitar 30-60 detik._', { parse_mode: 'Markdown' });

    try {
        // Siapkan data (Random atau Manual)
        let data = (mode === 'random') ? generateFullRandom() : generateSemiAuto(inputData);
        
        // Step 1: Potong Saldo
        updateUser(ctx.from.id, { balance: user.balance - finalPrice });

        // Step 2: Generate Foto AI
        ctx.replyWithChatAction('upload_photo');
        const photoUrl = await generatePersonImage(data.gender, 'student');
        if (!photoUrl) throw new Error("AI Timeout");
        data.photoUrl = photoUrl;

        // Step 3: Gambar Kartu
        const buffer = await drawKTM(data);
        
        // Step 4: Kirim Hasil
        await ctx.deleteMessage(loading.message_id).catch(() => {});
        await ctx.replyWithPhoto({ source: buffer }, {
            caption: `✅ *KTM BERHASIL DIBUAT*\n\n👤 Nama: ${data.fullName}\n🎓 Univ: ${data.univName}\n💸 Biaya: ${finalPrice} Koin (VIP Disc 50%)`,
            parse_mode: 'Markdown'
        });

        // Broadcast Sukses
        broadcastSuccess(ctx.telegram, "KTM Indonesia", data.fullName, finalPrice);

    } catch (e) {
        console.error("KTM Error:", e);
        // Refund saldo jika gagal total
        updateUser(ctx.from.id, { balance: user.balance }); 
        await ctx.deleteMessage(loading.message_id).catch(() => {});
        ctx.reply("❌ *Gagal memproses kartu.*\nPastikan server AI sedang online. Saldo telah dikembalikan.");
    }
}