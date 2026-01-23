import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { getUser } from './lib/db.js';
import { setupMenuHandler } from './handlers/menu.js';
import { setupAdminHandler, handleAdminText } from './handlers/admin.js';
import { setupKTMHandler, handleKTMText } from './handlers/ktm.js';
import { setupCanvaHandler, handleCanvaText } from './handlers/canva.js';

const bot = new Telegraf(process.env.BOT_TOKEN);

// GLOBAL CANCEL
bot.action('cancel_process', async (ctx) => {
    ctx.answerCbQuery();
    await ctx.deleteMessage();
    getUser(ctx.from.id) && updateUser(ctx.from.id, { state: null, tempData: {} });
    ctx.reply('❌ Proses dibatalkan.');
});

// ROUTER TEKS
bot.on('text', async (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return next();
    
    const user = getUser(ctx.from.id);
    if (!user) return;

    // Arahkan sesuai state
    if (user.state?.startsWith('ADM_')) return handleAdminText(ctx, user);
    if (user.state?.startsWith('KTM_')) return handleKTMText(ctx, user);
    if (user.state?.startsWith('CNV_')) return handleCanvaText(ctx, user);

    next();
});

// INISIALISASI MODULE
setupMenuHandler(bot);
setupAdminHandler(bot);
setupKTMHandler(bot);
setupCanvaHandler(bot);

bot.launch();
console.log('🚀 Bot Aktif (Modular & Anti-Error Mode)');