import { getUser, updateUser, addCode, getCode, updateCode } from '../lib/db.js';

const ADMIN_ID = parseInt(process.env.OWNER_ID);
const CHANNEL_ID = process.env.CHANNEL_ID;

// Helper: Masking Nama untuk Privasi di Broadcast
const maskName = (name) => {
    if(!name) return "User";
    const parts = name.split(' ');
    if(parts.length > 1) {
        return `${parts[0]} ${parts[1][0]}***`; // Budi Santoso -> Budi S***
    }
    return name.substring(0, 3) + "***";
};

export const broadcastSuccess = async (bot, type, userName, country = "Indonesia") => {
    if (!CHANNEL_ID) return;
    const censoredName = maskName(userName);
    try {
        await bot.telegram.sendMessage(CHANNEL_ID, 
            `🎉 *NEW DOCUMENT GENERATED!*\n\n` +
            `📄 Tipe: ${type}\n` +
            `🌍 Negara: ${country}\n` +
            `👤 User: ${censoredName}\n` +
            `✅ Status: Sukses\n\n` +
            `_Buat dokumen verifikasi kamu sekarang di bot!_`, 
            { parse_mode: 'Markdown' }
        );
    } catch (e) { console.error("Broadcast Error:", e.message); }
};

export const setupAdminHandler = (bot) => {
    // Middleware Check Admin
    const isAdmin = (ctx, next) => {
        // Cek ID Admin, pastikan OWNER_ID di .env diisi angka
        if (ctx.from.id === ADMIN_ID) return next();
        // Silent ignore for non-admin
    };

    // 1. ADD COIN: /addcoin ID JUMLAH
    bot.command('addcoin', isAdmin, (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 3) return ctx.reply('Format: /addcoin [ID] [JUMLAH]');
        
        const targetId = parseInt(args[1]);
        const amount = parseInt(args[2]);
        const user = getUser(targetId);
        
        if (!user) return ctx.reply('User tidak ditemukan di database.');

        updateUser(targetId, { balance: user.balance + amount });
        ctx.reply(`✅ Berhasil tambah ${amount} koin ke ${targetId}`);
        bot.telegram.sendMessage(targetId, `🎁 Admin mengirimkan ${amount} Koin ke akunmu!`).catch(e => {});
    });

    // 2. ADD VIP: /addvip ID HARI
    bot.command('addvip', isAdmin, (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 3) return ctx.reply('Format: /addvip [ID] [HARI]');

        const targetId = parseInt(args[1]);
        const days = parseInt(args[2]);
        const expDate = Date.now() + (days * 24 * 60 * 60 * 1000);

        updateUser(targetId, { vip: 1, vip_exp: expDate }); // SQLite pakai 1 untuk true
        ctx.reply(`✅ ${targetId} jadi VIP selama ${days} hari.`);
        bot.telegram.sendMessage(targetId, `👑 Selamat! Akunmu jadi VIP selama ${days} hari.`).catch(e => {});
    });

    // 3. CREATE CODE: /newcode KODE VALUE LIMIT
    bot.command('newcode', isAdmin, (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 4) return ctx.reply('Format: /newcode [KODE] [VALUE] [LIMIT_USER]');

        const code = args[1].toUpperCase();
        const val = parseInt(args[2]);
        const limit = parseInt(args[3]);

        // Simpan ke SQLite menggunakan fungsi addCode
        try {
            addCode(code, val, limit);
            ctx.reply(`✅ Kode ${code} dibuat. Nilai: ${val}, Limit: ${limit} orang.`);

            // Broadcast Kode Baru ke Channel
            if (CHANNEL_ID) {
                bot.telegram.sendMessage(CHANNEL_ID, 
                    `🎁 *KODE REDEEM BARU!*\n\n` +
                    `🎟 Kode: \`${code}\`\n` +
                    `💰 Nilai: ${val} Koin\n` +
                    `🏃‍♂️ Limit: ${limit} Orang tercepat!\n\n` +
                    `Cara pakai: Buka bot dan ketik /redeem ${code}`,
                    { parse_mode: 'Markdown' }
                ).catch(e => {});
            }
        } catch (e) {
            ctx.reply(`❌ Gagal membuat kode: ${e.message}`);
        }
    });

    // 4. REDEEM HANDLER (Untuk User)
    bot.command('redeem', (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 2) return ctx.reply('⚠️ Format: /redeem KODE');

        const code = args[1].toUpperCase();
        
        // Ambil data kode dari SQLite
        const codeData = getCode(code);

        if (!codeData) return ctx.reply('❌ Kode tidak valid atau tidak ditemukan.');
        
        // Cek Limit (SQLite pakai snake_case: limit_total, used_count)
        if (codeData.used_count >= codeData.limit_total) return ctx.reply('❌ Yah, kode sudah habis dipakai orang lain!');
        
        // Cek apakah user sudah pernah redeem (claimed_by array)
        if (codeData.claimed_by.includes(ctx.from.id)) return ctx.reply('⚠️ Kamu sudah pakai kode ini.');

        // Eksekusi Tambah Saldo
        const user = getUser(ctx.from.id);
        updateUser(ctx.from.id, { balance: user.balance + codeData.value });
        
        // Update Code Stats di SQLite
        const newClaimed = [...codeData.claimed_by, ctx.from.id];
        updateCode(code, { 
            used_count: codeData.used_count + 1,
            claimed_by: newClaimed
        });

        ctx.reply(`🎉 *BERHASIL!* Kamu dapat +${codeData.value} Koin.`);
    });
};