// --- START OF FILE services/github/steps/1_login.js ---

import { extractAllInputs } from '../../../lib/utils.js';
import * as cheerio from 'cheerio';

export const handleLogin = async (session, config, otpCallback, logger) => {
    const loginUrl = 'https://github.com/login';

    // 1. GET Login Page
    logger('Mengambil halaman login...');
    const loginPageRes = await session.get(loginUrl);
    if (loginPageRes.statusCode !== 200) {
        throw new Error(`Gagal memuat halaman login. Status: ${loginPageRes.statusCode}`);
    }
    const loginPayload = extractAllInputs(loginPageRes.body, 'form[action="/session"]');
    if (!loginPayload.authenticity_token) {
        throw new Error('Gagal mengekstrak authenticity_token dari halaman login.');
    }
    loginPayload.login = config.username;
    loginPayload.password = config.password;

    // 2. POST Login Credentials
    logger('Mengirim kredensial...');
    const postLoginRes = await session.post('https://github.com/session', new URLSearchParams(loginPayload).toString(), { 'Referer': loginUrl });

    // Handle wrong password (GitHub returns 200 OK but shows error on page)
    if (postLoginRes.statusCode === 200 && postLoginRes.url.includes('/login')) {
        const $ = cheerio.load(postLoginRes.body);
        const errorMessage = $('.flash-error').text().trim();
        throw new Error(`Login gagal. Pesan dari GitHub: "${errorMessage || 'Kredensial salah.'}"`);
    }
    
    // Check for redirect header
    const location = postLoginRes.headers.location;
    if (!location) {
        throw new Error('Login gagal. Tidak ada redirect setelah mengirim kredensial. Periksa kembali username dan password Anda.');
    }
    logger(`Redirect terdeteksi ke: ${location}`);

    let finalPageResponse;

    // 3. Handle 2FA or Success Redirect
    if (location.includes('/sessions/two-factor') || location.includes('/sessions/verified-device')) {
        const isAppAuth = location.includes('/sessions/two-factor/app');
        const twoFactorPageUrl = location;
        
        logger(`Memerlukan verifikasi 2FA (${isAppAuth ? 'Authenticator App' : 'Email'})...`);
        const otpPageRes = await session.get(twoFactorPageUrl);

        const formAction = isAppAuth ? '/sessions/two-factor' : '/sessions/verified-device';
        const otpPayload = extractAllInputs(otpPageRes.body, `form[action="${formAction}"]`);
        
        if (!otpPayload.authenticity_token) {
            throw new Error(`Gagal mendapatkan token dari halaman 2FA (${twoFactorPageUrl}).`);
        }

        const otpCode = await otpCallback(isAppAuth ? 'authenticator' : 'email');
        otpPayload[isAppAuth ? 'app_otp' : 'otp'] = otpCode;

        logger('Mengirim kode OTP...');
        const postOtpRes = await session.post(`https://github.com${formAction}`, new URLSearchParams(otpPayload).toString(), { 'Referer': twoFactorPageUrl });
        
        // Check if OTP was wrong (GitHub returns 200 with error message)
        if (postOtpRes.statusCode === 200 && postOtpRes.url.includes(formAction.slice(1))) {
            const $ = cheerio.load(postOtpRes.body);
            const errorMessage = $('#js-flash-container .flash-error').text().trim();
            throw new Error(`Verifikasi 2FA gagal. ${errorMessage || 'Kode OTP yang Anda masukkan salah.'}`);
        }
        
        // On success, we expect a 302 redirect to the homepage.
        if (postOtpRes.statusCode !== 302 || !postOtpRes.headers.location?.endsWith('github.com/')) {
             throw new Error(`Verifikasi 2FA gagal. Respon tidak terduga setelah OTP. Redirect: ${postOtpRes.headers.location || 'tidak ada'}`);
        }
        
        logger('Verifikasi 2FA berhasil. Mengikuti redirect ke halaman utama...');
        // Manually follow the final redirect to get the final session cookies. THIS IS THE KEY.
        finalPageResponse = await session.get(postOtpRes.headers.location, { 'Referer': `https://github.com${formAction}` });

    } else if (location.endsWith('github.com/')) {
        logger('Login berhasil tanpa 2FA. Mengikuti redirect...');
        finalPageResponse = await session.get(location, { 'Referer': loginUrl });
    } else {
        throw new Error(`Login berhasil tetapi redirect tidak terduga ke: ${location}`);
    }

    // 4. Final Verification
    logger('Verifikasi sesi login di halaman utama...');
    if (finalPageResponse.statusCode !== 200) {
        throw new Error(`Gagal membuka halaman utama setelah login. Status: ${finalPageResponse.statusCode}`);
    }

    const $ = cheerio.load(finalPageResponse.body);
    try {
        const envJson = $('#client-env').text();
        if (!envJson) throw new Error("Elemen #client-env tidak ditemukan. Verifikasi akhir gagal.");
        
        const env = JSON.parse(envJson);
        if (env.login && env.login.toLowerCase() === config.username.toLowerCase()) {
            logger(`✅ Login berhasil sebagai: ${env.login}`);
        } else {
            throw new Error(`Verifikasi gagal. User yang login (${env.login || '?'}) tidak cocok dengan target (${config.username}).`);
        }
    } catch (e) {
        throw new Error(`Gagal mem-parsing data sesi setelah login. Error: ${e.message}`);
    }
};
// --- END OF FILE services/github/steps/1_login.js ---