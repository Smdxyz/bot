import { getUser, updateUser, addCode, getCode, updateCode } from '../lib/db.js';

const ADMIN_ID = parseInt(process.env.OWNER_ID);
const CHANNEL_ID = process.env.CHANNEL_ID;

// Helper: Membersihkan karakter spesial Markdown agar tidak error
const escapeMd = (text) => {
    if (!text) return "";
    // Mengamankan karakter _, *, [, ], (, ), ~, >, #, +, -, =, |, {, }, ., !
    return text.toString().replace(/[_*[\]()~>#+=|{}.!-]/g, '\\$&');
};

// Helper: Masking Nama untuk Privasi
const maskName = (name) => {
    if(!name) return "User";
    // Bersihkan dulu karakter aneh di nama
    const safeName = name.replace(/[^a-zA-Z0-9 ]/g, ""); 
    const parts = safeName.split(' ');
    if(parts.length > 1) {
        return `${parts[0]} ${parts[1][0]}***`; 
    }
    return safeName.substring(0, 3) + "***";
};

export const broadcastSuccess = async (bot, type, userName, country = "Indonesia") => {
    if (!CHANNEL_ID) return;
    
    // Kita escape (amankan) semua variabel yang masuk
    const safeType = escapeMd(type);
    const safeCountry = escapeMd(country);
    const safeName = escapeMd(maskName(userName));

    try {
        // Gunakan MarkdownV2 yang lebih ketat tapi aman jika di-escape
        await bot.telegram.sendMessage(CHANNEL_ID, 
            `🎉 *NEW DOCUMENT GENERATED\\!*\n\n` +
            `📄 Tipe: ${safeType}\n` +
            `🌍 Negara: ${safeCountry}\n` +
            `👤 User: ${safeName}\n` +
            `✅ Status: Sukses\n\n` +
            `_Buat dokumen verifikasi kamu sekarang di bot\\!_`, 
            { parse_mode: 'MarkdownV2' } 
        );
    } catch (e) { console.error("Broadcast Error:", e.message); }
};

export const setupAdminHandler = (bot) => {
    const isAdmin = (ctx, next) => {
        if (ctx.from && ctx.from.id === ADMIN_ID) return next();
    };

    // 1. ADD COIN
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

    // 2. ADD VIP
    bot.command('addvip', isAdmin, (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 3) return ctx.reply('Format: /addvip [ID] [HARI]');

        const targetId = parseInt(args[1]);
        const days = parseInt(args[2]);
        const expDate = Date.now() + (days * 24 * 60 * 60 * 1000);

        updateUser(targetId, { vip: 1, vip_exp: expDate });
        ctx.reply(`✅ ${targetId} jadi VIP selama ${days} hari.`);
        bot.telegram.sendMessage(targetId, `👑 Selamat! Akunmu jadi VIP selama ${days} hari.`).catch(e => {});
    });

    // 3. CREATE CODE
    bot.command('newcode', isAdmin, (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 4) return ctx.reply('Format: /newcode [KODE] [VALUE] [LIMIT_USER]');

        const code = args[1].toUpperCase();
        const val = parseInt(args[2]);
        const limit = parseInt(args[3]);

        try {
            addCode(code, val, limit);
            ctx.reply(`✅ Kode ${code} dibuat. Nilai: ${val}, Limit: ${limit} orang.`);

            if (CHANNEL_ID) {
                // Escape untuk broadcast kode
                const safeCode = escapeMd(code);
                bot.telegram.sendMessage(CHANNEL_ID, 
                    `🎁 *KODE REDEEM BARU\\!*\n\n` +
                    `🎟 Kode: \`${safeCode}\`\n` +
                    `💰 Nilai: ${val} Koin\n` +
                    `🏃‍♂️ Limit: ${limit} Orang tercepat\\!\n\n` +
                    `Cara pakai: Buka bot dan ketik /redeem ${safeCode}`,
                    { parse_mode: 'MarkdownV2' }
                ).catch(e => {});
            }
        } catch (e) {
            ctx.reply(`❌ Gagal membuat kode: ${e.message}`);
        }
    });

    // 4. REDEEM HANDLER
    bot.command('redeem', (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 2) return ctx.reply('⚠️ Format: /redeem KODE');

        const code = args[1].toUpperCase();
        const codeData = getCode(code);

        if (!codeData) return ctx.reply('❌ Kode tidak valid atau tidak ditemukan.');
        if (codeData.used_count >= codeData.limit_total) return ctx.reply('❌ Yah, kode sudah habis dipakai orang lain!');
        if (codeData.claimed_by.includes(ctx.from.id)) return ctx.reply('⚠️ Kamu sudah pakai kode ini.');

        const user = getUser(ctx.from.id);
        updateUser(ctx.from.id, { balance: user.balance + codeData.value });
        
        const newClaimed = [...codeData.claimed_by, ctx.from.id];
        updateCode(code, { 
            used_count: codeData.used_count + 1,
            claimed_by: newClaimed
        });

        ctx.reply(`🎉 *BERHASIL!* Kamu dapat +${codeData.value} Koin.`);
    });
};