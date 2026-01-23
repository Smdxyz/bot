import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { getUser } from './lib/db.js';

// Load Handlers
import { setupMenuHandler } from './handlers/menu.js';
import { setupAdminHandler } from './handlers/admin.js';
import { setupKTMHandler, handleKTMText } from './handlers/ktm.js';
import { setupCanvaHandler, handleCanvaText } from './handlers/canva.js';

const bot = new Telegraf(process.env.BOT_TOKEN);

// GLOBAL CANCEL ACTION
bot.action('cancel_process', async (ctx) => {
    ctx.answerCbQuery('Dibatalkan');
    await ctx.deleteMessage();
    ctx.reply('❌ Proses dibatalkan.');
});

// ROUTER TEXT INPUT (Middleware)
// Ini berfungsi membelokkan pesan teks ke handler yang sesuai berdasarkan state user
bot.on('text', async (ctx, next) => {
    // Abaikan command
    if (ctx.message.text.startsWith('/')) return next();

    const user = getUser(ctx.from.id);
    
    // Cek State KTM
    if (user.state && user.state.startsWith('KTM_')) {
        return handleKTMText(ctx, user);
    }

    // Cek State Canva
    if (user.state && user.state.startsWith('CNV_')) {
        return handleCanvaText(ctx, user);
    }

    next();
});

// SETUP SEMUA MODULE
setupMenuHandler(bot);
setupAdminHandler(bot);
setupKTMHandler(bot);
setupCanvaHandler(bot);

// ERROR HANDLING
bot.catch((err, ctx) => {
    console.error(`Ooops, encountered an error for ${ctx.updateType}`, err);
    ctx.reply("⚠️ Terjadi kesalahan pada sistem.");
});

bot.launch();
console.log('🚀 Bot Tools Indonesia is Running...');

// Graceful Stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));