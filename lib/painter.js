import { createCanvas, loadImage } from 'canvas';
import QRCode from 'qrcode';
import axios from 'axios';
import sharp from 'sharp';

// Helper: Title Case (Huruf Besar Awal)
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
        status = "AKTIF" // Default status jika tidak ada
    } = data;

    // Canvas Size High Res (Rasio ID Card standar)
    const width = 1011;
    const height = 638;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // ==========================================
    // 0. COLOR PALETTE (Diambil dari Dokumen 1)
    // ==========================================
    const palette = {
        bluePrimary: '#006cb5',    // Biru Header & Nama (Lebih cerah dari navy)
        blueDark: '#004a80',       // Biru Border Foto
        yellowGold: '#fcae16',     // Kuning Header & Status Box
        greyLabel: '#9aa0a6',      // Abu-abu Label (Tipis/Terang)
        textBlack: '#202124',      // Hitam Value
        bgWhite: '#ffffff'
    };

    // ==========================================
    // 1. BACKGROUND & SECURITY PATTERN (Fix: Dot Pattern)
    // ==========================================
    ctx.fillStyle = palette.bgWhite;
    ctx.fillRect(0, 0, width, height);

    // Pola Titik/Dot Halus (Grid Pattern) - Menggantikan Gelombang
    ctx.save();
    ctx.fillStyle = 'rgba(0, 108, 181, 0.05)'; // Biru sangat muda transparan
    const dotSpacing = 12;
    for (let y = 0; y < height; y += dotSpacing) {
        for (let x = 0; x < width; x += dotSpacing) {
            ctx.beginPath();
            ctx.arc(x, y, 1.5, 0, Math.PI * 2); // Titik radius 1.5px
            ctx.fill();
        }
    }
    ctx.restore();
    
    // WATERMARK "HOLOGRAM" (Bawah Kiri) - Fix Posisi & Teks
    ctx.save();
    ctx.translate(180, 520); // Posisi disesuaikan dengan area kosong kiri bawah
    ctx.rotate(0); // Tidak miring di referensi, atau miring sedikit sekali
    ctx.font = 'bold 50px Arial';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.04)'; // Sangat transparan (watermark effect)
    ctx.fillText("HOLOGRAM", 0, 0);
    ctx.restore();

    // ==========================================
    // 2. HEADER AREA
    // ==========================================
    const headerH = 145;
    
    // Blok Biru Solid
    ctx.fillStyle = palette.bluePrimary;
    ctx.fillRect(0, 0, width, headerH);
    
    // List Kuning (Garis bawah header)
    ctx.fillStyle = palette.yellowGold;
    ctx.fillRect(0, headerH - 5, width, 5);

    // Teks: REPUBLIK INDONESIA (Kuning, Kecil, Atas)
    ctx.fillStyle = palette.yellowGold;
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.letterSpacing = "1px";
    ctx.fillText('REPUBLIK INDONESIA', width / 2, 40);
    ctx.letterSpacing = "0px";

    // Teks: NAMA UNIVERSITAS (Putih, Serif, Besar)
    ctx.fillStyle = '#ffffff';
    let fontSize = 48; // Font besar
    ctx.font = `bold ${fontSize}px "Times New Roman"`; 
    
    // Auto resize jika nama universitas kepanjangan
    while (ctx.measureText(univName).width > 800) {
        fontSize -= 2;
        ctx.font = `bold ${fontSize}px "Times New Roman"`;
    }
    ctx.fillText(univName, width / 2, 95); 

    // Teks: KARTU TANDA MAHASISWA (Kuning, Spacing Lebar)
    ctx.fillStyle = palette.yellowGold;
    ctx.font = '14px Arial';
    ctx.fillText('KARTU TANDA MAHASISWA', width / 2, 125);

    // LOGO "SEAL" (Kiri Atas - Abstrak Placeholder sesuai Doc 1)
    // Di Doc 1 ada logo lingkaran garis-garis di kiri header
    const logoX = 90;
    const logoY = 72;
    ctx.save();
    ctx.translate(logoX, logoY);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 48, 0, Math.PI*2); // Lingkaran luar
    ctx.stroke();
    
    // Icon buku/simbol sederhana di dalam
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(-15, -15, 30, 30);
    ctx.beginPath();
    ctx.moveTo(0, -50); ctx.lineTo(0, 50); // Garis vertikal samar
    ctx.moveTo(-50, 0); ctx.lineTo(50, 0); // Garis horizontal samar
    ctx.stroke();
    ctx.restore();

    // ==========================================
    // 3. FOTO PROFIL (Double Border Fix)
    // ==========================================
    const photoX = 50;
    const photoY = 175;
    const photoW = 230;
    const photoH = 290; // Aspect ratio 4:5 approx

    // Background Foto (Placeholder abu jika gagal load)
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(photoX, photoY, photoW, photoH);

    try {
        if (photoUrl) {
            const response = await axios.get(photoUrl, { responseType: 'arraybuffer' });
            // Crop & Resize agar pas
            const pngBuffer = await sharp(response.data)
                .resize(photoW, photoH, { fit: 'cover' })
                .png()
                .toBuffer();
            const photoImg = await loadImage(pngBuffer);
            ctx.drawImage(photoImg, photoX, photoY, photoW, photoH);
        }
    } catch (e) {
        console.log("Error loading photo:", e);
    }

    // Border Foto:
    // 1. Stroke Putih di Dalam (3px)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6; // Set 6 karena stroke centered (3px inside image area)
    ctx.strokeRect(photoX, photoY, photoW, photoH);

    // 2. Stroke Biru Ganda (Tipis di luar putih)
    ctx.strokeStyle = palette.bluePrimary;
    ctx.lineWidth = 2;
    // Gambar rect sedikit di luar border putih
    ctx.strokeRect(photoX - 3, photoY - 3, photoW + 6, photoH + 6);

    // ==========================================
    // 4. DATA TEXT (Koreksi Tipografi & Garis Nama)
    // ==========================================
    const textX = 320; // Mulai teks sebelah kanan foto
    let textY = 205;
    ctx.textAlign = 'left';

    // --- NAMA ---
    // Font: Bold, Biru, Uppercase
    ctx.fillStyle = palette.bluePrimary;
    ctx.font = 'bold 28px Arial'; 
    ctx.fillText(fullName.toUpperCase(), textX, textY);
    
    // Garis Bawah Nama (Custom Line - Tebal Biru)
    // Ini bukan underline font biasa, tapi rect terpisah
    const nameWidth = ctx.measureText(fullName.toUpperCase()).width;
    const lineLength = Math.max(nameWidth, 250); // Minimal panjang garis
    ctx.fillStyle = palette.bluePrimary;
    ctx.fillRect(textX, textY + 10, lineLength, 3); // Tebal 3px

    textY += 50; // Jarak ke data berikutnya

    // Helper Function Render Data
    const renderDataField = (label, value) => {
        // LABEL: Tipis, Kecil, Abu-abu (Perbaikan Audit)
        ctx.fillStyle = palette.greyLabel;
        ctx.font = '12px Arial'; // Regular/Normal weight
        ctx.fillText(label, textX, textY);
        
        textY += 22; // Jarak label ke value
        
        // VALUE: Tebal, Hitam/Gelap, Lebih Besar
        ctx.fillStyle = palette.textBlack;
        ctx.font = 'bold 18px Arial'; 
        ctx.fillText(value, textX, textY);
        
        textY += 38; // Jarak ke baris berikutnya
    };

    renderDataField('NIM', nim);
    renderDataField('PROGRAM STUDI', toTitleCase(prodi));
    renderDataField('FAKULTAS', toTitleCase(fakultas));

    // ==========================================
    // 5. STATUS BOX (Fix Warna & Layout)
    // ==========================================
    const boxY = textY + 10;
    
    // Kotak 1: ANGKATAN (Outline Biru)
    const boxAngkatanW = 120;
    const boxH = 40;
    
    ctx.strokeStyle = palette.bluePrimary;
    ctx.lineWidth = 1;
    ctx.strokeRect(textX, boxY, boxAngkatanW, boxH);
    
    // Label "ANGKATAN" (kecil di dalam kotak atas)
    ctx.fillStyle = palette.bluePrimary;
    ctx.textAlign = 'center';
    ctx.font = 'bold 9px Arial';
    ctx.fillText("ANGKATAN", textX + (boxAngkatanW/2), boxY + 12);
    // Value Angkatan
    ctx.font = 'bold 16px Arial';
    ctx.fillText(angkatan, textX + (boxAngkatanW/2), boxY + 32);

    // Kotak 2: STATUS (Solid Kuning/Emas - Sesuai Dok 1 "LULUS")
    // Dok 1 background kuning, teks putih
    const boxStatusX = textX + boxAngkatanW + 20;
    const boxStatusW = 120;
    
    ctx.fillStyle = palette.yellowGold;
    ctx.fillRect(boxStatusX, boxY, boxStatusW, boxH);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(status.toUpperCase(), boxStatusX + (boxStatusW/2), boxY + 26); // Vertikal Center

    // ==========================================
    // 6. FOOTER (Fix: Clean Background)
    // ==========================================
    
    // Garis Dekoratif Kuning Paling Bawah
    ctx.fillStyle = palette.yellowGold;
    ctx.fillRect(0, height - 12, width, 12);

    // Teks Berlaku Hingga
    // PENTING: Tidak ada kotak background warna (sesuai kritik)
    // Teks langsung di atas pola titik background
    ctx.textAlign = 'left';
    ctx.fillStyle = '#5f6368'; // Abu tua
    ctx.font = '14px Arial';
    // Posisi X sejajar dengan Foto
    ctx.fillText(`BERLAKU HINGGA: ${validUntil}`, 50, height - 35);

    // QR Code (Kanan Bawah)
    const qrSize = 90;
    const qrX = width - 110;
    const qrY = height - 120;
    
    // Border putih QR agar kontras dengan background dot
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10);
    
    // Generate QR
    const qrText = `KTM-${nim}/${fullName}`;
    const qrUrl = await QRCode.toDataURL(qrText, { margin: 0, width: 100 });
    const qrImage = await loadImage(qrUrl);
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

    return canvas.toBuffer('image/png');
};