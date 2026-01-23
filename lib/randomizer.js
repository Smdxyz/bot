// lib/randomizer.js
import { fakerID_ID as faker } from '@faker-js/faker';
import { getRandomIndoUniv } from './data_manager.js';

// Database Fakultas dan Jurusan yang Sinkron
export const facultiesStatic = {
    "FAKULTAS TEKNIK": ["TEKNIK INFORMATIKA", "TEKNIK SIPIL", "TEKNIK MESIN", "ARSITEKTUR"],
    "FAKULTAS ILMU KOMPUTER": ["SISTEM INFORMASI", "ILMU KOMPUTER", "TEKNOLOGI INFORMASI"],
    "FAKULTAS EKONOMI DAN BISNIS": ["MANAJEMEN", "AKUNTANSI", "ILMU EKONOMI"],
    "FAKULTAS HUKUM": ["ILMU HUKUM"],
    "FAKULTAS KEDOKTERAN": ["PENDIDIKAN DOKTER", "FARMASI", "KEPERAWATAN"],
    "FAKULTAS ILMU SOSIAL & POLITIK": ["ILMU KOMUNIKASI", "HUBUNGAN INTERNASIONAL"],
};

const randArr = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const getAcademicDetails = (univData) => {
    let selectedFacultyName, selectedProdi;
    
    if (univData && univData.faculties && univData.faculties.length > 0) {
        selectedFacultyName = randArr(univData.faculties).toUpperCase();
        const staticKeys = Object.keys(facultiesStatic);
        const randomStaticFaculty = randArr(staticKeys);
        selectedProdi = randArr(facultiesStatic[randomStaticFaculty]);
    } else {
        const keys = Object.keys(facultiesStatic);
        selectedFacultyName = randArr(keys);
        selectedProdi = randArr(facultiesStatic[selectedFacultyName]);
    }

    const angkatan = 2025;
    const expYear = angkatan + 4;
    const yearCode = angkatan.toString().substring(2);
    const nim = `${yearCode}${randInt(10, 99)}${randInt(10, 99)}${randInt(1001, 5000)}`;

    return {
        fakultas: selectedFacultyName,
        prodi: selectedProdi,
        angkatan: angkatan.toString(),
        nim: nim,
        validUntil: `31-08-${expYear}`
    };
};

export const generateFullRandom = () => {
    const sex = Math.random() > 0.5 ? 'male' : 'female';
    const gender = sex === 'male' ? 'pria' : 'wanita';

    const firstName = faker.person.firstName(sex);
    const lastName = faker.person.lastName(sex);
    const fullName = `${firstName} ${lastName}`.toUpperCase();

    const univData = getRandomIndoUniv();
    const univName = (univData.englishName || univData.name).toUpperCase();
    const academic = getAcademicDetails(univData);

    return { fullName, univName, gender, ...academic };
};

// DIUBAH: Fungsi ini sekarang lebih fleksibel dan selalu menghasilkan data lengkap
export const generateSemiAuto = (userInput) => {
    const academic = getAcademicDetails(null);
    return {
        univName: userInput.univName.toUpperCase(),
        fullName: userInput.fullName.toUpperCase(),
        gender: userInput.gender.toLowerCase(),
        fakultas: academic.fakultas,
        prodi: academic.prodi,
        nim: academic.nim,
        angkatan: academic.angkatan,
        validUntil: academic.validUntil
    };
};

export const generateTeacherData = (countryKey) => {
    const sex = Math.random() > 0.5 ? 'male' : 'female';
    const firstName = faker.person.firstName(sex);
    const lastName = faker.person.lastName(sex);
    
    const dobDate = faker.date.birthdate({ min: 25, max: 60, mode: 'age' });
    const dobString = dobDate.toLocaleDateString('en-GB');

    return {
        fullName: `${firstName} ${lastName}`,
        dob: dobString,
        gender: sex === 'male' ? 'pria' : 'wanita',
        idNum: faker.string.numeric(8)
    };
};