// --- START OF FILE services/github/steps/2_profile.js ---

import { extractAllInputs } from '../../../lib/utils.js';
import * as cheerio from 'cheerio';

/**
 * Handles setting the user's full name on their GitHub profile.
 * @param {import('../../../lib/network.js').HttpSession} session The current HTTP session.
 * @param {object} config User configuration including { username, fullName }.
 * @param {function(string): void} logger Function to log progress.
 */
export const handleProfile = async (session, config, logger) => {
    const profileUrl = 'https://github.com/settings/profile';
    const postUrl = `https://github.com/users/${config.username}`;

    // 1. GET the profile settings page to get the form and token
    logger('Mengambil halaman pengaturan profil...');
    const getProfileRes = await session.get(profileUrl);
    if (getProfileRes.statusCode !== 200) {
        throw new Error(`Gagal membuka halaman profil. Status: ${getProfileRes.statusCode}`);
    }

    // 2. Extract the form data
    logger('Mengekstrak form profil...');
    const profilePayload = extractAllInputs(getProfileRes.body, `form[action="/users/${config.username}"]`);
    
    if (!profilePayload.authenticity_token) {
        throw new Error('Gagal mengekstrak authenticity_token dari form profil.');
    }
    
    // 3. Set the new name in the payload
    const newName = config.fullName;
    profilePayload['user[profile_name]'] = newName;
    logger(`Menyiapkan untuk mengubah nama menjadi: "${newName}"`);

    // 4. POST the updated profile data with _method=put
    logger('Mengirim pembaruan nama profil...');
    const postPayload = new URLSearchParams(profilePayload).toString();
    const postProfileRes = await session.post(postUrl, postPayload, {
        'Referer': profileUrl
    });

    // 5. Verify the redirect
    const location = postProfileRes.headers.location;
    if (postProfileRes.statusCode !== 302 || !location || !location.endsWith('/settings/profile')) {
        const bodyText = postProfileRes.body.substring(0, 500);
        throw new Error(`Pembaruan profil gagal. Redirect tidak terduga. Status: ${postProfileRes.statusCode}, Lokasi: ${location || 'tidak ada'}. Body: ${bodyText}`);
    }
    logger('Redirect sukses, memverifikasi perubahan...');

    // 6. Final verification by reloading the page and checking the value
    const verifyRes = await session.get(profileUrl);
    const $ = cheerio.load(verifyRes.body);
    const updatedName = $('#user_profile_name').val();

    if (updatedName === newName) {
        logger(`✅ Verifikasi berhasil. Nama telah diubah menjadi "${updatedName}".`);
    } else {
        throw new Error(`Verifikasi gagal. Nama di halaman adalah "${updatedName}", seharusnya "${newName}".`);
    }
};
// --- END OF FILE services/github/steps/2_profile.js ---