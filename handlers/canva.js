// --- START OF FILE handlers/canva.js ---

import { Markup } from 'telegraf';
import { getUser, updateUser } from '../lib/db.js';
import { generatePersonImage } from '../lib/api.js';
import { drawCanvaID, drawCanvaCert, drawCanvaContract } from '../lib/painter_canva.js';
import { getCountryData } from '../lib/data_countries.js';
import { generateTeacherData } from '../lib/randomizer.js';
import { broadcastSuccess } from './admin.js';

export const setupCanvaHandler = (bot) => {
    
    // --- 1. MENU UTAMA CANVA ---
    bot.hears('🎓 Canva Education (K-12)', (ctx) => {
        // Reset state jika user kembali ke menu ini
        updateUser(ctx.from.id, { state: null, tempData: {} });

        ctx.reply('🌍 Silakan pilih negara untuk paket dokumen Canva Education:', Markup.inlineKeyboard([
            [Markup.button.callback('🇪🇸 Spain', 'canva_country_spain'), Markup.button.callback('🇬🇧 UK', 'canva_country_uk')],
            [Markup.button.callback('🇦🇺 Australia', 'canva_country_australia'), Markup.button.callback('🇨🇦 Canada', 'canva_country_canada')],
            [Markup.button.callback('❌ Tutup', 'canva_wizard_close')]
        ]));
    });

    // --- 2. HANDLER PEMILIHAN NEGARA ---
    bot.action(/^canva_country_(.+)$/, (ctx) => {
        ctx.answerCbQuery();
        const key = ctx.match[1];
        ctx.deleteMessage();
        
        const price = 3000;
        ctx.reply(
            `🏛 *Paket ${key.toUpperCase()} Terpilih*\n💰 Biaya: *${price} Koin*\n\nPilih metode pembuatan:`, 
            Markup.inlineKeyboard([
                [Markup.button.callback('🎲 Data Random', `canva_rand_${key}`)],
                [Markup.button.callback('✍️ Input Manual (Wizard)', `canva_man_${key}`)]
            ])
        );
    });

    // --- 3. HANDLER UNTUK "DATA RANDOM" ---
    bot.action(/^canva_rand_(.+)$/, async (ctx) => {
        ctx.answerCbQuery();
        const key = ctx.match[1];
        const user = getUser(ctx.from.id);
        if (user.balance < 3000) return ctx.reply('❌ Saldo tidak cukup.');

        updateUser(ctx.from.id, { balance: user.balance - 3000 });
        await ctx.deleteMessage();

        const cData = getCountryData(key);
        if(!cData) return ctx.reply("❌ Data negara belum tersedia.");

        const teacherData = generateTeacherData(key);
        
        const data = {
            fullName: teacherData.fullName,
            schoolName: cData.school.name,
            city: cData.school.city,
            position: cData.positions[Math.floor(Math.random() * cData.positions.length)],
            idNum: teacherData.idNum,
            birthDate: teacherData.dob,
            gender: teacherData.gender,
            address: "School District" // Default untuk random
        };

        processDocs(ctx, data, key);
    });

    // ==========================================================
    // --- WIZARD FLOW (SISTEM TANYA-JAWAB INTERAKTIF) ---
    // ==========================================================
    
    // --- LANGKAH 1: Memulai Wizard Manual ---
    bot.action(/^canva_man_(.+)$/, async (ctx) => {
        ctx.answerCbQuery();
        await ctx.deleteMessage();
        const key = ctx.match[1];

        updateUser(ctx.from.id, { state: 'CANVA_WIZARD_NAME', tempData: { countryKey: key } });
        
        ctx.reply(
            '🧙‍♂️ *Canva Wizard Dimulai*\n\nLangkah 1 dari 3: Silakan ketik *Nama Lengkap* Anda.',
            { parse_mode: 'Markdown' }
        );
    });

    // --- LANGKAH 2 & 3 ditangani oleh handleWizardText di bawah ---

    // --- LANGKAH 4: Menangkap Pilihan Gender ---
    bot.action(/^canva_gender_(.+)$/, async (ctx) => {
        const user = getUser(ctx.from.id);
        if (user.state !== 'CANVA_WIZARD_GENDER') return ctx.answerCbQuery('Sesi sudah kadaluarsa.', { show_alert: true });
        
        ctx.answerCbQuery();
        await ctx.deleteMessage();
        
        const gender = ctx.match[1] === 'male' ? 'pria' : 'wanita';
        const temp = user.tempData;
        const cKey = temp.countryKey;
        
        const cData = getCountryData(cKey);
        if (!cData) return ctx.reply("Terjadi kesalahan: data negara tidak ditemukan.");

        const finalData = {
            ...temp,
            gender: gender,
            city: temp.schoolName, 
            address: "School District",
            position: cData.positions[0], // Ambil posisi default pertama
            idNum: "99999", // Default ID untuk manual
            birthDate: "01/01/1985" // Default DOB untuk manual
        };
        
        updateUser(ctx.from.id, { state: null, tempData: {} });
        
        processDocs(ctx, finalData, cKey);
    });

    // --- Handler Pembatalan/Penutupan ---
    bot.action('canva_wizard_close', async (ctx) => {
        ctx.answerCbQuery();
        await ctx.deleteMessage();
    });

    // --- FUNGSI PUSAT UNTUK MENANGANI INPUT TEKS WIZARD ---
    const handleWizardText = async (ctx) => {
        const user = getUser(ctx.from.id);
        const text = ctx.message.text;
        
        await ctx.deleteMessage(ctx.message.message_id).catch(()=>{}); // Hapus input user

        if (user.state === 'CANVA_WIZARD_NAME') {
            updateUser(ctx.from.id, {
                state: 'CANVA_WIZARD_SCHOOL',
                tempData: { ...user.tempData, fullName: text }
            });
            await ctx.reply(`✅ Nama: ${text}\n\nLangkah 2 dari 3: Masukkan *Nama Sekolah* Anda.`, { parse_mode: 'Markdown' });
        } else if (user.state === 'CANVA_WIZARD_SCHOOL') {
            updateUser(ctx.from.id, {
                state: 'CANVA_WIZARD_GENDER',
                tempData: { ...user.tempData, schoolName: text }
            });
            await ctx.reply(`✅ Sekolah: ${text}\n\nLangkah 3 dari 3: Pilih *Gender* Anda.`, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('👨 Pria', 'canva_gender_male'), Markup.button.callback('👩 Wanita', 'canva_gender_female')]
                ])
            });
        }
    };
    
    // --- PROSESOR UTAMA (FINAL) ---
    async function processDocs(ctx, data, countryKey) {
        const processingMsg = await ctx.reply(`⏳ Sedang memproses data dan men-generate dokumen untuk ${data.fullName}...`);
        try {
            const photoUrl = await generatePersonImage(data.gender, 'teacher');
            if (!photoUrl) throw new Error("Gagal mendapatkan foto dari AI.");
            data.photoUrl = photoUrl;

            await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(() => {});

            const buf1 = await drawCanvaID(data, countryKey);
            await ctx.replyWithPhoto({ source: buf1 }, { caption: '✅ 1️⃣ ID Card' });
            
            const buf2 = await drawCanvaCert(data, countryKey);
            await ctx.replyWithDocument({ source: buf2, filename: 'Certificate.png' }, { caption: '✅ 2️⃣ Certificate' });

            const buf3 = await drawCanvaContract(data, countryKey);
            await ctx.replyWithDocument({ source: buf3, filename: 'Contract.png' }, { caption: '✅ 3️⃣ Contract' });

            broadcastSuccess(bot, "Canva Edu K-12", data.fullName, countryKey.toUpperCase());

        } catch (e) {
            console.error(e);
            await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(() => {});
            ctx.reply('❌ Terjadi kesalahan saat generate dokumen.');
        }
    }

    return { processDocs, handleWizardText };
};
// --- END OF FILE handlers/canva.js ---