// --- START OF FILE handlers/ktm.js ---

import { Markup } from 'telegraf';
import { getUser, updateUser, getPrice } from '../lib/db.js';
import { generatePersonImage } from '../lib/api.js';
import { drawKTM } from '../lib/painter.js';
import { generateFullRandom, generateSemiAuto } from '../lib/randomizer.js';
import { broadcastSuccess } from './admin.js';

export const setupKTMHandler = (bot) => {

    // --- 1. MENU UTAMA KTM ---
    bot.hears('💳 Generate KTM (Indo)', (ctx) => {
        const price = getPrice(ctx.from.id);
        // Reset state jika user kembali ke menu ini
        updateUser(ctx.from.id, { state: null, tempData: {} });
        
        ctx.reply(
            `🇮🇩 *KTM GENERATOR INDONESIA*\n💰 Biaya: *${price} Koin*\n\nPilih metode pembuatan:`,
            Markup.inlineKeyboard([
                [Markup.button.callback('🎲 Full Random', 'ktm_act_random')],
                [Markup.button.callback('🧙‍♂️ Custom (Wizard)', 'ktm_wizard_start')]
            ])
        );
    });

    // --- 2. HANDLER UNTUK "FULL RANDOM" ---
    bot.action('ktm_act_random', async (ctx) => {
        ctx.answerCbQuery();
        processKTM(ctx, 'random');
    });

    // ==========================================================
    // --- WIZARD FLOW (SISTEM TANYA-JAWAB INTERAKTIF) ---
    // ==========================================================

    // --- LANGKAH 1: Memulai Wizard ---
    bot.action('ktm_wizard_start', async (ctx) => {
        ctx.answerCbQuery();
        await ctx.deleteMessage();

        // Set state awal wizard
        updateUser(ctx.from.id, { state: 'KTM_WIZARD_GENDER', tempData: {} });

        ctx.reply('🧙‍♂️ *Wizard KTM Dimulai*\n\nLangkah 1 dari 3: Pilih Gender', Markup.inlineKeyboard([
            [Markup.button.callback('👨 Pria', 'ktm_wizard_gender_pria'), Markup.button.callback('👩 Wanita', 'ktm_wizard_gender_wanita')],
            [Markup.button.callback('❌ Batal', 'ktm_wizard_cancel')]
        ]));
    });

    // --- LANGKAH 2: Menangkap Pilihan Gender ---
    bot.action(/^ktm_wizard_gender_(.+)$/, async (ctx) => {
        const user = getUser(ctx.from.id);
        if (user.state !== 'KTM_WIZARD_GENDER') return ctx.answerCbQuery('Sesi sudah kadaluarsa, silakan mulai lagi.', { show_alert: true });

        ctx.answerCbQuery();
        const gender = ctx.match[1];
        
        // Simpan gender & update state ke langkah berikutnya
        updateUser(ctx.from.id, {
            state: 'KTM_WIZARD_UNIV',
            tempData: { ...user.tempData, gender: gender }
        });
        
        // Edit pesan untuk pertanyaan selanjutnya
        await ctx.editMessageText(
            `✅ Gender: ${gender === 'pria' ? 'Pria' : 'Wanita'}\n\n` +
            `Langkah 2 dari 3: Silakan ketik *Nama Universitas* yang Anda inginkan.`,
            { parse_mode: 'Markdown' }
        );
    });

    // --- LANGKAH 3 & 4 ditangani oleh handleWizardText di bawah ---

    // --- Handler Pembatalan Wizard ---
    bot.action('ktm_wizard_cancel', async (ctx) => {
        ctx.answerCbQuery('Wizard dibatalkan.');
        updateUser(ctx.from.id, { state: null, tempData: {} });
        await ctx.deleteMessage();
        ctx.reply('Wizard pembuatan KTM dibatalkan.');
    });


    // --- FUNGSI PUSAT UNTUK MENANGANI INPUT TEKS WIZARD ---
    // Fungsi ini akan dipanggil dari index.js
    const handleWizardText = async (ctx) => {
        const user = getUser(ctx.from.id);
        const text = ctx.message.text;
        let messageToDelete = ctx.message.message_id; // Simpan ID pesan user untuk dihapus

        try {
            // LANGKAH 3: Menangkap Nama Universitas
            if (user.state === 'KTM_WIZARD_UNIV') {
                updateUser(ctx.from.id, {
                    state: 'KTM_WIZARD_NAME',
                    tempData: { ...user.tempData, univName: text }
                });

                // Hapus pesan prompt sebelumnya (yang minta input univ)
                if(ctx.callbackQuery) await ctx.deleteMessage().catch(()=>{});
                // Hapus pesan input dari user
                await ctx.deleteMessage(messageToDelete).catch(()=>{});

                await ctx.reply(
                    `✅ Universitas: ${text}\n\n` +
                    `Langkah 3 dari 3: Terakhir, ketik *Nama Lengkap* Anda.`,
                    { parse_mode: 'Markdown' }
                );
            }
            // LANGKAH 4: Menangkap Nama Lengkap & Memproses KTM
            else if (user.state === 'KTM_WIZARD_NAME') {
                 // Hapus pesan input dari user
                await ctx.deleteMessage(messageToDelete).catch(()=>{});

                const finalData = {
                    ...user.tempData,
                    fullName: text
                };
                
                // PENTING: Reset state SEBELUM memproses
                updateUser(ctx.from.id, { state: null, tempData: {} });
                
                // Panggil prosesor utama
                await processKTM(ctx, 'wizard', finalData);
            }
        } catch (e) {
            console.error("Error in KTM wizard text handler:", e);
        }
    };

    // --- PROSESOR UTAMA (FINAL) ---
    // Didesain ulang untuk menangani semua mode (random, wizard, manual)
    async function processKTM(ctx, mode, inputData = null) {
        const user = getUser(ctx.from.id);
        const price = getPrice(ctx.from.id);

        if (user.balance < price) {
            if (ctx.callbackQuery) ctx.answerCbQuery('❌ Saldo kurang.', { show_alert: true });
            else ctx.reply('❌ Saldo kurang.');
            return;
        }

        // Hapus pesan menu inline jika ada (dari mode random)
        if (ctx.callbackQuery) await ctx.deleteMessage().catch(()=>{});

        updateUser(ctx.from.id, { balance: user.balance - price });
        const processingMsg = await ctx.reply('⏳ Sedang memproses data dan men-generate gambar, harap tunggu...');

        // Tentukan data berdasarkan mode
        let data;
        if (mode === 'random') {
            data = generateFullRandom();
        } else { // Mode 'wizard' atau 'manual'
            data = generateSemiAuto(inputData);
        }
        
        try {
            ctx.replyWithChatAction('upload_photo');
            const photoUrl = await generatePersonImage(data.gender, 'student');
            if (!photoUrl) throw new Error("Gagal mendapatkan foto dari AI.");
            data.photoUrl = photoUrl;

            const buffer = await drawKTM(data);
            
            // Hapus pesan "processing..." SEBELUM mengirim hasil
            await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(()=>{});

            await ctx.replyWithPhoto({ source: buffer }, { 
                caption: `✅ *KTM Berhasil Dibuat!*\n\n` +
                         `👤 Nama: ${data.fullName}\n` +
                         `🎓 Univ: ${data.univName}\n` +
                         `-
                         ${price} Koin telah digunakan.`
                , parse_mode: 'Markdown'
            });

            broadcastSuccess(bot, "KTM Indonesia (Custom)", data.fullName, "Indonesia");

        } catch (e) {
            console.error(e);
            updateUser(ctx.from.id, { balance: user.balance + price }); // Refund saldo
            
            await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(()=>{});
            ctx.reply("❌ Terjadi kesalahan saat generate. Saldo Anda telah dikembalikan.");
        }
    }

    // Export fungsi yang dibutuhkan oleh index.js
    return { processKTM, handleWizardText };
};


// --- END OF FILE handlers/ktm.js ---