import { getUser, updateUser, addCode, updateCode, getCode } from '../lib/db.js';

const ADMIN_ID = parseInt(process.env.OWNER_ID);
const CHANNEL_ID = process.env.CHANNEL_ID;

export const broadcastSuccess = async (telegram, type, name, price) => {
    if(!CHANNEL_ID) return;
    try {
        await telegram.sendMessage(CHANNEL_ID, 
            `🎉 *TRANSAKSI SUKSES*\n` +
            `📂 Fitur: ${type}\n` +
            `👤 User: ${name.substring(0,3)}***\n` +
            `💸 Omzet: ${price} Koin`, 
            { parse_mode: 'Markdown' }
        );
    } catch(e) {}
};

export const setupAdminHandler = (bot) => {
    // Middleware Cek Admin
    const isAdmin = (ctx, next) => {
        if (ctx.from && ctx.from.id === ADMIN_ID) return next();
    };

    // 1. TAMBAH KOIN MANUAL
    bot.command('addcoin', isAdmin, (ctx) => {
        const [_, targetId, amount] = ctx.message.text.split(' ');
        if (!targetId || !amount) return ctx.reply('/addcoin ID JUMLAH');
        
        const user = getUser(targetId);
        if(!user) return ctx.reply('User not found.');

        updateUser(targetId, { balance: user.balance + parseInt(amount) });
        ctx.reply(`✅ Added ${amount} coins to ${targetId}`);
        bot.telegram.sendMessage(targetId, `🎁 Admin menambahkan ${amount} Koin ke akunmu!`);
    });

    // 2. SET VIP MANUAL
    bot.command('addvip', isAdmin, (ctx) => {
        const [_, targetId, days] = ctx.message.text.split(' ');
        if (!targetId || !days) return ctx.reply('/addvip ID HARI');
        
        const exp = Date.now() + (parseInt(days) * 24 * 60 * 60 * 1000);
        updateUser(targetId, { vip: 1, vip_exp: exp });
        ctx.reply(`✅ ${targetId} is now VIP for ${days} days.`);
        bot.telegram.sendMessage(targetId, `👑 Selamat! Akunmu jadi VIP selama ${days} hari. Diskon 50% aktif!`);
    });

    // 3. BUAT KODE REDEEM
    bot.command('newcode', isAdmin, (ctx) => {
        const [_, code, val, limit] = ctx.message.text.split(' ');
        if (!limit) return ctx.reply('/newcode KODE NILAI LIMIT');
        
        addCode(code.toUpperCase(), parseInt(val), parseInt(limit));
        ctx.reply(`✅ Code ${code} created.`);
        
        if(CHANNEL_ID) {
            bot.telegram.sendMessage(CHANNEL_ID, 
                `🎟 *KODE REDEEM BARU*\n\n` +
                `Kode: \`${code.toUpperCase()}\`\n` +
                `Nilai: ${val} Koin\n` +
                `Limit: ${limit} Orang\n\n` +
                `_Ketik /redeem ${code.toUpperCase()} di bot sekarang!_`,
                { parse_mode: 'Markdown' }
            );
        }
    });

    // 4. USER REDEEM
    bot.command('redeem', (ctx) => {
        const code = ctx.message.text.split(' ')[1];
        if(!code) return ctx.reply('⚠️ Format: /redeem KODE');
        
        const data = getCode(code.toUpperCase());
        if (!data) return ctx.reply('❌ Kode salah.');
        if (data.used_count >= data.limit_total) return ctx.reply('❌ Kode habis.');
        if (data.claimed_by.includes(ctx.from.id)) return ctx.reply('⚠️ Sudah pernah redeem.');

        const user = getUser(ctx.from.id);
        const newClaimers = [...data.claimed_by, ctx.from.id];
        
        updateCode(code.toUpperCase(), { used_count: data.used_count + 1, claimed_by: newClaimers });
        updateUser(ctx.from.id, { balance: user.balance + data.value });
        
        ctx.reply(`🎉 Sukses! +${data.value} Koin.`);
    });
};