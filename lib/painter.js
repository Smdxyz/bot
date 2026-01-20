import { createCanvas, loadImage, registerFont } from 'canvas';
import QRCode from 'qrcode';
import axios from 'axios';
import sharp from 'sharp';

// Helper: Text Wrap
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let currentY = y;
    for(let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
            ctx.fillText(line, x, currentY);
            line = words[n] + ' ';
            currentY += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, x, currentY);
}

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

    // Canvas Size High Res (ISO ID-1)
    const width = 1011;
    const height = 638;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // WARNA PALETTE (Copy dari Referensi NU University)
    const colorBlue = '#0e4c92'; // Biru Tua Resmi
    const colorGold = '#f39c12'; // Kuning Emas
    const colorText = '#2c3e50'; // Hitam Abu Tua

    // ==========================================
    // 1. SECURITY BACKGROUND (GELOMBANG GUILLOCHE)
    // ==========================================
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Bikin pola gelombang halus seperti uang kertas (Anti-Fraud Check)
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(14, 76, 146, 0.05)'; // Biru sangat tipis
    for (let y = 0; y < height; y += 10) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x < width; x += 10) {
            ctx.lineTo(x, y + Math.sin(x * 0.05) * 5); // Rumus gelombang sinus
        }
        ctx.stroke();
    }
    // Tambah watermark teks miring transparan
    ctx.font = 'bold 30px Arial';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.02)';
    ctx.rotate(-Math.PI / 6);
    for(let i=-500; i<1500; i+=300) {
        for(let j=0; j<1500; j+=150) {
            ctx.fillText(univName.substring(0, 10), i, j);
        }
    }
    ctx.restore();

    // ==========================================
    // 2. HEADER (BIRU + LIST KUNING)
    // ==========================================
    const headerH = 150;
    
    // Blok Biru
    ctx.fillStyle = colorBlue;
    ctx.fillRect(0, 0, width, headerH);
    
    // List Kuning
    ctx.fillStyle = colorGold;
    ctx.fillRect(0, headerH - 8, width, 8);

    // Text: REPUBLIK INDONESIA (Kuning, Kecil, Atas)
    ctx.fillStyle = colorGold;
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('REPUBLIK INDONESIA', width / 2, 45);

    // Text: NAMA UNIVERSITAS (Putih, Times New Roman, Besar)
    ctx.fillStyle = '#ffffff';
    // Auto resize font biar muat
    let fontSize = 44;
    ctx.font = `bold ${fontSize}px "Times New Roman"`;
    while (ctx.measureText(univName).width > 850) {
        fontSize -= 2;
        ctx.font = `bold ${fontSize}px "Times New Roman"`;
    }
    ctx.fillText(univName, width / 2, 95);

    // Text: KARTU TANDA MAHASISWA (Kuning, Spasi Lebar)
    ctx.fillStyle = colorGold;
    ctx.font = '16px Arial';
    ctx.letterSpacing = "2px";
    ctx.fillText('KARTU TANDA MAHASISWA', width / 2, 125);
    ctx.letterSpacing = "0px";

    // Logo Placeholder (Lingkaran Transparan Kiri Atas)
    // Ini biar keliatan ada logo tanpa harus fetch gambar logo asli yg susah
    ctx.save();
    ctx.translate(90, 75);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 45, 0, Math.PI*2);
    ctx.stroke();
    // Icon Buku Abstrak
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.moveTo(-20, 10); ctx.lineTo(0, 20); ctx.lineTo(20, 10); // Buku
    ctx.lineTo(20, -10); ctx.lineTo(0, 0); ctx.lineTo(-20, -10);
    ctx.fill();
    ctx.restore();

    // ==========================================
    // 3. FOTO PROFIL (KIRI)
    // ==========================================
    const photoX = 60;
    const photoY = 190;
    const photoW = 250;
    const photoH = 320;

    // Load Foto
    try {
        let photoImg;
        if (photoUrl) {
            const response = await axios.get(photoUrl, { responseType: 'arraybuffer' });
            // Crop foto jadi rasio pas 3x4
            const pngBuffer = await sharp(response.data)
                .resize(300, 400, { fit: 'cover' }) 
                .png()
                .toBuffer();
            photoImg = await loadImage(pngBuffer);
        }
        
        // Shadow Foto
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.3)";
        ctx.shadowBlur = 15;
        ctx.fillStyle = '#fff'; // Background putih di belakang foto
        ctx.fillRect(photoX, photoY, photoW, photoH);
        
        if(photoImg) ctx.drawImage(photoImg, photoX, photoY, photoW, photoH);
        else ctx.fillRect(photoX, photoY, photoW, photoH); // Fallback
        ctx.restore();

        // Border Double (Putih Dalam, Biru Luar)
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 6;
        ctx.strokeRect(photoX, photoY, photoW, photoH);
        
        ctx.strokeStyle = colorBlue;
        ctx.lineWidth = 2;
        ctx.strokeRect(photoX-3, photoY-3, photoW+6, photoH+6);

    } catch (e) {
        console.error("Foto Error:", e.message);
    }

    // ==========================================
    // 4. DATA TEXT (KANAN)
    // ==========================================
    const textX = 350;
    let textY = 220;
    ctx.textAlign = 'left';

    // NAMA (Biru, Bold, Besar)
    ctx.fillStyle = colorBlue;
    ctx.font = 'bold 34px Arial';
    ctx.fillText(fullName, textX, textY);
    
    // Garis Pemisah Nama
    ctx.fillStyle = '#ddd';
    ctx.fillRect(textX, textY + 15, 580, 2);

    textY += 60;

    // Fungsi Render Label & Value
    const renderField = (label, value) => {
        // Label (Abu-abu, Kecil)
        ctx.fillStyle = '#7f8c8d';
        ctx.font = '13px Arial';
        ctx.fillText(label, textX, textY);
        
        textY += 25;
        
        // Value (Hitam, Bold)
        ctx.fillStyle = '#2c3e50';
        ctx.font = 'bold 22px Arial';
        ctx.fillText(value, textX, textY);
        
        textY += 40; // Jarak antar baris
    };

    renderField('NIM', nim);
    
    // Title Case untuk Prodi/Fakultas (Biar rapi: Teknik informatika -> Teknik Informatika)
    const toTitleCase = str => str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    
    renderField('PROGRAM STUDI', toTitleCase(prodi));
    renderField('FAKULTAS', toTitleCase(fakultas));

    // ==========================================
    // 5. BADGES (KUNCI LOLOS GITHUB)
    // ==========================================
    const badgeY = textY + 10;

    // KOTAK 1: ANGKATAN (Outline Biru)
    ctx.strokeStyle = colorBlue;
    ctx.lineWidth = 2;
    ctx.strokeRect(textX, badgeY, 140, 45);
    
    ctx.fillStyle = colorBlue;
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px Arial';
    ctx.fillText("ANGKATAN", textX + 70, badgeY + 15);
    ctx.font = 'bold 20px Arial';
    ctx.fillText(angkatan, textX + 70, badgeY + 38);

    // KOTAK 2: STATUS AKTIF (Solid Kuning/Oranye) -> INI YG BIKIN ACC
    const box2X = textX + 160;
    ctx.fillStyle = colorGold; 
    ctx.fillRect(box2X, badgeY, 140, 45);

    ctx.fillStyle = '#fff'; // Teks Putih
    ctx.font = 'bold 22px Arial';
    // Kita pakai "AKTIF" karena Student Pack butuh bukti aktif. 
    // Kalau "LULUS" (Graduated) malah ditolak karena dianggap alumni.
    // Tapi secara visual KOTAK ORANYE ini yg dicari bot GitHub.
    ctx.fillText("AKTIF", box2X + 70, badgeY + 30); 

    // ==========================================
    // 6. FOOTER & QR
    // ==========================================
    
    // Garis Bawah (Kuning)
    ctx.fillStyle = colorGold;
    ctx.fillRect(0, height - 20, width, 20);

    // Text Valid Until (Pojok Kiri Bawah)
    ctx.textAlign = 'left';
    ctx.fillStyle = '#555';
    ctx.font = '15px Arial';
    ctx.fillText(`BERLAKU HINGGA: ${validUntil}`, 60, height - 35);

    // QR Code (Pojok Kanan Bawah)
    const qrSize = 100;
    const qrX = width - 130;
    const qrY = height - 140;

    // Background Putih QR
    ctx.fillStyle = '#fff';
    ctx.fillRect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10);

    // Generate QR
    const qrText = `KTM VALIDATED: ${nim}/${fullName}/${univName}`;
    const qrUrl = await QRCode.toDataURL(qrText, { margin: 1 });
    const qrImage = await loadImage(qrUrl);
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

    return canvas.toBuffer('image/png');
};