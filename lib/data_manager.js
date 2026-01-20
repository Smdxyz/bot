import fs from 'fs';
import path from 'path';

// Load Data saat inisialisasi
let indoUniversities = [];
let intlUniversities = {};

const loadData = () => {
    try {
        // 1. Load Universitas Indonesia (dari text.txt)
        const indoPath = path.resolve('text.txt');
        if (fs.existsSync(indoPath)) {
            let rawIndo = fs.readFileSync(indoPath, 'utf-8').trim();
            
            // --- FITUR AUTO FIX ---
            // Kalo file dimulai dengan kurung kurawal '{' tapi diakhiri kurung siku ']',
            // berarti user lupa copas '[' di awal. Kita tambahin otomatis.
            if (rawIndo.startsWith('{') && rawIndo.endsWith(']')) {
                console.log("⚠️ Mendeteksi format text.txt kurang '[', sedang memperbaiki otomatis...");
                rawIndo = '[' + rawIndo;
            }
            // ----------------------

            const parsedIndo = JSON.parse(rawIndo);
            
            // Flatten data: ambil semua universitas dari setiap provinsi
            parsedIndo.forEach(prov => {
                if(prov.universities) {
                    prov.universities.forEach(univ => {
                        indoUniversities.push({
                            name: univ.name,
                            englishName: univ.english_name || univ.name, 
                            city: univ.city,
                            faculties: univ.faculties || []
                        });
                    });
                }
            });
            console.log(`✅ Loaded ${indoUniversities.length} Indonesian Universities.`);
        } else {
            console.error("⚠️ File text.txt tidak ditemukan di root folder!");
        }

        // 2. Load Universitas Internasional (dari universities_data.json)
        const intlPath = path.resolve('universities_data.json');
        if (fs.existsSync(intlPath)) {
            const rawIntl = fs.readFileSync(intlPath, 'utf-8');
            intlUniversities = JSON.parse(rawIntl);
            console.log(`✅ Loaded International Universities for ${Object.keys(intlUniversities).length} countries.`);
        } else {
            console.error("⚠️ File universities_data.json tidak ditemukan di root folder!");
        }

    } catch (error) {
        console.error("❌ Error loading data files:", error.message);
        // Jangan exit process biar bot tetep jalan walau data error (fallback mode)
    }
};

// Jalankan load saat file diimport
loadData();

// Helpers
export const getRandomIndoUniv = () => {
    if (indoUniversities.length === 0) return { name: "UNIVERSITAS CONTOH", englishName: "EXAMPLE UNIVERSITY", city: "Jakarta" };
    return indoUniversities[Math.floor(Math.random() * indoUniversities.length)];
};

export const getRandomIntlUniv = (countryName) => {
    // Mapping nama negara dari key Canva (kecil) ke key JSON (Besar/Title Case)
    const keyMap = {
        'spain': 'Spain',
        'uk': 'United Kingdom',
        'france': 'France',
        'netherlands': 'Netherlands',
        'australia': 'Australia',
        'canada': 'Canada'
    };

    const realKey = keyMap[countryName.toLowerCase()] || countryName;
    const list = intlUniversities[realKey];

    if (!list || list.length === 0) {
        return { university_name: "International School", city: "City Center" };
    }
    
    return list[Math.floor(Math.random() * list.length)];
};