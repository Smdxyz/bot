import { createCanvas, loadImage } from 'canvas';
import QRCode from 'qrcode';
import axios from 'axios';
import sharp from 'sharp';

// Helper: Title Case
const toTitleCase = (str) => {
    if (!str) return '';
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
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
        status = "LULUS" // Default sesuai referensi
    } = data;

    // Canvas Size High Res (1011 x 638 px)
    const width = 1011;
    const height = 638;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // PALETTE WARNA (Sesuai Referensi Dokumen 1)
    const colors = {
        blueHeader: '#0e4c92',    // Biru NU / Biru Tua
        yellowAccent: '#f39c12',  // Kuning Emas
        textBlue: '#0b3d75',      // Biru Teks Nama
        textBlack: '#212529',     // Hitam Value
        labelGray: '#6c757d',     // Abu-abu Label
        bgWhite: '#ffffff',
        hologram: '#dfe6e9'       // Abu-abu perak
    };

    // ==========================================
    // 1. BACKGROUND (Pola Guilloche Halus)
    // ==========================================
    ctx.fillStyle = colors.bgWhite;
    ctx.fillRect(0, 0, width, height);

    // Pattern Background Sangat Halus
    ctx.save();
    ctx.strokeStyle = 'rgba(14, 76, 146, 0.03)'; // Biru sangat transparan
    ctx.lineWidth = 1;
    // Menggambar pola gelombang halus horizontal
    for (let y = 150; y < height; y += 8) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x < width; x += 20) {
            ctx.quadraticCurveTo(x + 10, y + 4, x + 20, y);
        }
        ctx.stroke();
    }
    ctx.restore();

    // ==========================================
    // 2. HEADER AREA (Perbaikan Total)
    // ==========================================
    const headerH = 140;

    // Blok Biru Utama
    ctx.fillStyle = colors.blueHeader;
    ctx.fillRect(0, 0, width, headerH);
    
    // Garis Kuning di Bawah Header
    ctx.fillStyle = colors.yellowAccent;
    ctx.fillRect(0, headerH - 4, width, 4);

    // -- LOGO KIRI (Simbol Globe/NU Style) --
    // Mengganti crosshair dengan Globe
    const logoX = 80;
    const logoY = 70;
    ctx.save();
    ctx.translate(logoX, logoY);
    ctx.strokeStyle = 'rgba(255,255,255, 0.9)'; // Putih terang
    ctx.lineWidth = 2;
    
    // Lingkaran Luar
    ctx.beginPath();
    ctx.arc(0, 0, 42, 0, Math.PI * 2);
    ctx.stroke();
    
    // Garis Lintang (Horizontal Ellipse)
    ctx.beginPath();
    ctx.ellipse(0, 0, 42, 14, 0, 0, Math.PI * 2);
    ctx.stroke();
    
    // Garis Bujur (Vertical Ellipse)
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 42, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Bintang-bintang kecil di atas (Ciri khas NU)
    ctx.fillStyle = colors.yellowAccent;
    ctx.font = '14px Arial';
    ctx.fillText("★", -6, -25); // Atas
    ctx.fillText("★", -25, -10); // Kiri
    ctx.fillText("★", 13, -10);  // Kanan
    ctx.restore();


    // -- TEKS HEADER --
    ctx.textAlign = 'center';
    
    // 1. REPUBLIK INDONESIA (Kuning, Kecil, Atas)
    ctx.fillStyle = colors.yellowAccent;
    ctx.font = 'bold 13px Arial';
    ctx.letterSpacing = "1px";
    ctx.fillText('REPUBLIK INDONESIA', width / 2 + 30, 35); // Geser dikit krn ada logo
    ctx.letterSpacing = "0px";

    // 2. NAMA UNIVERSITAS (Putih, Serif Times New Roman, Besar)
    ctx.fillStyle = '#ffffff';
    let fontSize = 44;
    ctx.font = `bold ${fontSize}px "Times New Roman"`;
    // Auto scaling
    while (ctx.measureText(univName).width > 750) {
        fontSize -= 2;
        ctx.font = `bold ${fontSize}px "Times New Roman"`;
    }
    ctx.fillText(univName, width / 2 + 30, 85);

    // 3. KARTU TANDA MAHASISWA (Kuning, Bawah)
    ctx.fillStyle = colors.yellowAccent;
    ctx.font = '14px Arial';
    ctx.fillText('KARTU TANDA MAHASISWA', width / 2 + 30, 115);


    // ==========================================
    // 3. FOTO PROFIL (Border Fix)
    // ==========================================
    const photoX = 55;
    const photoY = 175;
    const photoW = 240;
    const photoH = 300; // Rasio 4:5

    // Placeholder Background
    ctx.fillStyle = '#dfe6e9';
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
    } catch (e) {
        console.log("Gagal load foto, pakai placeholder");
    }

    // -- BORDER FOTO --
    // 1. Border Putih (Tebal, Dalam)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5; 
    ctx.strokeRect(photoX, photoY, photoW, photoH);

    // 2. Border Biru (Sangat Tipis, Luar) - Sesuai Referensi
    ctx.strokeStyle = colors.blueHeader;
    ctx.lineWidth = 1; // Tipis saja
    ctx.strokeRect(photoX - 2.5, photoY - 2.5, photoW + 5, photoH + 5);


    // ==========================================
    // 4. DATA MAHASISWA (Layout & Typography)
    // ==========================================
    const textX = 330;
    let textY = 205;
    ctx.textAlign = 'left';

    // NAMA (Biru, Bold, Uppercase)
    ctx.fillStyle = colors.textBlue;
    ctx.font = 'bold 30px Arial';
    ctx.fillText(fullName.toUpperCase(), textX, textY);

    // GARIS BAWAH NAMA (Tipis, Biru)
    ctx.beginPath();
    ctx.moveTo(textX, textY + 10);
    ctx.lineTo(textX + 550, textY + 10); // Panjang garis fixed
    ctx.lineWidth = 2;
    ctx.strokeStyle = colors.blueHeader;
    ctx.stroke();

    textY += 50;

    // Helper Function Render Field
    const renderField = (label, value) => {
        // Label (Abu-abu, Kecil, Regular)
        ctx.fillStyle = colors.labelGray;
        ctx.font = '12px Arial'; 
        ctx.fillText(label, textX, textY);
        
        textY += 25;
        
        // Value (Hitam, Bold, Besar)
        ctx.fillStyle = colors.textBlack;
        ctx.font = 'bold 19px Arial';
        ctx.fillText(value, textX, textY);
        
        textY += 40; // Spacing antar field
    };

    renderField('NIM', nim);
    renderField('PROGRAM STUDI', toTitleCase(prodi));
    renderField('FAKULTAS', toTitleCase(fakultas));


    // ==========================================
    // 5. STATUS BOX (Angkatan & Status)
    // ==========================================
    const boxY = textY + 10;
    const boxH = 42;

    // Kotak 1: ANGKATAN (Outline Biru, Teks Biru)
    ctx.strokeStyle = colors.blueHeader;
    ctx.lineWidth = 1;
    ctx.strokeRect(textX, boxY, 130, boxH);
    
    // Label kecil "ANGKATAN"
    ctx.fillStyle = colors.blueHeader;
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText("ANGKATAN", textX + 65, boxY + 14);
    
    // Value Angkatan
    ctx.font = 'bold 18px Arial';
    ctx.fillText(angkatan, textX + 65, boxY + 34);

    // Kotak 2: STATUS (Solid Kuning/Orange, Teks Putih) - Sesuai Dokumen 1
    const statusBoxX = textX + 150;
    ctx.fillStyle = colors.yellowAccent;
    ctx.fillRect(statusBoxX, boxY, 130, boxH);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px Arial';
    ctx.fillText(status.toUpperCase(), statusBoxX + 65, boxY + 28); // Center Vertikal


    // ==========================================
    // 6. FOOTER & HOLOGRAM (Perbaikan Posisi)
    // ==========================================
    
    // Garis Kuning Paling Bawah
    ctx.fillStyle = colors.yellowAccent;
    ctx.fillRect(0, height - 15, width, 15);

    // Teks: BERLAKU HINGGA
    ctx.textAlign = 'left';
    ctx.fillStyle = '#636e72'; // Abu gelap
    ctx.font = '14px Arial';
    // Posisi di atas area hologram
    ctx.fillText(`BERLAKU HINGGA: ${validUntil}`, 50, height - 60);

    // -- KOTAK HOLOGRAM (Simulasi Foil) --
    // Terletak DI BAWAH teks berlaku hingga
    const holoX = 50;
    const holoY = height - 50;
    const holoW = 100;
    const holoH = 25;

    // Background Hologram (Gradient Silver)
    const grd = ctx.createLinearGradient(holoX, holoY, holoX + holoW, holoY + holoH);
    grd.addColorStop(0, "#dfe6e9");
    grd.addColorStop(0.5, "#ffffff"); // Efek kilau
    grd.addColorStop(1, "#b2bec3");
    
    ctx.fillStyle = grd;
    ctx.fillRect(holoX, holoY, holoW, holoH);
    
    // Border Hologram Halus
    ctx.strokeStyle = '#b2bec3';
    ctx.lineWidth = 1;
    ctx.strokeRect(holoX, holoY, holoW, holoH);

    // Teks "HOLOGRAM" kecil di dalam kotak
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText("HOLOGRAM", holoX + (holoW/2), holoY + 16);


    // ==========================================
    // 7. QR CODE
    // ==========================================
    const qrSize = 95;
    const qrX = width - 120;
    const qrY = height - 130; // Di atas garis kuning bawah

    // Background Putih di belakang QR (agar bersih)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10);

    const qrText = `KTM-${nim}/${fullName}`;
    const qrUrl = await QRCode.toDataURL(qrText, { margin: 0, width: 100 });
    const qrImage = await loadImage(qrUrl);
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

    return canvas.toBuffer('image/png');
};