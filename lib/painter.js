import { createCanvas, loadImage } from 'canvas';
import QRCode from 'qrcode';
import axios from 'axios';
import sharp from 'sharp';

// Helper: Title Case (Huruf Besar Awal)
const toTitleCase = (str) => {
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
        validUntil
    } = data;

    // Canvas Size High Res
    const width = 1011;
    const height = 638;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // COLOR PALETTE (Diambil dari sample NU University)
    const colorBlue = '#0e4c92';   // Biru Utama
    const colorGold = '#f39c12';   // Kuning Aksen
    const colorLabel = '#95a5a6';  // Abu-abu Label (Lebih muda)
    const colorValue = '#2c3e50';  // Hitam Text Value (Bukan hitam pekat)

    // ==========================================
    // 1. BACKGROUND & SECURITY PATTERN
    // ==========================================
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Guilloche Pattern (Gelombang Halus)
    ctx.save();
    ctx.lineWidth = 0.5; // Lebih tipis biar halus
    ctx.strokeStyle = 'rgba(14, 76, 146, 0.08)'; // Biru sangat transparan
    for (let y = 0; y < height; y += 8) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x < width; x += 10) {
            ctx.lineTo(x, y + Math.sin(x * 0.05) * 4); 
        }
        ctx.stroke();
    }
    
    // WATERMARK "HOLOGRAM" (Bawah Kiri) - Sesuai Kritik
    ctx.translate(100, 500);
    ctx.rotate(-Math.PI / 8);
    ctx.font = 'bold 60px Arial';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.03)'; // Sangat transparan
    ctx.fillText("GENUINE SECURE", 0, 0);
    ctx.restore();

    // ==========================================
    // 2. HEADER AREA
    // ==========================================
    const headerH = 145;
    
    // Blok Biru Solid
    ctx.fillStyle = colorBlue;
    ctx.fillRect(0, 0, width, headerH);
    
    // List Kuning (Lebih tipis dikit)
    ctx.fillStyle = colorGold;
    ctx.fillRect(0, headerH - 6, width, 6);

    // Teks: REPUBLIK INDONESIA
    ctx.fillStyle = colorGold;
    ctx.font = 'bold 15px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('REPUBLIK INDONESIA', width / 2, 42);

    // Teks: NAMA UNIVERSITAS (Vertically Centered)
    ctx.fillStyle = '#ffffff';
    let fontSize = 42;
    ctx.font = `bold ${fontSize}px "Times New Roman"`; 
    // Auto resize
    while (ctx.measureText(univName).width > 850) {
        fontSize -= 2;
        ctx.font = `bold ${fontSize}px "Times New Roman"`;
    }
    // Geser dikit ke atas biar simetris (Kritik 2)
    ctx.fillText(univName, width / 2, 92); 

    // Teks: KARTU TANDA MAHASISWA
    ctx.fillStyle = colorGold;
    ctx.font = '15px Arial';
    ctx.letterSpacing = "2px";
    ctx.fillText('KARTU TANDA MAHASISWA', width / 2, 122);
    ctx.letterSpacing = "0px";

    // LOGO "NU STYLE" (Bola Dunia Abstrak) - Kritik 1
    const logoX = 90;
    const logoY = 75;
    ctx.save();
    ctx.translate(logoX, logoY);
    
    // Lingkaran Luar Putih
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 45, 0, Math.PI*2);
    ctx.stroke();
    
    // Simbol Globe (Garis Lintang Bujur)
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, 45, 15, 0, 0, Math.PI*2); // Khatulistiwa
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -45); ctx.lineTo(0, 45); // Meridian
    ctx.stroke();
    
    // Bintang (Simbol NU)
    ctx.fillStyle = colorGold;
    ctx.font = '20px Arial';
    ctx.fillText("★", -2, 5); // Tengah
    ctx.font = '10px Arial';
    ctx.fillText("★", -25, -15);
    ctx.fillText("★", 20, -15);
    
    ctx.restore();

    // ==========================================
    // 3. FOTO PROFIL (DOUBLE BORDER) - Kritik Foto
    // ==========================================
    const photoX = 60;
    const photoY = 190;
    const photoW = 250;
    const photoH = 320;

    // Background Foto (Placeholder)
    ctx.fillStyle = '#ecf0f1';
    ctx.fillRect(photoX, photoY, photoW, photoH);

    try {
        if (photoUrl) {
            const response = await axios.get(photoUrl, { responseType: 'arraybuffer' });
            const pngBuffer = await sharp(response.data)
                .resize(300, 400, { fit: 'cover' })
                .png()
                .toBuffer();
            const photoImg = await loadImage(pngBuffer);
            ctx.drawImage(photoImg, photoX, photoY, photoW, photoH);
        }
    } catch (e) { }

    // Border: Putih Tipis Dalam + Biru Tebal Luar (Sesuai Kritik)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4; // Putih
    ctx.strokeRect(photoX, photoY, photoW, photoH);
    
    ctx.strokeStyle = colorBlue;
    ctx.lineWidth = 6; // Biru Tebal
    ctx.strokeRect(photoX - 3, photoY - 3, photoW + 6, photoH + 6);

    // ==========================================
    // 4. DATA TEXT (TIPOGRAFI FIX) - Kritik Utama
    // ==========================================
    const textX = 350;
    let textY = 215;
    ctx.textAlign = 'left';

    // NAMA (Biru, Bold)
    ctx.fillStyle = colorBlue;
    ctx.font = 'bold 32px Arial';
    ctx.fillText(fullName, textX, textY);
    
    // Garis Bawah Nama (Tipiskan - Kritik Underline)
    ctx.fillStyle = '#bdc3c7'; // Abu muda
    ctx.fillRect(textX, textY + 12, 580, 1.5); // Tebal cuma 1.5px

    textY += 55;

    // Helper Render Label & Value (Fix Bobot Font)
    const renderRow = (label, value) => {
        // LABEL: Abu-abu muda, Font Regular/Light, Kecil (Kritik 3)
        ctx.fillStyle = colorLabel;
        ctx.font = '13px Arial'; // Regular
        ctx.fillText(label, textX, textY);
        
        textY += 25;
        
        // VALUE: Hitam Abu, Font Medium (Bukan Bold Tebal) (Kritik 1)
        ctx.fillStyle = colorValue;
        ctx.font = '22px Arial'; // Regular/Medium (Canvas default Arial itu medium)
        // Value Title Case (Bukan ALL CAPS)
        ctx.fillText(value, textX, textY);
        
        textY += 42;
    };

    // NIM (Regular Font, sesuai kritik)
    renderRow('NIM', nim);
    
    // Prodi & Fakultas (Title Case)
    renderRow('PROGRAM STUDI', toTitleCase(prodi));
    renderRow('FAKULTAS', toTitleCase(fakultas));

    // ==========================================
    // 5. STATUS BOX (WARNA FIX) - Kritik Warna
    // ==========================================
    const badgeY = textY + 15;

    // Kotak 1: ANGKATAN (Outline Biru)
    ctx.strokeStyle = colorBlue;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(textX, badgeY, 130, 45);
    
    ctx.fillStyle = colorBlue;
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px Arial';
    ctx.fillText("ANGKATAN", textX + 65, badgeY + 15);
    ctx.font = 'bold 20px Arial';
    ctx.fillText(angkatan, textX + 65, badgeY + 38);

    // Kotak 2: STATUS (Solid Oranye - Standard Referensi)
    const box2X = textX + 150;
    ctx.fillStyle = colorGold; 
    ctx.fillRect(box2X, badgeY, 130, 45);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px Arial';
    ctx.fillText("AKTIF", box2X + 65, badgeY + 30); // Vertikal Center

    // ==========================================
    // 6. FOOTER (CLEAN & ELEGANT) - Kritik Footer
    // ==========================================
    
    // Garis Pemisah Footer (Tipis Abu - Kritik Footer)
    ctx.fillStyle = '#ecf0f1'; 
    ctx.fillRect(0, height - 70, width, 1.5);

    // Garis Bawah Kuning (Bottom Edge)
    ctx.fillStyle = colorGold;
    ctx.fillRect(0, height - 15, width, 15);

    // Teks Berlaku (Regular Font)
    ctx.textAlign = 'left';
    ctx.fillStyle = '#7f8c8d'; // Abu gelap
    ctx.font = '14px Arial';
    ctx.fillText(`BERLAKU HINGGA: ${validUntil}`, 60, height - 35);

    // QR Code
    const qrSize = 90;
    const qrX = width - 120;
    const qrY = height - 130;
    
    // Background Putih QR
    ctx.fillStyle = '#fff';
    ctx.fillRect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10);
    
    // QR Image
    const qrText = `KTM-${nim}/${fullName}`;
    const qrUrl = await QRCode.toDataURL(qrText, { margin: 1 });
    const qrImage = await loadImage(qrUrl);
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

    return canvas.toBuffer('image/png');
};