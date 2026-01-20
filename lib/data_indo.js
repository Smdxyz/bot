// lib/data_indo.js

// Database Universitas Besar (Campuran Nama Internasional & Lokal Resmi)
export const universities = [
    // --- SUMATERA ---
    "Universitas Syiah Kuala", "Universitas Sumatera Utara (USU)", "Universitas Negeri Medan",
    "Universitas Andalas", "Universitas Negeri Padang", "Universitas Riau", 
    "UIN Sultan Syarif Kasim", "Universitas Jambi", "Universitas Sriwijaya", 
    "Universitas Lampung", "Universitas Bengkulu", "Universitas Batam",
    
    // --- DKI JAKARTA & BANTEN ---
    "Universitas Indonesia (UI)", "UIN Syarif Hidayatullah", "Universitas Negeri Jakarta",
    "Universitas Trisakti", "Binus University", "Universitas Gunadarma", 
    "Universitas Mercu Buana", "Universitas Tarumanagara", "Universitas Pancasila",
    "Universitas Pelita Harapan (UPH)", "Swiss German University", "Prasetiya Mulya University",
    "Universitas Multimedia Nusantara", "UIN Jakarta", "Institut Sains dan Teknologi Nasional",

    // --- JAWA BARAT ---
    "Institut Teknologi Bandung (ITB)", "Universitas Padjadjaran (UNPAD)", "IPB University",
    "Universitas Pendidikan Indonesia", "Telkom University", "UIN Sunan Gunung Djati",
    "Universitas Parahyangan", "Universitas Islam Bandung", "Universitas Pasundan",
    "President University", "Institut Teknologi Nasional (ITENAS)", "Universitas Siliwangi",

    // --- JAWA TENGAH & DIY ---
    "Universitas Gadjah Mada (UGM)", "Universitas Negeri Yogyakarta", "UIN Sunan Kalijaga",
    "Universitas Diponegoro (UNDIP)", "Universitas Negeri Semarang", "Universitas Sebelas Maret (UNS)",
    "Institut Seni Indonesia Yogyakarta", "Universitas Islam Indonesia (UII)", 
    "Universitas Muhammadiyah Yogyakarta", "Universitas Ahmad Dahlan", "Universitas Atma Jaya Yogyakarta",
    "NU University of Surakarta", "Universitas Muhammadiyah Surakarta", "UIN Walisongo",
    "Universitas Jenderal Soedirman", "Universitas Tidar", "Universitas Dian Nuswantoro",

    // --- JAWA TIMUR ---
    "Universitas Airlangga (UNAIR)", "Institut Teknologi Sepuluh Nopember (ITS)", 
    "Universitas Brawijaya (UB)", "Universitas Negeri Malang", "UIN Maulana Malik Ibrahim",
    "Universitas Jember", "Universitas Trunojoyo Madura", "Universitas Negeri Surabaya (UNESA)",
    "Universitas Pembangunan Nasional Veteran Jatim", "Universitas Muhammadiyah Malang",
    "Petra Christian University", "Universitas Ciputra", "Politeknik Elektronika Negeri Surabaya",

    // --- BALI & NUSA TENGGARA ---
    "Universitas Udayana", "Universitas Pendidikan Ganesha", "ISI Denpasar",
    "Universitas Warmadewa", "Universitas Mataram", "Universitas Nusa Cendana",

    // --- KALIMANTAN ---
    "Universitas Tanjungpura", "Universitas Lambung Mangkurat", "Universitas Mulawarman",
    "Universitas Palangka Raya", "Universitas Borneo Tarakan",

    // --- SULAWESI ---
    "Universitas Hasanuddin (UNHAS)", "Universitas Negeri Makassar", "UIN Alauddin Makassar",
    "Universitas Sam Ratulangi", "Universitas Negeri Manado", "Universitas Tadulako",
    "Universitas Halu Oleo", "Universitas Negeri Gorontalo",

    // --- MALUKU & PAPUA ---
    "Universitas Pattimura", "Universitas Khairun", 
    "Universitas Cenderawasih", "Universitas Papua", "Universitas Musamus Merauke"
];

// Database Fakultas dan Jurusan yang Sinkron
export const faculties = {
    "Fakultas Teknik": [
        "Teknik Informatika", "Teknik Sipil", "Teknik Mesin", "Teknik Elektro", 
        "Teknik Industri", "Arsitektur", "Teknik Kimia", "Perencanaan Wilayah Kota"
    ],
    "Fakultas Ilmu Komputer": [
        "Sistem Informasi", "Ilmu Komputer", "Teknologi Informasi", 
        "Desain Komunikasi Visual", "Rekayasa Perangkat Lunak"
    ],
    "Fakultas Ekonomi dan Bisnis": [
        "Manajemen", "Akuntansi", "Ilmu Ekonomi", "Ekonomi Pembangunan", 
        "Bisnis Digital", "Manajemen Bisnis Internasional"
    ],
    "Fakultas Hukum": [
        "Ilmu Hukum", "Hukum Pidana Islam", "Hukum Bisnis"
    ],
    "Fakultas Kedokteran": [
        "Pendidikan Dokter", "Kedokteran Gigi", "Farmasi", "Keperawatan", "Gizi Kesehatan"
    ],
    "Fakultas Ilmu Sosial & Politik": [
        "Ilmu Komunikasi", "Hubungan Internasional", "Administrasi Publik", 
        "Sosiologi", "Ilmu Pemerintahan"
    ],
    "Fakultas Psikologi": [
        "Psikologi"
    ],
    "Fakultas Pertanian": [
        "Agroteknologi", "Agribisnis", "Teknologi Pangan", "Kehutanan"
    ],
    "Fakultas Ilmu Budaya": [
        "Sastra Inggris", "Sastra Indonesia", "Sastra Jepang", "Pariwisata"
    ]
};

// Nama Generator
export const firstNamesMale = [
    "Muhammad", "Ahmad", "Satria", "Rizky", "Aditya", "Budi", "Fajar", "Bayu", 
    "Kevin", "Michael", "Reza", "Sandi", "Bagus", "Ilham", "Wahyu", "Dimas",
    "Eko", "Dwi", "Arjuna", "Bima", "Candra", "Dani", "Ezra", "Farhan"
];

export const firstNamesFemale = [
    "Siti", "Nur", "Putri", "Dinda", "Ayu", "Dewi", "Fitri", "Lestari", 
    "Indah", "Rina", "Sarah", "Annisa", "Nadia", "Ika", "Ratna", "Mega",
    "Aurelia", "Bella", "Citra", "Diana", "Eva", "Fanny", "Gita", "Hana"
];

export const lastNames = [
    "Pratama", "Saputra", "Wijaya", "Santoso", "Ramadhan", "Kurniawan", "Hidayat",
    "Nugroho", "Setiawan", "Utama", "Pangestu", "Wibowo", "Siregar", "Nasution",
    "Simanjuntak", "Sihombing", "Ginting", "Sembiring", "Wanggai", "Rumagesan",
    "Mahendra", "Wahyudi", "Kusuma", "Lestari", "Permata", "Sari", "Rahmawati",
    "Hutapea", "Panggabean", "Manullang", "Lubis", "Baswedan", "Yudhoyono"
];