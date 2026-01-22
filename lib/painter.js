// --- START OF FILE lib/painter.js ---

import { createCanvas, loadImage } from 'canvas';
import QRCode from 'qrcode';
import axios from 'axios';
import sharp from 'sharp';

// --- BAGIAN BARU: Mengadopsi Gaya KTM dari Anda ---

// --- DIMENSI ---
const WIDTH = 900;
const HEIGHT = 600;
const HEADER_HEIGHT = 130;

// --- WARNA ---
const COLOR_BLUE_HEADER = '#0066b2';
const COLOR_BLUE_NAVY = '#003366';
const COLOR_GOLD = '#ffcc00';
const COLOR_TEXT_BLACK = '#000000';
const COLOR_TEXT_LABEL = '#555555';
const COLOR_STATUS_ACTIVE = '#52bb79'; // Hijau untuk 'AKTIF'

// --- FONT ---
const FONT_SANS = 'Arial, sans-serif';
const FONT_SERIF = '"Times New Roman", serif';

// Helper: Title Case (jika dibutuhkan)
const toTitleCase = (str) => {
    if (!str) return '';
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
};

// Helper: Extract Year from Date String
const getYearOnly = (dateStr) => {
    if (!dateStr) return '2029';
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
        status = "AKTIF" // Default status
    } = data;

    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // =======================================================
    // 1. BACKGROUND PATTERN
    // =======================================================
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, HEADER_HEIGHT, WIDTH, HEIGHT - HEADER_HEIGHT);
    const patternColor = 'rgba(0, 0, 0, 0.06)';
    const spacing = 12;
    ctx.fillStyle = patternColor;
    for (let x = 0; x < WIDTH; x += spacing) {
        const yStart = HEADER_HEIGHT + 6;
        for (let y = yStart; y < HEIGHT; y += spacing) {
            ctx.beginPath();
            const xOffset = (Math.floor((y - yStart) / spacing) % 2 === 0) ? 0 : spacing / 2;
            ctx.arc(x + xOffset, y, 1.2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // =======================================================
    // 2. HEADER
    // =======================================================
    ctx.fillStyle = COLOR_BLUE_HEADER;
    ctx.fillRect(0, 0, WIDTH, HEADER_HEIGHT);

    // --- LOGO KUSTOM (REPLIKA) ---
    const logoX = 70; const logoY = 65; const logoRadius = 26;
    ctx.strokeStyle = 'white'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(logoX, logoY, logoRadius, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(logoX, logoY, logoRadius - 4, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'white'; ctx.font = `bold 9px ${FONT_SANS}`; ctx.textAlign = 'center';
    ctx.fillText("NNU", logoX, logoY - 10);
    const bookW = 22; const bookH = 14; const bookX = logoX - bookW / 2; const bookY = logoY - 2;
    ctx.strokeStyle = 'white'; ctx.lineWidth = 1.5; ctx.strokeRect(bookX, bookY, bookW, bookH);
    ctx.beginPath(); ctx.moveTo(logoX, bookY); ctx.lineTo(logoX, bookY + bookH); ctx.stroke();
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(bookX + 3, bookY + 5); ctx.lineTo(logoX - 2, bookY + 5); ctx.moveTo(logoX + 2, bookY + 5); ctx.lineTo(bookX + bookW - 3, bookY + 5);
    ctx.moveTo(bookX + 3, bookY + 9); ctx.lineTo(logoX - 2, bookY + 9); ctx.moveTo(logoX + 2, bookY + 9); ctx.lineTo(bookX + bookW - 3, bookY + 9);
    ctx.stroke();

    // --- TEKS HEADER ---
    const textStartX = 115;
    ctx.font = `bold 13px ${FONT_SANS}`; ctx.fillStyle = COLOR_GOLD; ctx.textAlign = 'center';
    ctx.fillText("REPUBLIK INDONESIA", WIDTH / 2, 30);
    ctx.textAlign = 'left';
    
    // Nama Universitas Dinamis
    ctx.font = `bold 30px ${FONT_SERIF}`; ctx.fillStyle = 'white';
    ctx.fillText(univName, textStartX, 72);
    
    ctx.font = `14px ${FONT_SANS}`; ctx.fillStyle = COLOR_GOLD;
    ctx.fillText("KARTU TANDA MAHASISWA", textStartX, 96);
    
    const lineY = 108;
    ctx.strokeStyle = COLOR_GOLD; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(textStartX, lineY); ctx.lineTo(WIDTH - 40, lineY); ctx.stroke();

    // =======================================================
    // 3. FOTO PROFIL
    // --- LOGIKA LAMA DIPERTAHANKAN (Sesuai Permintaan) ---
    // =======================================================
    const photoW = 190; const photoH = 240; const photoX = 50; const photoY = 165;
    try {
        if (photoUrl) {
            const response = await axios.get(photoUrl, { responseType: 'arraybuffer' });
            const pngBuffer = await sharp(response.data).resize(photoW, photoH, { fit: 'cover' }).png().toBuffer();
            const photoImg = await loadImage(pngBuffer);
            ctx.drawImage(photoImg, photoX, photoY, photoW, photoH);
        }
    } catch (e) {
        ctx.fillStyle = '#2d5a84'; ctx.fillRect(photoX, photoY, photoW, photoH);
        ctx.fillStyle = 'white'; ctx.font = `16px ${FONT_SANS}`; ctx.textAlign = 'center';
        ctx.fillText('FOTO GAGAL', photoX + photoW / 2, photoY + photoH / 2);
    }
    ctx.strokeStyle = 'white'; ctx.lineWidth = 8;
    ctx.strokeRect(photoX - 4, photoY - 4, photoW + 8, photoH + 8);
    ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1;
    ctx.strokeRect(photoX - 8, photoY - 8, photoW + 16, photoH + 16);
    ctx.textAlign = 'left';

    // =======================================================
    // 4. DATA MAHASISWA (DINAMIS)
    // =======================================================
    let currentY = 185; const textX = 280; const sectionGap = 26;
    ctx.font = `bold 23px ${FONT_SANS}`; ctx.fillStyle = COLOR_BLUE_NAVY;
    ctx.fillText(fullName, textX, currentY);
    const nameWidth = ctx.measureText(fullName).width;
    ctx.strokeStyle = COLOR_BLUE_NAVY; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(textX, currentY + 10); ctx.lineTo(textX + nameWidth + 5, currentY + 10); ctx.stroke();
    currentY += 35;
    
    const renderRow = (label, value) => {
        ctx.font = `11px ${FONT_SANS}`; ctx.fillStyle = COLOR_TEXT_LABEL;
        ctx.fillText(label, textX, currentY);
        currentY += 18;
        ctx.font = `16px ${FONT_SANS}`; ctx.fillStyle = COLOR_TEXT_BLACK;
        ctx.fillText(value, textX, currentY);
        currentY += sectionGap;
    };
    renderRow("NIM", nim);
    renderRow("PROGRAM STUDI", toTitleCase(prodi));
    renderRow("FAKULTAS", toTitleCase(fakultas));

    // =======================================================
    // 5. STATUS BOXES
    // =======================================================
    const boxY = 371; const boxH = 34; const boxW = 95; const gap = 10;
    
    // ANGKATAN
    ctx.beginPath(); ctx.rect(textX, boxY, boxW, boxH);
    ctx.fillStyle = 'white'; ctx.fill();
    ctx.strokeStyle = COLOR_BLUE_HEADER; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = `bold 9px ${FONT_SANS}`; ctx.fillStyle = COLOR_BLUE_HEADER; ctx.textAlign = 'center';
    ctx.fillText("ANGKATAN", textX + boxW / 2, boxY + 11);
    ctx.font = `bold 14px ${FONT_SANS}`;
    ctx.fillText(angkatan, textX + boxW / 2, boxY + 27);

    // STATUS
    const statusX = textX + boxW + gap;
    ctx.fillStyle = COLOR_STATUS_ACTIVE; ctx.fillRect(statusX, boxY, boxW, boxH);
    ctx.font = `bold 15px ${FONT_SANS}`; ctx.fillStyle = 'white';
    ctx.fillText(status.toUpperCase(), statusX + boxW / 2, boxY + 23);
    ctx.textAlign = 'left';

    // =======================================================
    // 6. FOOTER & QR CODE
    // =======================================================
    const footerY = HEIGHT - 105;
    const gradient = ctx.createLinearGradient(0, footerY, WIDTH, footerY);
    gradient.addColorStop(0, '#7bc97b'); gradient.addColorStop(0.5, '#f5e461'); gradient.addColorStop(1, COLOR_GOLD);
    ctx.strokeStyle = gradient; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(0, footerY); ctx.lineTo(WIDTH, footerY); ctx.stroke();
    
    const expiryYear = getYearOnly(validUntil);
    const textY = footerY + 25;
    ctx.font = `12px ${FONT_SANS}`; ctx.fillStyle = COLOR_TEXT_BLACK;
    ctx.fillText(`BERLAKU HINGGA: ${expiryYear}`, 50, textY);
    
    ctx.save();
    ctx.font = `italic bold 11px ${FONT_SANS}`; ctx.fillStyle = 'rgba(160, 160, 160, 0.5)';
    ctx.fillText("HOLOGRAM", 50, textY + 16);
    ctx.restore();

    // --- QR CODE: LOGIKA LAMA DIPERTAHANKAN (Sesuai Permintaan) ---
    const qrSize = 60; const qrX = WIDTH - qrSize - 40; const qrY = footerY + 12;
    try {
        const qrText = `KTM-${nim}/${fullName}`;
        const qrUrl = await QRCode.toDataURL(qrText, { margin: 0.5, width: qrSize });
        const qrImage = await loadImage(qrUrl);
        ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);
    } catch (e) {
        ctx.fillStyle = 'black'; ctx.fillRect(qrX, qrY, qrSize, qrSize);
    }
    
    return canvas.toBuffer('image/png');
};


// --- END OF FILE lib/painter.js ---