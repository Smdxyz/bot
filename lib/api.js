import axios from 'axios';
// Hapus import FormData, kita pakai URLSearchParams bawaan Node.js

export const generatePersonImage = async (gender = 'pria') => {
    try {
        console.log(`⏳ Meminta API membuat foto ${gender}...`);

        // Prompt kita pertajam
        const prompt = `close up portrait of indonesian university student ${gender}, 20 years old, wearing white formal shirt and black blazer, looking at camera, plain blue studio background, id card photo style, high quality, realistic, 8k`;

        // GANTI METODE: Pakai URLSearchParams (x-www-form-urlencoded)
        // Ini lebih stabil daripada FormData untuk kirim text di Node.js
        const params = new URLSearchParams();
        params.append("prompt", prompt);
        params.append("style", "no style"); // Sesuai request API
        params.append("aspectRatio", "1:1"); // Kita coba 1:1 biar pas di kotak foto

        // 1. Request Job ke API
        const initReq = await axios.post("https://szyrineapi.biz.id/api/img/pixnova/text-to-image", params, {
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded', // Header wajib buat URLSearchParams
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        // Cek response awal
        if (!initReq.data || !initReq.data.result || !initReq.data.result.jobId) {
            console.error("❌ Response API Aneh:", JSON.stringify(initReq.data));
            throw new Error("Gagal mendapatkan Job ID.");
        }

        const jobId = initReq.data.result.jobId;
        console.log(`✅ Job ID didapat: ${jobId}, menunggu hasil...`);
        
        const statusUrl = `https://szyrineapi.biz.id/api/img/job?jobId=${jobId}`;

        // 2. Polling Status (Looping cek status)
        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 3000)); // Tunggu 3 detik
            
            const check = await axios.get(statusUrl);
            const res = check.data;

            // Debugging status biar tau progress
            // console.log(`   Status: ${res.result?.status}`); 

            if (res.result && res.result.status === "completed") {
                console.log("✅ Foto berhasil dibuat!");
                return res.result.result; // URL Gambar
            }
            
            if (res.result && res.result.status === "failed") {
                console.error("❌ API Status: Failed");
                throw new Error("Server gagal memproses gambar.");
            }
        }
        
        throw new Error("Waktu habis (Timeout) saat menunggu gambar.");

    } catch (error) {
        // LOGGING DETAIL ERROR
        if (error.response) {
            console.error("❌ API ERROR RESPONSE:", error.response.status);
            console.error("📄 DATA:", JSON.stringify(error.response.data));
        } else {
            console.error("❌ Error System:", error.message);
        }
        return null;
    }
};