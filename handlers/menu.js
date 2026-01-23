import { Markup } from 'telegraf';
import { getUser, updateUser } from '../lib/db.js';

export const setupMenuHandler = (bot) => {
    const ADMIN_ID = parseInt(process.env.OWNER_ID);

    bot.start((ctx) => {
        const user = getUser(ctx.from.id, ctx.startPayload);
        let msg = `👋 Halo *${ctx.from.first_name}*!\n\nSelamat datang di Bot Doc Generator.`;
        
        let buttons = [
            ['💳 Generate KTM', '🎓 Canva Education'],
            ['👤 Profil Saya', '📅 Daily Absen'],
            ['🆘 Bantuan', 'ℹ️ Info']
        ];

        if (ctx.from.id === ADMIN_ID) buttons.push(['🛠 Admin Panel']);

        ctx.replyWithMarkdown(msg, Markup.keyboard(buttons).resize());
    });

    bot.hears('👤 Profil Saya', (ctx) => {
        const user = getUser(ctx.from.id);
        const status = user.vip ? `👑 *VIP MEMBER* (Diskon 50%)` : `Regular User`;
        
        ctx.replyWithMarkdown(
            `👤 *PROFIL ANDA*\n\n` +
            `🆔 ID: \`${ctx.from.id}\`\n` +
            `💰 Saldo: *${user.balance} Koin*\n` +
            `🔰 Status: ${status}\n` +
            `👥 Ref: ${user.referrals} orang\n\n` +
            `Link Referral:\n\`t.me/${ctx.botInfo.username}?start=${user.ref_code}\``
        );
    });

    bot.hears('📅 Daily Absen', (ctx) => {
        const user = getUser(ctx.from.id);
        const today = new Date().toDateString();
        if (user.daily_last === today) return ctx.reply('⚠️ Sudah absen hari ini!');
        
        const reward = user.vip ? 500 : 250;
        updateUser(ctx.from.id, { balance: user.balance + reward, daily_last: today });
        ctx.reply(`✅ +${reward} koin ditambahkan!`);
    });
};