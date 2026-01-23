// --- START OF FILE services/github/steps/2fa_setup.js ---

import { extractAllInputs } from '../../../lib/utils.js';
import { authenticator } from 'otplib'; // Import otplib

/**
 * Handles the fully automated setup of Two-Factor Authentication.
 * @param {import('../../../lib/network.js').HttpSession} session The current HTTP session.
 * @param {object} config User configuration.
 * @param {function(string): void} logger Function to log progress.
 * @returns {Promise<{setupKey: string, recoveryCodes: string[]}>} The setup key and recovery codes.
 */
export const handle2FASetup = async (session, config, logger) => {
    const introUrl = 'https://github.com/settings/two_factor_authentication/setup/intro';
    const initiateUrl = 'https://github.com/settings/two_factor_authentication/setup/initiate';
    const verifyUrl = 'https://github.com/settings/two_factor_authentication/setup/verify';
    const enableUrl = 'https://github.com/settings/two_factor_authentication/setup/enable';

    // 1. GET the 2FA setup intro page to get the first token
    logger('Mengambil halaman intro 2FA...');
    const introRes = await session.get(introUrl);
    if (introRes.statusCode !== 200) {
        throw new Error(`Gagal membuka halaman intro 2FA. Status: ${introRes.statusCode}`);
    }
    const authToken = extractAllInputs(introRes.body)['authenticity_token'];
    if (!authToken) {
        throw new Error('Gagal mengekstrak token dari halaman intro 2FA.');
    }

    // 2. POST to initiate app setup and get QR/secret key
    logger('Memulai setup authenticator app...');
    const initiatePayload = new URLSearchParams({ type: 'app', authenticity_token: authToken });
    
    const initiateRes = await session.post(initiateUrl, initiatePayload.toString(), {
        Referer: introUrl,
        'Content-Type': 'application/x-www-form-urlencoded',
    });

    if (initiateRes.statusCode !== 200) {
        throw new Error(`Gagal memulai 2FA. Status: ${initiateRes.statusCode}`);
    }

    const { mashed_secret: setupKey, formatted_recovery_codes: recoveryCodes } = JSON.parse(initiateRes.body);
    if (!setupKey || !recoveryCodes) {
        throw new Error('Gagal mendapatkan setup key atau recovery codes dari API.');
    }
    logger(`Setup Key diterima: ${setupKey}`);
    logger(`Recovery Codes diterima: ${recoveryCodes.length} kode.`);

    // 3. GENERATE OTP INTERNALLY using otplib
    const otp = authenticator.generate(setupKey);
    logger(`Menghasilkan OTP secara internal: ${otp}`);

    // 4. Verify the generated OTP
    const verifyPayload = new URLSearchParams({
        'otp': otp,
        'type': 'app',
        'authenticity_token': authToken
    });

    logger('Mengirim kode OTP yang digenerate untuk verifikasi...');
    const verifyRes = await session.post(verifyUrl, verifyPayload.toString(), {
        Referer: introUrl,
        'Content-Type': 'application/x-www-form-urlencoded',
    });

    // A successful verification returns a 200 OK with an empty body.
    if (verifyRes.statusCode !== 200 || verifyRes.body) {
        throw new Error(`Verifikasi OTP gagal. Status: ${verifyRes.statusCode}. Kode mungkin salah.`);
    }
    logger('Verifikasi OTP berhasil.');

    // 5. POST to finalize and enable 2FA
    logger('Menyelesaikan dan mengaktifkan 2FA...');
    const enablePayload = new URLSearchParams({
        'authenticity_token': authToken,
        'type': 'app'
    });
    const enableRes = await session.post(enableUrl, enablePayload.toString(), {
        Referer: introUrl,
        'Content-Type': 'application/x-www-form-urlencoded',
    });
    
    if (enableRes.statusCode !== 200) {
        throw new Error(`Gagal mengaktifkan 2FA. Status: ${enableRes.statusCode}`);
    }
    logger('2FA berhasil diaktifkan di akun GitHub.');

    return { setupKey, recoveryCodes };
};
// --- END OF FILE services/github/steps/2fa_setup.js ---