// --- START OF FILE lib/api.js ---

import axios from 'axios';

export const generatePersonImage = async (gender = 'pria', context = 'student') => {
    try {
        console.log(`⏳ Meminta API membuat foto ${gender} (Konteks: ${context})...`);

        let prompt;

        // --- LOGIKA BARU: PROMPT FLEKSIBEL ---
        if (context === 'teacher') {
            // Prompt untuk guru (Canva)
            prompt = `professional headshot of a school teacher, ${gender === 'pria' ? 'male' : 'female'}, 35 years old, wearing formal attire, smiling friendly, plain white studio background, id card photo style, high quality, realistic, 8k`;
        } else {
            // Prompt default untuk mahasiswa (KTM)
            prompt = `close up portrait of indonesian university student ${gender}, 20 years old, wearing white formal shirt and black blazer, looking at camera, plain blue studio background, id card photo style, high quality, realistic, 8k`;
        }

        const params = new URLSearchParams();
        params.append("prompt", prompt);
        params.append("style", "no style");
        params.append("aspectRatio", "1:1");

        const initReq = await axios.post("https://szyrineapi.biz.id/api/img/pixnova/text-to-image", params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!initReq.data || !initReq.data.result || !initReq.data.result.jobId) {
            console.error("❌ Response API Aneh:", JSON.stringify(initReq.data));
            throw new Error("Gagal mendapatkan Job ID.");
        }

        const jobId = initReq.data.result.jobId;
        console.log(`✅ Job ID didapat: ${jobId}, menunggu hasil...`);

        const statusUrl = `https://szyrineapi.biz.id/api/img/job?jobId=${jobId}`;

        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 3000));

            const check = await axios.get(statusUrl);
            const res = check.data;

            if (res.result && res.result.status === "completed") {
                console.log("✅ Foto berhasil dibuat!");
                return res.result.result;
            }

            if (res.result && res.result.status === "failed") {
                console.error("❌ API Status: Failed");
                throw new Error("Server gagal memproses gambar.");
            }
        }

        throw new Error("Waktu habis (Timeout) saat menunggu gambar.");

    } catch (error) {
        if (error.response) {
            console.error("❌ API ERROR RESPONSE:", error.response.status);
            console.error("📄 DATA:", JSON.stringify(error.response.data));
        } else {
            console.error("❌ Error System:", error.message);
        }
        return null;
    }
};


// --- END OF FILE lib/api.js ---