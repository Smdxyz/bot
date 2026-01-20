import { createCanvas, loadImage, registerFont } from 'canvas';
import QRCode from 'qrcode';
import axios from 'axios';
import sharp from 'sharp';

export const drawKTM = async (data) => {
    const {
        univName,
        fullName,
        photoUrl,
        prodi,
        fakultas,
        nim,
        angkatan,
        validUntil
    } = data;

    // Dimensi Canvas High Res
    const width = 1011;
    const height = 638;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // ==========================================
    // 0. PREPARE FOTO (Sharp Converter)
    // ==========================================
    let photoImage;
    try {
        if (photoUrl) {
            const response = await axios.get(photoUrl, { responseType: 'arraybuffer' });
            const pngBuffer = await sharp(response.data)
                .resize(300, 400, { fit: 'cover' })
                .png()
                .toBuffer();
            photoImage = await loadImage(pngBuffer);
        }
    } catch (e) {
        console.error("Error Foto:", e.message);
        photoImage = null; 
    }

    // ==========================================
    // 1. BACKGROUND & PATTERN
    // ==========================================
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Pattern Dot Halus (Background Putih Berbintik)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.03)'; 
    for(let x = 0; x < width; x += 15) {
        for(let y = 160; y < height - 60; y += 15) {
            ctx.beginPath();
            ctx.arc(x, y, 1.2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ==========================================
    // 2. HEADER AREA (MIRIP NU SURAKARTA)
    // ==========================================
    const headerHeight = 155;
    const primaryBlue = '#0e4c92'; // Biru Tua Deep (Sesuai Sample)
    const accentGold = '#f1c40f'; // Kuning Emas Cerah

    // Blok Header Biru
    ctx.fillStyle = primaryBlue;
    ctx.fillRect(0, 0, width, headerHeight);

    // Garis Kuning Bawah Header
    ctx.fillStyle = accentGold;
    ctx.fillRect(0, headerHeight - 6, width, 6);

    // --- LOGO UNIVERSITAS (Kiri) ---
    // Simulasi Logo Bulat dengan Icon Buku (Mirip NU/Pendidikan)
    const logoX = 85;
    const logoY = 78;
    
    ctx.save();
    ctx.translate(logoX, logoY);
    
    // Lingkaran Luar (Putih Transparan)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 50, 0, Math.PI * 2);
    ctx.stroke();

    // Lingkaran Dalam (Icon Buku Abstrak)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.arc(0, 0, 42, 0, Math.PI * 2);
    ctx.fill();

    // Icon Buku/Simbol Tengah
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-15, -15, 30, 30); // Kotak tengah
    ctx.fillStyle = primaryBlue;
    ctx.fillRect(-2, -15, 4, 30); // Garis jilid buku

    ctx.restore();


    // --- TEKS HEADER (Rata Kiri, Digeser ke Kanan) ---
    // KUNCI: startX dimulai setelah logo (160px) biar gak nabrak
    const textStartX = 170; 
    ctx.textAlign = 'left'; 

    // 1. REPUBLIK INDONESIA (Kuning, Kecil, Di Atas)
    ctx.fillStyle = accentGold; 
    ctx.font = 'bold 15px Arial';
    ctx.fillText('REPUBLIK INDONESIA', textStartX, 45);

    // 2. NAMA UNIVERSITAS (Putih, Serif/Times New Roman, Besar)
    ctx.fillStyle = '#ffffff';
    let univSize = 46; 
    ctx.font = `bold ${univSize}px "Times New Roman", serif`;
    
    // Auto Resize Logic (Width Based)
    // Kecilkan font kalau teks melebihi batas kanan canvas
    while (ctx.measureText(univName.toUpperCase()).width > (width - textStartX - 20)) {
        univSize -= 2;
        ctx.font = `bold ${univSize}px "Times New Roman", serif`;
    }
    ctx.fillText(univName.toUpperCase(), textStartX, 95);

    // 3. KARTU TANDA MAHASISWA (Kuning, Align Left dengan Univ)
    ctx.fillStyle = accentGold;
    ctx.font = '16px Arial'; // Sans serif standar
    ctx.letterSpacing = "1px";
    ctx.fillText('KARTU TANDA MAHASISWA', textStartX, 130);
    ctx.letterSpacing = "0px";


    // ==========================================
    // 3. FOTO PROFIL (Reference Style)
    // ==========================================
    const photoX = 50;
    const photoY = 190;
    const photoW = 240;
    const photoH = 320;

    // Shadow Foto (Deep & Soft)
    ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 5;
    ctx.shadowOffsetY = 5;

    // Draw Foto
    if (photoImage) {
        ctx.drawImage(photoImage, photoX, photoY, photoW, photoH);
    } else {
        // Fallback
        ctx.fillStyle = '#ccc';
        ctx.fillRect(photoX, photoY, photoW, photoH);
    }

    // Reset Shadow buat border
    ctx.shadowColor = "transparent";

    // Border: Putih Tebal (Inner) + Biru Tipis (Outer)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.strokeRect(photoX, photoY, photoW, photoH);
    
    ctx.strokeStyle = primaryBlue;
    ctx.lineWidth = 2;
    ctx.strokeRect(photoX - 3, photoY - 3, photoW + 6, photoH + 6);


    // ==========================================
    // 4. DATA TEXT (LAYOUT CATHERINA SANN)
    // ==========================================
    const textX = 330;
    let textY = 225;
    ctx.textAlign = 'left';

    // A. NAMA LENGKAP (Biru, Bold, Underline Biru)
    ctx.fillStyle = primaryBlue; // Warna Biru Header
    ctx.font = 'bold 32px Arial';
    ctx.fillText(fullName.toUpperCase(), textX, textY);
    
    // Garis Bawah Nama
    ctx.fillRect(textX, textY + 12, 450, 4);

    textY += 60;

    // B. KOLOM DATA (Label vs Value)
    const drawField = (label, value) => {
        // LABEL: Abu-abu, Font Arial Normal (JANGAN BOLD)
        ctx.fillStyle = '#7f8c8d'; 
        ctx.font = '13px Arial'; // Normal weight
        ctx.fillText(label, textX, textY);
        
        textY += 25;
        
        // VALUE: Hitam, Font Arial Bold (Tebal)
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 22px Arial'; // Bold weight
        ctx.fillText(value, textX, textY);
        
        textY += 38; // Spasi antar data
    };

    drawField("NIM", nim);
    drawField("PROGRAM STUDI", prodi); // Prodi Value otomatis Bold
    drawField("FAKULTAS", fakultas);   // Fakultas Value otomatis Bold


    // ==========================================
    // 5. BADGE STATUS (KOTAK)
    // ==========================================
    const badgeY = textY + 10;

    // BADGE 1: ANGKATAN (Outline Biru, Teks Biru)
    ctx.strokeStyle = primaryBlue;
    ctx.lineWidth = 2;
    ctx.strokeRect(textX, badgeY, 130, 45);

    ctx.fillStyle = primaryBlue;
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px Arial';
    ctx.fillText("ANGKATAN", textX + 65, badgeY + 16);
    ctx.font = 'bold 20px Arial';
    ctx.fillText(angkatan, textX + 65, badgeY + 38);

    // BADGE 2: AKTIF (Blok Hijau, Teks Putih)
    const activeGreen = '#2ecc71'; // Hijau Cerah
    ctx.fillStyle = activeGreen;
    ctx.fillRect(textX + 150, badgeY, 130, 45);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px Arial';
    ctx.fillText("AKTIF", textX + 215, badgeY + 30);


    // ==========================================
    // 6. FOOTER & QR (STRIP BAWAH)
    // ==========================================
    
    // Background Footer (Putih)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, height - 70, width, 70);

    // Garis Biru Footer
    ctx.fillStyle = primaryBlue; // Warna Biru sama dengan Header
    ctx.fillRect(0, height - 70, width, 5);

    // Text Berlaku Hingga
    ctx.textAlign = 'left';
    ctx.fillStyle = '#2c3e50';
    ctx.font = '16px Arial';
    ctx.fillText(`BERLAKU HINGGA: ${validUntil}`, 50, height - 28);
    
    // Fake Hologram Text
    ctx.fillStyle = '#ecf0f1';
    ctx.font = 'bold 12px Arial';
    ctx.fillText("HOLOGRAM SECURITY", 50, height - 10);

    // QR Code (Kanan)
    const qrSize = 100;
    const qrX = width - 120;
    const qrY = height - 115;

    // Background Putih di balik QR
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10);

    const qrData = `KTM-${nim}-${univName}`;
    const qrUrl = await QRCode.toDataURL(qrData, { margin: 1 });
    const qrImg = await loadImage(qrUrl);
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

    return canvas.toBuffer('image/png');
};