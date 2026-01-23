import { Markup } from 'telegraf';
import { getUser, updateUser } from '../lib/db.js';

export const setupMenuHandler = (bot) => {
    
    bot.start((ctx) => {
        // Ambil payload referral (misal: t.me/bot?start=KODE123)
        const refPayload = ctx.startPayload || null;
        const user = getUser(ctx.from.id, refPayload);

        let msg = `👋 *Halo, ${ctx.from.first_name}!*\n\nSelamat datang di Bot Tools Indonesia.\n`;
        if(user.isNew) msg += `🎁 *Bonus Pengguna Baru:* +2500 Koin!\n`;
        
        ctx.replyWithMarkdown(msg, Markup.keyboard([
            ['💳 Generate KTM', '🎓 Canva Education'],
            ['👤 Profil Saya', '📅 Daily Absen'],
            ['🆘 Bantuan', 'ℹ️ Info']
        ]).resize());
    });

    bot.hears('👤 Profil Saya', (ctx) => {
        const user = getUser(ctx.from.id);
        let status = user.vip ? '👑 *VIP MEMBER*' : 'Regular User';
        if(user.vip) {
            const daysLeft = Math.ceil((user.vip_exp - Date.now()) / (1000 * 60 * 60 * 24));
            status += `\n⏳ Sisa VIP: ${daysLeft} Hari`;
        }

        ctx.replyWithMarkdown(
            `👤 *INFORMASI PENGGUNA*\n\n` +
            `🆔 ID: \`${ctx.from.id}\`\n` +
            `🏷 Ref Code: \`${user.ref_code}\`\n` +
            `👥 Referral: ${user.referrals} orang\n\n` +
            `💰 Saldo: *${user.balance} Koin*\n` +
            `🔰 Status: ${status}\n\n` +
            (user.vip ? `⚡ *Keuntungan VIP:* Diskon 50% semua layanan!` : `_Upgrade VIP untuk diskon 50% biaya layanan!_`)
        );
    });

    bot.hears('📅 Daily Absen', (ctx) => {
        const user = getUser(ctx.from.id);
        const today = new Date().toDateString();
        
        if (user.daily_last === today) {
            return ctx.reply('⚠️ Kamu sudah absen hari ini. Balik lagi besok ya!');
        }

        const baseReward = 250;
        const reward = user.vip ? baseReward * 2 : baseReward; // VIP dapet 2x lipat
        
        updateUser(ctx.from.id, { balance: user.balance + reward, daily_last: today });
        ctx.reply(`✅ *Absen Berhasil!*\n💰 Dapat: ${reward} Koin\n💳 Total: ${user.balance + reward}`);
    });

    bot.hears('ℹ️ Info', (ctx) => {
        ctx.reply(`🤖 *Versi Bot: 5.0 (Clean Build)*\n\nBot ini dibuat untuk membantu generate dokumen digital secara instan.`);
    });
    
    bot.hears('🆘 Bantuan', (ctx) => {
        ctx.replyWithMarkdown(
            `*PUSAT BANTUAN*\n\n` +
            `1. *Cara Ref?* Bagikan link: \`t.me/${ctx.botInfo.username}?start=KODE_REF_KAMU\`\n` +
            `2. *Saldo Habis?* Ajak teman atau tunggu kode redeem.\n` +
            `3. *Topup?* Hubungi admin pemilik bot.`
        );
    });
};