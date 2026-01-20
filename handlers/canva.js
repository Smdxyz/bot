import { Markup } from 'telegraf';
import { getUser, updateUser } from '../lib/db.js';
import { generatePersonImage } from '../lib/api.js';
import { drawCanvaID, drawCanvaCert, drawCanvaContract } from '../lib/painter_canva.js';
import { getCountryData } from '../lib/data_countries.js'; // Updated Import
import { generateTeacherData } from '../lib/randomizer.js'; // Updated Import
import { broadcastSuccess } from './admin.js';

export const setupCanvaHandler = (bot) => {
    
    bot.hears('🎓 Canva Education (K-12)', (ctx) => {
        ctx.reply('🌍 Pilih Negara:', Markup.inlineKeyboard([
            [Markup.button.callback('🇪🇸 Spain', 'btn_country_spain'), Markup.button.callback('🇬🇧 UK', 'btn_country_uk')],
            [Markup.button.callback('🇦🇺 Australia', 'btn_country_australia'), Markup.button.callback('🇨🇦 Canada', 'btn_country_canada')],
            [Markup.button.callback('❌ Tutup', 'btn_close')]
        ]));
    });

    bot.action(/^btn_country_(.+)$/, (ctx) => {
        ctx.answerCbQuery();
        const key = ctx.match[1];
        ctx.deleteMessage();
        ctx.reply(`🏛 *${key.toUpperCase()} PACK (3000 Koin)*`, Markup.inlineKeyboard([
            [Markup.button.callback('🎲 Random', `btn_rand_${key}`)],
            [Markup.button.callback('✍️ Manual', `btn_man_${key}`)]
        ]));
    });

    bot.action(/^btn_rand_(.+)$/, async (ctx) => {
        ctx.answerCbQuery();
        const key = ctx.match[1];
        const user = getUser(ctx.from.id);
        if(user.balance < 3000) return ctx.reply('❌ Saldo kurang.');

        updateUser(ctx.from.id, { balance: user.balance - 3000 });
        ctx.deleteMessage();

        // 1. Ambil Template Negara & Data Sekolah dari JSON
        const cData = getCountryData(key);
        if(!cData) return ctx.reply("❌ Data negara belum tersedia.");

        // 2. Generate Data Guru (Nama, DOB, ID) via Faker
        const teacherData = generateTeacherData(key);
        
        const data = {
            fullName: teacherData.fullName,
            schoolName: cData.school.name,
            city: cData.school.city,
            position: cData.positions[Math.floor(Math.random() * cData.positions.length)],
            idNum: teacherData.idNum,
            birthDate: teacherData.dob, // Auto DOB Teacher
            gender: teacherData.gender
        };

        processDocs(ctx, data, key);
    });

    // ... (Manual Wizard logic handled in index.js) ...
    
    // Fungsi Process Docs harus diexport agar bisa dipanggil index.js
    async function processDocs(ctx, data, countryKey) {
        try {
            ctx.reply(`⏳ Generating Documents for ${data.fullName}...`);
            const photoUrl = await generatePersonImage(data.gender);
            data.photoUrl = photoUrl;

            // Pastikan painter_canva.js support parameter baru jika ada perubahan
            const buf1 = await drawCanvaID(data, countryKey);
            await ctx.replyWithPhoto({ source: buf1 }, { caption: '1️⃣ ID Card' });
            
            const buf2 = await drawCanvaCert(data, countryKey);
            await ctx.replyWithDocument({ source: buf2, filename: 'Cert.png' }, { caption: '2️⃣ Certificate' });

            const buf3 = await drawCanvaContract(data, countryKey);
            await ctx.replyWithDocument({ source: buf3, filename: 'Contract.png' }, { caption: '3️⃣ Contract' });

            broadcastSuccess(bot, "Canva Edu K-12", data.fullName, countryKey.toUpperCase());

        } catch (e) {
            console.error(e);
            ctx.reply('❌ Error generating.');
        }
    }

    return { processDocs };
};