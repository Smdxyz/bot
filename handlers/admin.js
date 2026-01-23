import { Markup } from 'telegraf';
import { getUser, updateUser, addCode } from '../lib/db.js';

const ADMIN_ID = parseInt(process.env.OWNER_ID);

export const setupAdminHandler = (bot) => {
    
    const isAdmin = (ctx, next) => {
        if (ctx.from && ctx.from.id === ADMIN_ID) return next();
    };

    bot.hears('🛠 Admin Panel', isAdmin, (ctx) => {
        ctx.reply('👨‍✈️ *ADMIN DASHBOARD*\n\nKelola user dan sistem di sini:', {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('💰 Tambah Koin', 'adm_add_coin'), Markup.button.callback('👑 Set VIP', 'adm_set_vip')],
                [Markup.button.callback('🎟 Buat Kode Redeem', 'adm_new_code')],
                [Markup.button.callback('❌ Tutup', 'cancel_process')]
            ])
        });
    });

    bot.action('adm_add_coin', isAdmin, (ctx) => {
        updateUser(ADMIN_ID, { state: 'ADM_WAIT_ID_COIN' });
        ctx.editMessageText('📥 *TAMBAH KOIN*\nMasukkan **ID USER** target (Hanya Angka):', { parse_mode: 'Markdown' });
    });

    bot.action('adm_set_vip', isAdmin, (ctx) => {
        updateUser(ADMIN_ID, { state: 'ADM_WAIT_ID_VIP' });
        ctx.editMessageText('👑 *SET VIP*\nMasukkan **ID USER** target (Hanya Angka):', { parse_mode: 'Markdown' });
    });

    bot.action('adm_new_code', isAdmin, (ctx) => {
        updateUser(ADMIN_ID, { state: 'ADM_WAIT_CODE_DATA' });
        ctx.editMessageText('🎟 *KODE REDEEM*\nFormat: `KODE|NILAI|LIMIT` (Contoh: `NEWYEAR|5000|20`)');
    });
};

// HANDLER INPUT TEKS ADMIN
export const handleAdminText = async (ctx, user) => {
    const text = ctx.message.text;

    // VALIDASI KOIN
    if (user.state === 'ADM_WAIT_ID_COIN') {
        const targetId = parseInt(text);
        if (isNaN(targetId)) {
            updateUser(ctx.from.id, { state: null });
            return ctx.reply('❌ BATAL: Anda memasukkan teks/file, bukan ID angka!');
        }
        updateUser(ctx.from.id, { state: 'ADM_WAIT_AMT_COIN', tempData: { targetId } });
        return ctx.reply(`Target: \`${targetId}\`\nMasukkan jumlah koin:`);
    }

    if (user.state === 'ADM_WAIT_AMT_COIN') {
        const amount = parseInt(text);
        if (isNaN(amount)) {
            updateUser(ctx.from.id, { state: null });
            return ctx.reply('❌ BATAL: Jumlah koin harus angka!');
        }
        const target = getUser(user.tempData.targetId);
        if (!target) return ctx.reply('❌ User tidak ada di database.');
        
        updateUser(user.tempData.targetId, { balance: target.balance + amount });
        updateUser(ctx.from.id, { state: null });
        ctx.reply(`✅ Berhasil! ${amount} koin dikirim ke ${user.tempData.targetId}`);
        ctx.telegram.sendMessage(user.tempData.targetId, `🎁 Admin memberi Anda ${amount} koin!`);
    }

    // VALIDASI VIP
    if (user.state === 'ADM_WAIT_ID_VIP') {
        const targetId = parseInt(text);
        if (isNaN(targetId)) {
            updateUser(ctx.from.id, { state: null });
            return ctx.reply('❌ BATAL: ID harus angka!');
        }
        updateUser(ctx.from.id, { state: 'ADM_WAIT_DAY_VIP', tempData: { targetId } });
        return ctx.reply(`ID: \`${targetId}\`\nBerapa hari VIP?`);
    }

    if (user.state === 'ADM_WAIT_DAY_VIP') {
        const days = parseInt(text);
        if (isNaN(days)) return ctx.reply('❌ Harus angka!');
        const exp = Date.now() + (days * 24 * 60 * 60 * 1000);
        updateUser(user.tempData.targetId, { vip: 1, vip_exp: exp });
        updateUser(ctx.from.id, { state: null });
        ctx.reply(`✅ ID ${user.tempData.targetId} aktif VIP ${days} hari.`);
    }

    // VALIDASI KODE
    if (user.state === 'ADM_WAIT_CODE_DATA') {
        const p = text.split('|');
        if (p.length < 3) return ctx.reply('Format salah! KODE|NILAI|LIMIT');
        addCode(p[0].toUpperCase(), parseInt(p[1]), parseInt(p[2]));
        updateUser(ctx.from.id, { state: null });
        ctx.reply(`✅ Kode ${p[0].toUpperCase()} aktif!`);
    }
};

export const broadcastSuccess = async (telegram, type, name, price) => {
    const CH = process.env.CHANNEL_ID;
    if(!CH) return;
    try {
        await telegram.sendMessage(CH, `🎉 *TRANSAKSI BERHASIL*\nFitur: ${type}\nUser: ${name.substring(0,3)}***\nBiaya: ${price} Koin`, { parse_mode: 'Markdown' });
    } catch(e) {}
};