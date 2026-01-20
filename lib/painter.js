import { createCanvas, loadImage } from 'canvas';
import QRCode from 'qrcode';
import axios from 'axios';
import sharp from 'sharp';

// Helper: Title Case
const toTitleCase = (str) => {
    if (!str) return '';
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
};

// Helper: Extract Year from Date String
const getYearOnly = (dateStr) => {
    if (!dateStr) return '2029';
    // Jika format DD-MM-YYYY atau YYYY-MM-DD, ambil 4 digit terakhir/pertama
    const match = dateStr.match(/\d{4}/);
    return match ? match[0] : dateStr;
};

export const drawKTM = async (data) => {
    const {
        univName,
        fullName,
        photoUrl,
        prodi,
        fakultas,
        nim,
        angkatan,
        validUntil,
        status = "LULUS"
    } = data;

    // Canvas Size High Res (Standar ID Card)
    const width = 1011;
    const height = 638;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // PALETTE WARNA (Disesuaikan dengan Audit)
    const colors = {
        bluePrimary: '#005b9f',   // Biru Header (Academic Blue)
        yellowAccent: '#f39c12',  // Kuning Emas (Flat)
        textName: '#004a80',      // Biru Nama
        textValue: '#212529',     // Hitam Pekat untuk Data
        textLabel: '#95a5a6',     // Abu-abu Terang (Light Grey) untuk Label
        bgWhite: '#ffffff',
        borderPhotoBlue: '#80bdff' // Biru muda untuk border luar foto
    };

    // ==========================================
    // 1. BACKGROUND & PATTERN (Audit: Add Dot Pattern)
    // ==========================================
    ctx.fillStyle = colors.bgWhite;
    ctx.fillRect(0, 0, width, height);

    // -- DOT PATTERN (Titik-titik Halus) --
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.06)'; // Abu-abu sangat transparan
    const spacing = 14; // Jarak antar titik
    for (let y = 0; y < height; y += spacing) {
        // Offset baris genap agar zig-zag (pola honeycomb halus)
        const xOffset = (y / spacing) % 2 === 0 ? 0 : spacing / 2;
        for (let x = -spacing; x < width; x += spacing) {
            ctx.beginPath();
            ctx.arc(x + xOffset, y, 1.2, 0, Math.PI * 2); // Radius titik 1.2px
            ctx.fill();
        }
    }
    ctx.restore();

    // -- WATERMARK "HOLOGRAM" (Audit: Teks Transparan) --
    // Terletak di bawah kiri, besar, transparan
    ctx.save();
    ctx.translate(200, 520);
    ctx.rotate(0); 
    ctx.font = '900 60px Arial'; // Heavy Bold
    ctx.fillStyle = 'rgba(0, 0, 0, 0.04)'; // Sangat samar
    ctx.letterSpacing = "5px";
    ctx.fillText("HOLOGRAM", 0, 0);
    ctx.restore();

    // ==========================================
    // 2. HEADER AREA
    // ==========================================
    const headerH = 142;

    // Blok Biru
    ctx.fillStyle = colors.bluePrimary;
    ctx.fillRect(0, 0, width, headerH);
    
    // List Kuning Bawah Header
    ctx.fillStyle = colors.yellowAccent;
    ctx.fillRect(0, headerH - 5, width, 5);

    // -- LOGO (Audit: Perkecil Ukuran) --
    const logoX = 85;
    const logoY = 70;
    ctx.save();
    ctx.translate(logoX, logoY);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    // Radius diperkecil dari 42 ke 36
    ctx.beginPath(); ctx.arc(0, 0, 36, 0, Math.PI * 2); ctx.stroke();
    // Globe Lines
    ctx.beginPath(); ctx.ellipse(0, 0, 36, 12, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, 12, 36, 0, 0, Math.PI * 2); ctx.stroke();
    // Stars
    ctx.fillStyle = colors.yellowAccent;
    ctx.font = '12px Arial';
    ctx.fillText("★", -5, -20);
    ctx.fillText("★", -22, -8);
    ctx.fillText("★", 12, -8);
    ctx.restore();

    // -- TEKS HEADER --
    ctx.textAlign = 'center';
    const centerX = width / 2 + 20; // Sedikit geser ke kanan kompensasi logo

    // 1. Republik Indonesia
    ctx.fillStyle = colors.yellowAccent;
    ctx.font = 'bold 13px Arial';
    ctx.letterSpacing = "1px";
    ctx.fillText('REPUBLIK INDONESIA', centerX, 38);
    ctx.letterSpacing = "0px";

    // 2. Nama Universitas (Audit: Font Serif Bold Condensed-ish)
    ctx.fillStyle = '#ffffff';
    let fontSize = 46;
    ctx.font = `bold ${fontSize}px "Times New Roman"`; // Pakai Times agar mirip Serif referensi
    // Resize logic
    while (ctx.measureText(univName).width > 780) {
        fontSize -= 2;
        ctx.font = `bold ${fontSize}px "Times New Roman"`;
    }
    ctx.fillText(univName, centerX, 88);

    // 3. Kartu Tanda Mahasiswa
    ctx.fillStyle = colors.yellowAccent;
    ctx.font = '14px Arial';
    ctx.letterSpacing = "1px";
    ctx.fillText('KARTU TANDA MAHASISWA', centerX, 118);


    // ==========================================
    // 3. FOTO PROFIL (Audit: Border Biru Muda Halus)
    // ==========================================
    const photoX = 60;
    const photoY = 180;
    const photoW = 230;
    const photoH = 290;

    // Background placeholder
    ctx.fillStyle = '#ecf0f1';
    ctx.fillRect(photoX, photoY, photoW, photoH);

    try {
        if (photoUrl) {
            const response = await axios.get(photoUrl, { responseType: 'arraybuffer' });
            const pngBuffer = await sharp(response.data)
                .resize(photoW, photoH, { fit: 'cover' })
                .png()
                .toBuffer();
            const photoImg = await loadImage(pngBuffer);
            ctx.drawImage(photoImg, photoX, photoY, photoW, photoH);
        }
    } catch (e) {}

    // Border 1: Putih Tebal (Dalam)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.strokeRect(photoX, photoY, photoW, photoH);

    // Border 2: Biru/Abu Muda Halus (Luar) - Audit Requirement
    ctx.strokeStyle = colors.borderPhotoBlue; 
    ctx.lineWidth = 2;
    ctx.strokeRect(photoX - 3, photoY - 3, photoW + 6, photoH + 6);


    // ==========================================
    // 4. DATA TEXT (Audit: Perbaikan Hierarki Warna)
    // ==========================================
    const textX = 340;
    let textY = 210;
    ctx.textAlign = 'left';

    // -- NAMA --
    // Audit: "Heavy Bold", Tracking renggang
    ctx.fillStyle = colors.textName;
    ctx.font = '900 32px Arial'; // 900 = Heavy Bold
    ctx.letterSpacing = "1px";
    ctx.fillText(fullName.toUpperCase(), textX, textY);
    ctx.letterSpacing = "0px";

    // Garis Bawah Nama
    ctx.fillStyle = '#bdc3c7'; // Abu muda (bukan biru tua, agar tidak tabrakan)
    ctx.fillRect(textX, textY + 12, 580, 2); 

    textY += 55;

    // Helper Data
    const renderRow = (label, value) => {
        // LABEL: Audit -> "Abu-abu Terang"
        ctx.fillStyle = colors.textLabel; 
        ctx.font = '12px Arial'; // Regular
        ctx.fillText(label, textX, textY);
        
        textY += 25;
        
        // VALUE: Audit -> "Tebal dan Menonjol"
        ctx.fillStyle = colors.textValue;
        ctx.font = 'bold 20px Arial'; 
        ctx.fillText(value, textX, textY);
        
        textY += 42; // Jarak antar section diperbesar (Audit: Leading)
    };

    renderRow('NIM', nim);
    renderRow('PROGRAM STUDI', toTitleCase(prodi));
    renderRow('FAKULTAS', toTitleCase(fakultas));


    // ==========================================
    // 5. STATUS BOX (Audit: Warna Muted)
    // ==========================================
    const boxY = textY + 5;
    const boxH = 40;

    // Kotak Angkatan (Outline Biru Muted)
    ctx.strokeStyle = colors.bluePrimary;
    ctx.lineWidth = 1;
    ctx.strokeRect(textX, boxY, 130, boxH);
    
    // Teks Angkatan
    ctx.textAlign = 'center';
    ctx.fillStyle = colors.bluePrimary;
    ctx.font = 'bold 10px Arial';
    ctx.fillText("ANGKATAN", textX + 65, boxY + 13);
    ctx.font = 'bold 17px Arial';
    ctx.fillText(angkatan, textX + 65, boxY + 33);

    // Kotak Status (Solid, Warna Emas Gelap/Terracota - Audit)
    const boxStatusX = textX + 150;
    ctx.fillStyle = '#d35400'; // Terracotta / Dark Orange (Sesuai referensi NU yang agak gelap)
    if (status.toUpperCase() === 'LULUS' || status.toUpperCase() === 'AKTIF') {
         ctx.fillStyle = colors.yellowAccent; // Kembali ke Kuning Emas jika referensi NU pakai kuning
    }
    // Override manual agar sesuai Dokumen 1 (Kuning Emas Solid)
    ctx.fillStyle = '#f39c12'; 
    
    ctx.fillRect(boxStatusX, boxY, 130, boxH);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 17px Arial';
    ctx.fillText(status.toUpperCase(), boxStatusX + 65, boxY + 26);


    // ==========================================
    // 6. FOOTER (Audit: Format Tanggal & Hologram Text)
    // ==========================================
    
    // Garis Kuning Bawah
    ctx.fillStyle = colors.yellowAccent;
    ctx.fillRect(0, height - 15, width, 15);

    // Teks BERLAKU HINGGA
    // Audit: Format hanya tahun, rata kiri margin
    const expiryYear = getYearOnly(validUntil);
    
    ctx.textAlign = 'left';
    ctx.fillStyle = '#7f8c8d'; // Abu gelap
    ctx.font = '14px Arial';
    // Align X sama dengan foto (60)
    ctx.fillText(`BERLAKU HINGGA: ${expiryYear}`, 60, height - 35); 


    // ==========================================
    // 7. QR CODE
    // ==========================================
    const qrSize = 90;
    const qrX = width - 110;
    const qrY = height - 120;

    // Background Putih QR
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10);

    const qrText = `KTM-${nim}/${fullName}`;
    const qrUrl = await QRCode.toDataURL(qrText, { margin: 0, width: 100 });
    const qrImage = await loadImage(qrUrl);
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

    return canvas.toBuffer('image/png');
};