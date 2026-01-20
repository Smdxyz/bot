// lib/randomizer.js
import { fakerID_ID as faker } from '@faker-js/faker'; // Pake locale Indo buat default
import { getRandomIndoUniv } from './data_manager.js';

// Helper array statis (opsional, jika faker kurang spesifik untuk prodi)
const facultiesStatic = {
    "FAKULTAS TEKNIK": ["TEKNIK INFORMATIKA", "TEKNIK SIPIL", "TEKNIK MESIN", "ARSITEKTUR"],
    "FAKULTAS EKONOMI": ["MANAJEMEN", "AKUNTANSI", "ILMU EKONOMI"],
    "FAKULTAS ILMU SOSIAL": ["ILMU KOMUNIKASI", "HUBUNGAN INTERNASIONAL", "ADMINISTRASI NEGARA"],
    "FAKULTAS KEDOKTERAN": ["PENDIDIKAN DOKTER", "FARMASI", "KEPERAWATAN"]
};

const randArr = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Fungsi Helper untuk generate detail akademik KTM
const getAcademicDetails = (univData) => {
    // Coba ambil fakultas dari data univ jika ada, jika kosong pakai static
    let selectedFacultyName, selectedProdi;
    
    if (univData && univData.faculties && univData.faculties.length > 0) {
        // Data faculties di json kadang string, kadang object. Asumsi string nama fakultas
        // Kita random aja nama fakultasnya, trus prodi kita random dari faker atau static
        // Karena struktur JSON text.txt facultiesnya array string
        selectedFacultyName = randArr(univData.faculties).toUpperCase();
        // Fallback prodi karena JSON tidak sediakan prodi per fakultas secara detail
        selectedProdi = "ILMU " + selectedFacultyName.replace('FAKULTAS ', ''); 
    } else {
        const keys = Object.keys(facultiesStatic);
        selectedFacultyName = randArr(keys);
        selectedProdi = randArr(facultiesStatic[selectedFacultyName]);
    }

    // LOGIKA WAKTU REAL-TIME (JAN 2026)
    const angkatan = 2025; 
    const expYear = angkatan + 4; // 2029

    // Generate NIM
    const yearCode = angkatan.toString().substring(2); 
    const randCode = randInt(10, 99); 
    const sequence = randInt(1001, 5000);
    const nim = `${yearCode}${randCode}${randInt(10, 99)}${sequence}`;

    return {
        fakultas: selectedFacultyName,
        prodi: selectedProdi,
        angkatan: angkatan.toString(),
        nim: nim,
        validUntil: `31-08-${expYear}`
    };
};

// 1. FULL RANDOM KTM (Indo)
export const generateFullRandom = () => {
    const sex = Math.random() > 0.5 ? 'male' : 'female'; // faker uses 'male'/'female'
    const gender = sex === 'male' ? 'pria' : 'wanita'; // output uses 'pria'/'wanita'

    // Generate Nama pakai Faker
    const firstName = faker.person.firstName(sex);
    const lastName = faker.person.lastName(sex);
    const fullName = `${firstName} ${lastName}`.toUpperCase();

    // Ambil Univ dari Data Manager
    const univData = getRandomIndoUniv();
    
    // Gunakan English Name sesuai request untuk KTM Style tertentu, atau Nama asli
    // Di KTM biasanya nama asli Indo, tapi prompt minta "ambil nama Englishnya aja buat data id card ktm indo"
    // Saya akan pakai English Name di variable univName
    const univName = univData.englishName ? univData.englishName.toUpperCase() : univData.name.toUpperCase();

    // Detail Akademik
    const academic = getAcademicDetails(univData);

    return {
        fullName,
        univName, // Ini English Name
        gender,
        ...academic
    };
};

// 2. SEMI AUTO KTM
export const generateSemiAuto = (userInput) => {
    const academic = getAcademicDetails(null); // Random fakultas/prodi
    return {
        univName: userInput.univName.toUpperCase(),
        fullName: userInput.fullName.toUpperCase(),
        gender: userInput.gender.toLowerCase(),
        ...academic
    };
};

// 3. GENERATE TEACHER DATA (Canva)
export const generateTeacherData = (countryKey) => {
    // Reset faker locale based on country if needed (optional, keeping default EN/ID mix is usually safe)
    const sex = Math.random() > 0.5 ? 'male' : 'female';
    
    const firstName = faker.person.firstName(sex);
    const lastName = faker.person.lastName(sex);
    
    // Auto DOB Teacher: Umur 25 - 60 tahun
    const dobDate = faker.date.birthdate({ min: 25, max: 60, mode: 'age' });
    const dobString = dobDate.toLocaleDateString('en-GB'); // DD/MM/YYYY

    return {
        fullName: `${firstName} ${lastName}`,
        dob: dobString,
        gender: sex === 'male' ? 'pria' : 'wanita',
        idNum: faker.string.numeric(8) // Random 8 digit ID
    };
};