// --- START OF FILE services/github/steps/1_login.js ---

import { extractAllInputs } from '../../../lib/utils.js';
import * as cheerio from 'cheerio';

export const handleLogin = async (session, config, otpCallback, logger) => {
    const loginUrl = 'https://github.com/login';
    const sessionUrl = 'https://github.com/session';

    // 1. GET Halaman Login
    logger('Mengambil halaman login...');
    const loginPageRes = await session.get(loginUrl);
    if (loginPageRes.statusCode !== 200) {
        throw new Error(`Gagal memuat halaman login. Status: ${loginPageRes.statusCode}`);
    }

    const loginPayload = extractAllInputs(loginPageRes.body, 'form[action="/session"]');
    if (!loginPayload.authenticity_token) {
        throw new Error('Token autentikasi tidak ditemukan di halaman login.');
    }

    loginPayload.login = config.username;
    loginPayload.password = config.password;

    // 2. POST Username & Password
    logger('Mengirim kredensial...');
    // Penting: Referer harus halaman login
    const postLoginRes = await session.post(sessionUrl, new URLSearchParams(loginPayload).toString(), {
        'Referer': loginUrl
    });

    // Cek salah password
    if (postLoginRes.statusCode === 200 && postLoginRes.url.includes('/login')) {
        const $ = cheerio.load(postLoginRes.body);
        const error = $('.flash-error').text().trim();
        throw new Error(`Login Gagal: ${error || 'Password salah.'}`);
    }

    const location = postLoginRes.headers.location;
    if (!location) {
        // Jika status 200 tapi tidak redirect, dan bukan halaman login balik,
        // kemungkinan terkena deteksi bot atau captcha.
        throw new Error('Login macet. GitHub tidak memberikan redirect (Mungkin terkena Captcha/Rate Limit).');
    }

    logger(`Respon Login: Redirect ke ${location}`);

    let finalResponse;

    // 3. Handle 2FA (App atau SMS/Email)
    // URL biasanya: /sessions/two-factor (App) atau /sessions/verified-device (Email)
    if (location.includes('two-factor') || location.includes('verified-device')) {
        const twoFactorUrl = location; // URL lengkap dari header location
        
        logger('Membutuhkan verifikasi 2FA...');
        
        // GET halaman input OTP
        const otpPageRes = await session.get(twoFactorUrl);
        const $otp = cheerio.load(otpPageRes.body);
        
        // Cari form yang benar. Biasanya actionnya mengarah ke path yang sama tanpa query string
        // Logika extraksi form action diperbaiki untuk menangani path relatif
        let formAction = $otp('form').attr('action');
        if (!formAction) {
             // Fallback logic, terkadang form action tidak eksplisit di mobile view (walau kita force desktop)
             formAction = twoFactorUrl.split('?')[0].replace('https://github.com', ''); 
        }

        const otpPayload = extractAllInputs(otpPageRes.body, 'form');
        
        if (!otpPayload.authenticity_token) {
            throw new Error('Gagal mengambil token dari halaman 2FA.');
        }

        // Minta OTP ke User (Telegram)
        const type = location.includes('app') ? 'authenticator' : 'email';
        const otpCode = await otpCallback(type);
        
        // Field name beda: 'app_otp' untuk authenticator, 'otp' untuk email
        if (type === 'authenticator') {
            otpPayload.app_otp = otpCode;
            delete otpPayload.otp; // Hapus jika ada sisa
        } else {
            otpPayload.otp = otpCode;
            delete otpPayload.app_otp;
        }

        logger(`Mengirim OTP (${otpCode}) ke ${formAction}...`);
        
        const postOtpRes = await session.post(`https://github.com${formAction}`, new URLSearchParams(otpPayload).toString(), {
            'Referer': twoFactorUrl
        });

        // Cek jika OTP salah (Biasanya redirect balik ke halaman 2FA atau return 200 di halaman yg sama)
        if (postOtpRes.statusCode === 200) {
            const $fail = cheerio.load(postOtpRes.body);
            const err = $fail('.flash-error').text().trim();
            throw new Error(`OTP Salah: ${err || 'Kode tidak valid.'}`);
        }

        const finalLocation = postOtpRes.headers.location;
        
        // VALIDASI SUKSES: Harus redirect ke root (https://github.com/)
        if (postOtpRes.statusCode === 302 && finalLocation === 'https://github.com/') {
            logger('OTP Diterima. Mengakses Dashboard...');
            // INI KUNCINYA: Akses URL redirect untuk memicu set-cookie 'logged_in'
            finalResponse = await session.get(finalLocation);
        } else {
            throw new Error(`Gagal verifikasi OTP. Redirect tidak dikenal: ${finalLocation}`);
        }

    } else if (location === 'https://github.com/') {
        logger('Login berhasil tanpa 2FA. Mengakses Dashboard...');
        finalResponse = await session.get(location);
    } else {
        throw new Error(`Redirect login tidak dikenal: ${location}`);
    }

    // 4. Verifikasi Akhir
    if (finalResponse.statusCode !== 200) {
        throw new Error(`Gagal akses dashboard. Status: ${finalResponse.statusCode}`);
    }

    const $ = cheerio.load(finalResponse.body);
    // Kita cek meta tag user-login yang ada di source code dashboard github
    const loggedInUser = $('meta[name="user-login"]').attr('content');

    if (loggedInUser && loggedInUser.toLowerCase() === config.username.toLowerCase()) {
        logger(`✅ SUKSES: Login sebagai ${loggedInUser}`);
    } else {
        // Coba parsing JSON client-env sebagai fallback
        try {
            const env = JSON.parse($('#client-env').text());
            if (env.login) {
                logger(`✅ SUKSES (via env): Login sebagai ${env.login}`);
                return;
            }
        } catch(e) {}
        
        throw new Error(`Sesi tidak valid. Terdeteksi sebagai: ${loggedInUser || 'Guest'}`);
    }
};
// --- END OF FILE services/github/steps/1_login.js ---