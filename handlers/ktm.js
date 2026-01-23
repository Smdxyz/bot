import { Markup } from 'telegraf';
import { getUser, updateUser, calculatePrice } from '../lib/db.js';
import { generatePersonImage } from '../lib/api.js';
import { drawKTM } from '../lib/painter.js';
import { generateFullRandom, generateSemiAuto } from '../lib/randomizer.js';
import { broadcastSuccess } from './admin.js';

// Setup Handler (Tombol)
export const setupKTMHandler = (bot) => {
    
    bot.hears('💳 Generate KTM', (ctx) => {
        const basePrice = 3000;
        const finalPrice = calculatePrice(ctx.from.id, basePrice);
        
        updateUser(ctx.from.id, { state: null, tempData: {} });
        
        ctx.reply(
            `🇮🇩 *MENU KTM INDONESIA*\n` +
            `💰 Harga Normal: ~${basePrice}~\n` +
            `🏷 Harga Kamu: *${finalPrice} Koin*\n\n` +
            `Pilih metode pembuatan:`,
            Markup.inlineKeyboard([
                [Markup.button.callback('🎲 Random Data', 'ktm_mode_random')],
                [Markup.button.callback('✍️ Isi Manual', 'ktm_mode_manual')]
            ])
        );
    });

    // MODE RANDOM
    bot.action('ktm_mode_random', async (ctx) => {
        ctx.answerCbQuery();
        await ctx.deleteMessage();
        processKTM(ctx, 'random');
    });

    // MODE MANUAL (WIZARD START)
    bot.action('ktm_mode_manual', async (ctx) => {
        ctx.answerCbQuery();
        await ctx.deleteMessage();
        
        updateUser(ctx.from.id, { state: 'KTM_INPUT_GENDER', tempData: {} });
        
        ctx.reply('👨‍🎓 *LANGKAH 1/3*\n\nPilih jenis kelamin untuk foto:', 
            Markup.inlineKeyboard([
                [Markup.button.callback('Laki-laki', 'ktm_gender_pria'), Markup.button.callback('Perempuan', 'ktm_gender_wanita')],
                [Markup.button.callback('❌ Batal', 'cancel_process')]
            ])
        );
    });

    bot.action(/^ktm_gender_(.+)$/, async (ctx) => {
        ctx.answerCbQuery();
        const gender = ctx.match[1];
        const user = getUser(ctx.from.id);
        
        updateUser(ctx.from.id, { 
            state: 'KTM_INPUT_UNIV', 
            tempData: { ...user.tempData, gender } 
        });

        await ctx.editMessageText(`✅ Gender: ${gender}\n\n🏫 *LANGKAH 2/3*\nSilakan ketik *NAMA UNIVERSITAS* (Contoh: Universitas Indonesia).`);
    });
};

// Handle Input Teks (Dipanggil dari index.js)
export const handleKTMText = async (ctx, user) => {
    const text = ctx.message.text;

    if (user.state === 'KTM_INPUT_UNIV') {
        updateUser(ctx.from.id, { 
            state: 'KTM_INPUT_NAME', 
            tempData: { ...user.tempData, univName: text } 
        });
        await ctx.reply(`✅ Univ: ${text}\n\n👤 *LANGKAH 3/3 (TERAKHIR)*\nSilakan ketik *NAMA LENGKAP* mahasiswa.`);
    } 
    else if (user.state === 'KTM_INPUT_NAME') {
        const finalData = { ...user.tempData, fullName: text };
        updateUser(ctx.from.id, { state: null, tempData: {} }); // Reset State
        await processKTM(ctx, 'manual', finalData);
    }
};

// Logika Pemrosesan Gambar
async function processKTM(ctx, mode, inputData = null) {
    const basePrice = 3000;
    const finalPrice = calculatePrice(ctx.from.id, basePrice);
    const user = getUser(ctx.from.id);

    if (user.balance < finalPrice) {
        return ctx.reply(`❌ *Saldo Kurang!*\nButuh: ${finalPrice}\nPunya: ${user.balance}\n\nSilakan topup atau daily absen.`);
    }

    // Potong Saldo Dulu
    updateUser(ctx.from.id, { balance: user.balance - finalPrice });

    const msg = await ctx.reply('⏳ *Sedang Memproses...*\n_Menghubungi AI untuk foto & merender kartu..._',{parse_mode:'Markdown'});

    try {
        let data = mode === 'random' ? generateFullRandom() : generateSemiAuto(inputData);
        
        // Generate Foto AI
        ctx.replyWithChatAction('upload_photo');
        const photoUrl = await generatePersonImage(data.gender, 'student');
        if (!photoUrl) throw new Error("AI gagal generate wajah.");
        data.photoUrl = photoUrl;

        // Render Canvas
        const buffer = await drawKTM(data);
        
        await ctx.deleteMessage(msg.message_id).catch(()=>{});
        await ctx.replyWithPhoto({ source: buffer }, {
            caption: `✅ *KTM BERHASIL DIBUAT*\n\n👤 Nama: ${data.fullName}\n🎓 Kampus: ${data.univName}\n💸 Biaya: ${finalPrice} Koin`,
            parse_mode: 'Markdown'
        });

        broadcastSuccess(ctx.telegram, "KTM Indonesia", data.fullName, finalPrice);

    } catch (e) {
        console.error(e);
        updateUser(ctx.from.id, { balance: user.balance + finalPrice }); // Refund
        await ctx.deleteMessage(msg.message_id).catch(()=>{});
        ctx.reply("❌ Gagal membuat gambar. Saldo dikembalikan.");
    }
}