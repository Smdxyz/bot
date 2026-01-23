// --- START OF FILE services/github/steps/1_login.js ---

import { extractAllInputs } from '../../../lib/utils.js';
import * as cheerio from 'cheerio';

/**
 * Handles the entire login process for GitHub, including 2FA.
 * @param {import('../../../lib/network.js').HttpSession} session The current HTTP session.
 * @param {object} config User configuration { username, password }.
 * @param {function(string): Promise<string>} otpCallback Async function to prompt the user for an OTP.
 * @param {function(string): void} logger Function to log progress.
 */
export const handleLogin = async (session, config, otpCallback, logger) => {
    const loginUrl = 'https://github.com/login';

    // 1. GET Login Page to retrieve authenticity_token
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
    logger(`Token login ditemukan: ${loginPayload.authenticity_token.substring(0, 10)}...`);
    
    // 2. POST Login Credentials
    logger('Mengirim kredensial...');
    const postLoginRes = await session.post('https://github.com/session', new URLSearchParams(loginPayload).toString(), {
        'Referer': loginUrl
    });

    const location = postLoginRes.headers.location;

    // Early exit if login failed (e.g. wrong password)
    if (postLoginRes.statusCode === 200 && postLoginRes.url.includes('/login')) {
        const $ = cheerio.load(postLoginRes.body);
        const errorMessage = $('.flash-error').text().trim();
        throw new Error(`Login gagal. Pesan dari GitHub: "${errorMessage || 'Kredensial salah.'}"`);
    }

    logger(`Redirect terdeteksi ke: ${location}`);

    // 3. Handle Redirects for 2FA or Success
    if (location && (location.includes('/sessions/two-factor/app') || location.includes('/sessions/verified-device'))) {
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
        const postOtpRes = await session.post(`https://github.com${formAction}`, new URLSearchParams(otpPayload).toString(), {
            'Referer': twoFactorPageUrl // === INI KUNCI PERBAIKANNYA ===
        });

        if (postOtpRes.statusCode !== 302 || !postOtpRes.headers.location?.endsWith('github.com/')) {
             throw new Error(`Verifikasi 2FA gagal. Kode mungkin salah atau sesi kadaluarsa.`);
        }
        logger('Verifikasi 2FA berhasil.');

    } else if (location !== 'https://github.com/') {
        throw new Error(`Login gagal. Redirect tidak terduga ke: ${location}`);
    }

    // 4. Final Verification: Check the dashboard page
    logger('Verifikasi sesi login di halaman utama...');
    const finalRes = await session.get('https://github.com/');
    if (finalRes.statusCode !== 200) {
        throw new Error(`Gagal membuka halaman utama setelah login. Status: ${finalRes.statusCode}`);
    }

    const $ = cheerio.load(finalRes.body);
    try {
        const envJson = $('#client-env').text();
        const env = JSON.parse(envJson);

        if (env.login && env.login.toLowerCase() === config.username.toLowerCase()) {
            logger(`✅ Login berhasil sebagai: ${env.login}`);
        } else {
            throw new Error(`Verifikasi gagal. User yang login (${env.login || 'tidak diketahui'}) tidak sesuai dengan target (${config.username}).`);
        }
    } catch (e) {
        throw new Error(`Gagal mem-parsing data sesi setelah login. Mungkin halaman tidak termuat sempurna. Error: ${e.message}`);
    }
};
// --- END OF FILE services/github/steps/1_login.js ---