import { Markup } from 'telegraf';
import { getUser, updateUser, calculatePrice } from '../lib/db.js';
import { generatePersonImage } from '../lib/api.js';
import { drawCanvaID, drawCanvaCert, drawCanvaContract } from '../lib/painter_canva.js';
import { getCountryData } from '../lib/data_countries.js';
import { generateTeacherData } from '../lib/randomizer.js';
import { broadcastSuccess } from './admin.js';

export const setupCanvaHandler = (bot) => {
    
    bot.hears('🎓 Canva Education', (ctx) => {
        updateUser(ctx.from.id, { state: null });
        ctx.reply('🌍 Pilih Negara Dokumen:', Markup.inlineKeyboard([
            [Markup.button.callback('🇪🇸 Spain', 'cnv_ctry_spain'), Markup.button.callback('🇬🇧 UK', 'cnv_ctry_uk')],
            [Markup.button.callback('🇦🇺 Australia', 'cnv_ctry_australia'), Markup.button.callback('🇨🇦 Canada', 'cnv_ctry_canada')]
        ]));
    });

    bot.action(/^cnv_ctry_(.+)$/, (ctx) => {
        const country = ctx.match[1];
        const basePrice = 3000;
        const finalPrice = calculatePrice(ctx.from.id, basePrice);

        ctx.deleteMessage();
        ctx.reply(`🎓 *PAKET GURU ${country.toUpperCase()}*\n💰 Harga: *${finalPrice} Koin*\n\nMetode?`, 
            Markup.inlineKeyboard([
                [Markup.button.callback('🎲 Random', `cnv_go_rand_${country}`)],
                [Markup.button.callback('✍️ Manual', `cnv_go_man_${country}`)]
            ])
        );
    });

    // AUTO / RANDOM
    bot.action(/^cnv_go_rand_(.+)$/, async (ctx) => {
        ctx.answerCbQuery();
        ctx.deleteMessage();
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
            gender: randPerson.gender,
            address: "School St. 123"
        };
        
        processCanva(ctx, data, country);
    });

    // MANUAL SETUP
    bot.action(/^cnv_go_man_(.+)$/, (ctx) => {
        const country = ctx.match[1];
        updateUser(ctx.from.id, { 
            state: 'CNV_INPUT_NAME', 
            tempData: { countryKey: country } 
        });
        ctx.deleteMessage();
        ctx.reply(`✍️ *INPUT MANUAL (${country.toUpperCase()})*\n\nLangkah 1: Masukkan *Nama Lengkap*.`);
    });
    
    // ACTION GENDER MANUAL
    bot.action(/^cnv_man_gen_(.+)$/, async (ctx) => {
        const gender = ctx.match[1] === 'male' ? 'pria' : 'wanita';
        const user = getUser(ctx.from.id);
        const temp = user.tempData;
        const cData = getCountryData(temp.countryKey);

        const finalData = {
            ...temp,
            gender: gender,
            city: temp.schoolName, // Simplifikasi
            address: "School District",
            position: cData.positions[0],
            idNum: "998877",
            birthDate: "12/05/1990"
        };

        updateUser(ctx.from.id, { state: null });
        await ctx.deleteMessage();
        processCanva(ctx, finalData, temp.countryKey);
    });
};

// TEXT HANDLER CANVA
export const handleCanvaText = async (ctx, user) => {
    const text = ctx.message.text;

    if (user.state === 'CNV_INPUT_NAME') {
        updateUser(ctx.from.id, {
            state: 'CNV_INPUT_SCHOOL',
            tempData: { ...user.tempData, fullName: text }
        });
        ctx.reply(`✅ Nama: ${text}\n\nLangkah 2: Masukkan *Nama Sekolah*.`);
    }
    else if (user.state === 'CNV_INPUT_SCHOOL') {
        updateUser(ctx.from.id, {
            state: 'CNV_WAIT_GENDER',
            tempData: { ...user.tempData, schoolName: text }
        });
        ctx.reply(`✅ Sekolah: ${text}\n\nLangkah 3: Pilih Gender Foto.`, Markup.inlineKeyboard([
            [Markup.button.callback('👨 Pria', 'cnv_man_gen_male'), Markup.button.callback('👩 Wanita', 'cnv_man_gen_female')]
        ]));
    }
};

// PROCESSOR
async function processCanva(ctx, data, countryKey) {
    const basePrice = 3000;
    const finalPrice = calculatePrice(ctx.from.id, basePrice);
    const user = getUser(ctx.from.id);

    if (user.balance < finalPrice) return ctx.reply('❌ Saldo tidak cukup.');
    updateUser(ctx.from.id, { balance: user.balance - finalPrice });

    const msg = await ctx.reply('⏳ Generating 3 Dokumen (ID, Cert, Contract)...');

    try {
        data.photoUrl = await generatePersonImage(data.gender, 'teacher');
        
        const doc1 = await drawCanvaID(data, countryKey);
        await ctx.replyWithPhoto({ source: doc1 }, { caption: '📄 ID Card' });

        const doc2 = await drawCanvaCert(data, countryKey);
        await ctx.replyWithDocument({ source: doc2, filename: 'Certificate.png' });

        const doc3 = await drawCanvaContract(data, countryKey);
        await ctx.replyWithDocument({ source: doc3, filename: 'Contract.png' }, { caption: '✅ Selesai!' });

        broadcastSuccess(ctx.telegram, `Canva ${countryKey}`, data.fullName, finalPrice);
    } catch (e) {
        console.error(e);
        updateUser(ctx.from.id, { balance: user.balance + finalPrice });
        ctx.reply('❌ Error system.');
    }
}