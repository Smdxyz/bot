import { Markup } from 'telegraf';
import { getUser, updateUser } from '../lib/db.js';

export const setupMenuHandler = (bot) => {

    // 1. PROFIL
    bot.hears('👤 Profil Saya', (ctx) => {
        const user = getUser(ctx.from.id);
        let status = user.vip ? '👑 VIP Member' : 'Regular User';
        if(user.vip && user.vipExp) {
            const daysLeft = Math.ceil((user.vipExp - Date.now()) / (1000 * 60 * 60 * 24));
            status += ` (${daysLeft} Hari)`;
        }

        ctx.replyWithMarkdown(
            `👤 *PROFIL PENGGUNA*\n\n` +
            `🆔 ID: \`${ctx.from.id}\`\n` +
            `👤 Nama: ${ctx.from.first_name}\n` +
            `💰 Saldo: *${user.balance} Koin*\n` +
            `🔰 Status: ${status}\n\n` +
            `_Gunakan saldo untuk generate dokumen._`
        );
    });

    // 2. DAILY CHECK-IN
    bot.hears('📅 Daily Check-in', (ctx) => {
        const user = getUser(ctx.from.id);
        const today = new Date().toDateString();
        
        if (user.dailyLast === today) {
            return ctx.reply('⚠️ Kamu sudah absen hari ini. Kembali lagi besok!');
        }

        const reward = user.vip ? 500 : 250;
        updateUser(ctx.from.id, { balance: user.balance + reward, dailyLast: today });
        ctx.reply(`✅ *Absen Berhasil!*\nBonus harian: +${reward} Koin.\nSaldo sekarang: ${user.balance + reward}`);
    });

    // 3. INFO
    bot.hears('ℹ️ Info Bot', (ctx) => {
        ctx.reply(
            `🤖 *Tentang Bot*\n` +
            `Bot ini menggunakan teknologi AI untuk generate foto wajah realistis dan Canvas rendering untuk dokumen High-Res.\n\n` +
            `✅ Support: KTM Indonesia, ID Card Guru Spanyol/UK/Australia.\n` +
            `📅 Versi: 3.0.0 (Modular System)`
        );
    });

    // 4. BANTUAN
    bot.hears('🆘 Bantuan', (ctx) => {
        ctx.reply(
            `❓ *PUSAT BANTUAN*\n\n` +
            `1. *Saldo Habis?* Gunakan Daily Check-in atau tunggu Kode Redeem di channel.\n` +
            `2. *Gagal Generate?* Pastikan input sesuai format.\n` +
            `3. *Ingin VIP?* Hubungi admin pemilik bot.\n\n` +
            `Fitur Canva Education tersedia di menu utama.`
        );
    });
};