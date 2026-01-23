// --- START OF FILE services/github/steps/4_edu.js ---

import { extractAllInputs } from '../../../lib/utils.js';
import { drawKTM } from '../../../lib/painter.js'; // Import painter utama
import { generatePersonImage } from '../../../lib/api.js'; // Import API gambar
import * as cheerio from 'cheerio';

/**
 * Handles the application for the GitHub Student Developer Pack.
 * @param {import('../../../lib/network.js').HttpSession} session The current HTTP session.
 * @param {object} config User configuration including { fullName, sex, email }.
 * @param {function(string): void} logger Function to log progress.
 */
export const handleEduApply = async (session, config, logger) => {
    const benefitsUrl = 'https://github.com/settings/education/benefits';
    const applicationUrl = 'https://github.com/settings/education/developer_pack_applications';
    
    // --- Data Statis Sesuai Instruksi ---
    const schoolData = {
        name: "NU University of Surakarta",
        id: "82921",
        latitude: "-7.570020342507728",
        longitude: "110.80568597565748",
    };

    // 1. GET the initial education benefits page to get the authenticity_token
    logger('Mengambil halaman GitHub Education...');
    const getBenefitsRes = await session.get(benefitsUrl);
    if (getBenefitsRes.statusCode !== 200) {
        throw new Error(`Gagal membuka halaman GitHub Education. Status: ${getBenefitsRes.statusCode}`);
    }

    const initialPayload = extractAllInputs(getBenefitsRes.body, 'form[action="/settings/education/developer_pack_applications"]');
    if (!initialPayload.authenticity_token) {
        throw new Error('Gagal mengekstrak authenticity_token dari halaman Education.');
    }
    
    // 2. POST the initial school and location data
    logger(`Memilih sekolah: ${schoolData.name}`);
    initialPayload['dev_pack_form[application_type]'] = 'student';
    initialPayload['dev_pack_form[selected_school_id]'] = schoolData.id;
    initialPayload['dev_pack_form[school_name]'] = schoolData.name;
    initialPayload['dev_pack_form[school_email]'] = config.email;
    initialPayload['dev_pack_form[latitude]'] = schoolData.latitude;
    initialPayload['dev_pack_form[longitude]'] = schoolData.longitude;
    initialPayload['dev_pack_form[location_shared]'] = 'true';
    initialPayload['continue'] = 'Continue';

    const postSchoolRes = await session.post(applicationUrl, new URLSearchParams(initialPayload).toString(), {
        'Referer': benefitsUrl,
        'Turbo-Frame': 'dev-pack-form'
    });

    if (postSchoolRes.statusCode !== 200 || !postSchoolRes.body.includes('dev_pack_form[proof_type]')) {
        throw new Error(`Gagal mendapatkan form upload bukti. Status: ${postSchoolRes.statusCode}`);
    }
    logger('Berhasil mendapatkan form upload, menyiapkan bukti...');

    // 3. Generate the proof (KTM image)
    logger('Membuat gambar KTM sebagai bukti...');
    const ktmData = {
        univName: schoolData.name.toUpperCase(),
        fullName: config.fullName.toUpperCase(),
        gender: config.sex === 'male' ? 'pria' : 'wanita',
        nim: `25${Math.floor(100 + Math.random() * 900)}${Math.floor(1000 + Math.random() * 9000)}`,
        prodi: "ILMU KOMPUTER",
        fakultas: "FAKULTAS ILMU KOMPUTER",
        angkatan: "2025",
        validUntil: `31-08-2029`,
    };

    logger('Meminta foto AI...');
    const photoUrl = await generatePersonImage(ktmData.gender, 'student');
    if (!photoUrl) {
        throw new Error("Gagal mendapatkan foto dari AI untuk bukti KTM.");
    }
    ktmData.photoUrl = photoUrl;
    
    const ktmBuffer = await drawKTM(ktmData);
    const proofBase64 = ktmBuffer.toString('base64');
    logger('Gambar KTM berhasil dibuat dan di-encode ke Base64.');

    // 4. Extract the final form and POST the proof
    const finalPayload = extractAllInputs(postSchoolRes.body, `form[action="${applicationUrl}"]`);
    if (!finalPayload.authenticity_token) {
        throw new Error('Gagal mengekstrak authenticity_token dari form upload.');
    }
    
    finalPayload['dev_pack_form[proof_type]'] = '1. Dated school ID - Good';
    finalPayload['dev_pack_form[photo_proof]'] = JSON.stringify({
        image: `data:image/png;base64,${proofBase64}`,
        metadata: {
            filename: `KTM-${config.username}.png`,
            type: "upload",
            mimeType: "image/png",
            deviceLabel: null
        }
    });
    finalPayload['submit'] = 'Submit Application';

    logger('Mengirim aplikasi final dengan bukti KTM...');
    const submitRes = await session.post(applicationUrl, new URLSearchParams(finalPayload).toString(), {
        'Referer': benefitsUrl,
        'Turbo-Frame': 'dev-pack-form'
    });

    // 5. Final Verification
    if (submitRes.statusCode !== 200) {
        throw new Error(`Pengajuan gagal dengan status code: ${submitRes.statusCode}`);
    }

    const $ = cheerio.load(submitRes.body);
    const successMessage = $('h1').text();
    const expectedMessage = "Thanks for submitting your application";

    if (successMessage && successMessage.includes(expectedMessage)) {
        logger(`✅ Aplikasi berhasil dikirim! Pesan: "${successMessage.trim()}"`);
    } else {
        const errorText = $('.flash-error').text().trim() || 'Pesan sukses tidak ditemukan.';
        throw new Error(`Verifikasi pengajuan gagal. Pesan error: ${errorText}`);
    }
};
// --- END OF FILE services/github/steps/4_edu.js ---