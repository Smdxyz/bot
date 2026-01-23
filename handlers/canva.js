import { Markup } from 'telegraf';
import { getUser, updateUser, calculatePrice } from '../lib/db.js';
import { generatePersonImage } from '../lib/api.js';
import { drawCanvaID, drawCanvaCert, drawCanvaContract } from '../lib/painter_canva.js';
import { getCountryData } from '../lib/data_countries.js';
import { generateTeacherData } from '../lib/randomizer.js';
import { broadcastSuccess } from './admin.js';

export const setupCanvaHandler = (bot) => {
    
    // Menu Utama Canva
    bot.hears('🎓 Canva Education', (ctx) => {
        updateUser(ctx.from.id, { state: null, tempData: {} });
        
        ctx.reply('🌍 *PILIH NEGARA DOKUMEN*\n\nPaket ini berisi ID Card, Sertifikat Mengajar, dan Kontrak Kerja.', {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🇪🇸 Spain', 'cnv_ctry_spain'), Markup.button.callback('🇬🇧 UK', 'cnv_ctry_uk')],
                [Markup.button.callback('🇦🇺 Australia', 'cnv_ctry_australia'), Markup.button.callback('🇨🇦 Canada', 'cnv_ctry_canada')],
                [Markup.button.callback('❌ Batal', 'cancel_process')]
            ])
        });
    });

    // Action: Pilih Negara
    bot.action(/^cnv_ctry_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const country = ctx.match[1];
        const basePrice = 3000;
        const finalPrice = calculatePrice(ctx.from.id, basePrice);

        await ctx.editMessageText(
            `🏛 *NEGARA: ${country.toUpperCase()}*\n` +
            `💰 Biaya Paket: *${finalPrice} Koin*\n\n` +
            `Pilih metode pembuatan:`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🎲 Full Random', `cnv_go_rand_${country}`)],
                    [Markup.button.callback('✍️ Manual (Wizard)', `cnv_go_man_${country}`)]
                ])
            }
        );
    });

    // Action: Mode Random
    bot.action(/^cnv_go_rand_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.deleteMessage();
        const country = ctx.match[1];
        
        const cData = getCountryData(country);
        const randPerson = generateTeacherData(country);
        
        const data = {
            fullName: randPerson.fullName,
            schoolName: cData.school.name,
            city: cData.school.city,
            position: cData.positions[0],
            idNum: randPerson.idNum,
            birthDate: randPerson.dob,
            gender: randPerson.gender
        };
        
        processCanva(ctx, data, country);
    });

    // Action: Mode Manual (Wizard Start)
    bot.action(/^cnv_go_man_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const country = ctx.match[1];
        
        updateUser(ctx.from.id, { 
            state: 'CNV_INPUT_NAME', 
            tempData: { countryKey: country } 
        });
        
        await ctx.editMessageText(`✍️ *CANVA WIZARD (1/3)*\n\nMasukkan **NAMA LENGKAP** (Gunakan nama asli agar verifikasi lancar):`, { parse_mode: 'Markdown' });
    });
    
    // Action: Pilihan Gender Manual
    bot.action(/^cnv_man_gen_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const gender = ctx.match[1] === 'male' ? 'pria' : 'wanita';
        const user = getUser(ctx.from.id);
        const temp = user.tempData;

        const finalData = {
            ...temp,
            gender: gender,
            city: temp.schoolName, 
            position: "Senior Teacher",
            idNum: Math.floor(100000 + Math.random() * 900000).toString(),
            birthDate: "15/08/1988"
        };

        updateUser(ctx.from.id, { state: null });
        await ctx.deleteMessage();
        processCanva(ctx, finalData, temp.countryKey);
    });
};

// Handler Input Teks Canva
export const handleCanvaText = async (ctx, user) => {
    const text = ctx.message.text;

    if (user.state === 'CNV_INPUT_NAME') {
        updateUser(ctx.from.id, {
            state: 'CNV_INPUT_SCHOOL',
            tempData: { ...user.tempData, fullName: text }
        });
        await ctx.reply(`✅ Nama: *${text}*\n\n🏫 *CANVA WIZARD (2/3)*\nMasukkan **NAMA SEKOLAH/INSTITUSI**:`, { parse_mode: 'Markdown' });
    }
    else if (user.state === 'CNV_INPUT_SCHOOL') {
        updateUser(ctx.from.id, {
            state: 'CNV_WAIT_GENDER',
            tempData: { ...user.tempData, schoolName: text }
        });
        await ctx.reply(`✅ Sekolah: *${text}*\n\n⚧ *CANVA WIZARD (3/3)*\nPilih gender untuk foto AI:`, 
            Markup.inlineKeyboard([
                [Markup.button.callback('👨 Pria', 'cnv_man_gen_male'), Markup.button.callback('👩 Wanita', 'cnv_man_gen_female')]
            ])
        );
    }
};

// Fungsi Utama Pemrosesan
async function processCanva(ctx, data, countryKey) {
    const basePrice = 3000;
    const finalPrice = calculatePrice(ctx.from.id, basePrice);
    const user = getUser(ctx.from.id);

    if (user.balance < finalPrice) return ctx.reply('❌ Saldo Anda tidak cukup.');

    const loading = await ctx.reply(`⏳ *Sedang Menyiapkan Paket Dokumen...*\nNegara: ${countryKey.toUpperCase()}\nBiaya: ${finalPrice} Koin`, { parse_mode: 'Markdown' });

    try {
        // Step 1: Potong Saldo
        updateUser(ctx.from.id, { balance: user.balance - finalPrice });

        // Step 2: Generate Foto AI
        data.photoUrl = await generatePersonImage(data.gender, 'teacher');
        if(!data.photoUrl) throw new Error("AI Error");

        // Step 3: Render 3 Dokumen
        const doc1 = await drawCanvaID(data, countryKey);
        const doc2 = await drawCanvaCert(data, countryKey);
        const doc3 = await drawCanvaContract(data, countryKey);

        // Step 4: Kirim Hasil
        await ctx.deleteMessage(loading.message_id).catch(() => {});
        
        await ctx.replyWithPhoto({ source: doc1 }, { caption: `📄 *1. IDENTITY CARD*\nStatus: Verified`, parse_mode: 'Markdown' });
        await ctx.replyWithDocument({ source: doc2, filename: 'Certificate.png' }, { caption: `📄 *2. TEACHING CERTIFICATE*`, parse_mode: 'Markdown' });
        await ctx.replyWithDocument({ source: doc3, filename: 'Contract.png' }, { caption: `📄 *3. EMPLOYMENT CONTRACT*\n\n✅ Selesai! Gunakan dokumen ini untuk mendaftar Canva Education.`, parse_mode: 'Markdown' });

        broadcastSuccess(ctx.telegram, `Canva Edu ${countryKey}`, data.fullName, finalPrice);

    } catch (e) {
        console.error("Canva Error:", e);
        updateUser(ctx.from.id, { balance: user.balance });
        await ctx.deleteMessage(loading.message_id).catch(() => {});
        ctx.reply('❌ Terjadi kesalahan saat generate dokumen. Saldo telah dikembalikan.');
    }
}