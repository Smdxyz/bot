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
        Referer: loginUrl // Set specific Referer for this request
    });

    const location = postLoginRes.headers.location;
    logger(`Redirect terdeteksi ke: ${location}`);

    // 3. Handle Redirects for 2FA or Success
    // Case 1: 2FA via Authenticator App is required
    if (location && location.includes('/sessions/two-factor/app')) {
        logger('Terdeteksi 2FA via Authenticator App...');
        
        const otpPageRes = await session.get(location);
        const otpPayload = extractAllInputs(otpPageRes.body, 'form[action="/sessions/two-factor"]');
        if (!otpPayload.authenticity_token) {
            throw new Error('Gagal mendapatkan token dari halaman 2FA Authenticator.');
        }

        const otpCode = await otpCallback('authenticator');
        otpPayload.app_otp = otpCode;

        logger('Mengirim kode OTP Authenticator...');
        const postOtpRes = await session.post('https://github.com/sessions/two-factor', new URLSearchParams(otpPayload).toString(), {
            Referer: location // Pass the correct Referer (the OTP page)
        });

        if (postOtpRes.headers.location !== 'https://github.com/') {
            throw new Error('Gagal verifikasi 2FA Authenticator. Kode mungkin salah.');
        }
        logger('Verifikasi 2FA Authenticator berhasil.');

    // Case 2: 2FA via Email (New Device Verification) is required
    } else if (location && location.includes('/sessions/verified-device')) {
        logger('Terdeteksi verifikasi perangkat baru (Email OTP)...');

        const verifyPageRes = await session.get(location);
        const verifyPayload = extractAllInputs(verifyPageRes.body, 'form[action="/sessions/verified-device"]');
         if (!verifyPayload.authenticity_token) {
            throw new Error('Gagal mendapatkan token dari halaman verifikasi perangkat.');
        }

        const emailOtp = await otpCallback('email');
        verifyPayload.otp = emailOtp;

        logger('Mengirim kode OTP Email...');
        const postVerifyRes = await session.post('https://github.com/sessions/verified-device', new URLSearchParams(verifyPayload).toString(), {
            Referer: location // Pass the correct Referer (the verification page)
        });

        if (postVerifyRes.headers.location !== 'https://github.com/') {
            throw new Error('Gagal verifikasi perangkat via email. Kode mungkin salah.');
        }
        logger('Verifikasi perangkat via email berhasil.');
        
    // Case 3: Direct login success (no 2FA)
    } else if (location !== 'https://github.com/') {
        // If it redirects somewhere else, it's likely a failure (e.g., wrong password)
        const $ = cheerio.load(postLoginRes.body);
        const errorMessage = $('.flash-error').text().trim();
        throw new Error(`Login gagal. Pesan dari GitHub: "${errorMessage || 'Kredensial salah.'}"`);
    }

    // 4. Final Verification: Check the dashboard page
    logger('Verifikasi sesi login di halaman utama...');
    const finalRes = await session.get('https://github.com/');
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