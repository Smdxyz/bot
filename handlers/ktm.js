import { Markup } from 'telegraf';
import { getUser, updateUser, getPrice } from '../lib/db.js';
import { generatePersonImage } from '../lib/api.js';
import { drawKTM } from '../lib/painter.js';
import { generateFullRandom, generateSemiAuto } from '../lib/randomizer.js';
import { broadcastSuccess } from './admin.js'; // Import Broadcast

export const setupKTMHandler = (bot) => {

    bot.hears('💳 Generate KTM (Indo)', (ctx) => {
        const price = getPrice(ctx.from.id);
        ctx.reply(
            `🇮🇩 *KTM GENERATOR INDONESIA*\n💰 Biaya: *${price} Koin*`,
            Markup.inlineKeyboard([
                [Markup.button.callback('🎲 Full Random', 'ktm_act_random')],
                [Markup.button.callback('✍️ Manual Input', 'ktm_act_manual')]
            ])
        );
    });

    bot.action('ktm_act_random', async (ctx) => {
        ctx.answerCbQuery();
        processKTM(ctx, 'random');
    });

    bot.action('ktm_act_manual', async (ctx) => {
        ctx.answerCbQuery();
        ctx.deleteMessage();
        ctx.reply(
            `✍️ *INPUT MANUAL*\nFormat: \`Univ | Nama | Gender\`\nContoh: \`UGM | Budi | Pria\``,
            { parse_mode: 'Markdown' }
        );
    });

    // Main Processor
    async function processKTM(ctx, mode, manualData = null) {
        const user = getUser(ctx.from.id);
        const price = getPrice(ctx.from.id);

        if (user.balance < price) return ctx.reply('❌ Saldo kurang.');
        if (ctx.callbackQuery) ctx.deleteMessage().catch(()=>{});
        updateUser(ctx.from.id, { balance: user.balance - price });

        const data = mode === 'random' ? generateFullRandom() : generateSemiAuto(manualData);
        
        ctx.reply(`🔄 Processing: ${data.fullName}...`);

        try {
            ctx.replyWithChatAction('upload_photo');
            const photoUrl = await generatePersonImage(data.gender);
            if(!photoUrl) throw new Error("AI Photo Failed");
            data.photoUrl = photoUrl;

            const buffer = await drawKTM(data);
            await ctx.replyWithPhoto({ source: buffer }, { caption: `✅ Done! ${data.fullName}` });

            // Broadcast ke Channel
            broadcastSuccess(bot, "KTM Indonesia", data.fullName, "Indonesia");

        } catch (e) {
            console.error(e);
            updateUser(ctx.from.id, { balance: user.balance + price }); // Refund
            ctx.reply("❌ Gagal. Saldo dikembalikan.");
        }
    }

    // Export function untuk dipanggil di index.js saat text input manual
    return { processKTM };
};