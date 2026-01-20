import { createCanvas, loadImage } from 'canvas';
import QRCode from 'qrcode';
import axios from 'axios';
import sharp from 'sharp';
import { getCountryData } from './data_countries.js'; // Updated import

// Helper Text Wrap
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
    return currentY + lineHeight;
}

async function loadPhoto(url) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const buffer = await sharp(response.data).resize(300, 400).png().toBuffer();
        return await loadImage(buffer);
    } catch { return null; }
}

// --- 1. DYNAMIC ID CARD ---
export const drawCanvaID = async (data, countryKey) => {
    const canvas = createCanvas(1011, 638);
    const ctx = canvas.getContext('2d');
    
    // Ambil Theme data dari fungsi baru
    const theme = getCountryData(countryKey);
    const { fullName, idNum, schoolName, position, photoUrl, birthDate } = data;
    const { color1, color2 } = theme.style;

    // Background
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1011, 638);
    
    // Header Style
    ctx.fillStyle = color1; ctx.fillRect(0, 0, 1011, 140);
    ctx.fillStyle = color2; ctx.fillRect(0, 135, 1011, 10);

    // Footer Style
    ctx.fillStyle = color1; ctx.fillRect(0, 580, 1011, 58);

    // Title
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 38px Arial';
    ctx.fillText(theme.lang.idTitle, 505, 70);
    
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 24px Arial';
    ctx.fillText(schoolName.toUpperCase(), 505, 110);

    // Foto
    const photo = await loadPhoto(photoUrl);
    const px = 60, py = 180, pw = 200, ph = 260;
    
    if (photo) ctx.drawImage(photo, px, py, pw, ph);
    else { ctx.fillStyle = '#ccc'; ctx.fillRect(px, py, pw, ph); }
    
    ctx.strokeStyle = color1; ctx.lineWidth = 4; ctx.strokeRect(px, py, pw, ph);

    // Data Fields
    ctx.textAlign = 'left';
    const tx = 300; let ty = 200;
    const labelColor = '#777';
    const valueColor = '#000';

    const fields = [
        { l: "NAME", v: fullName.toUpperCase() },
        { l: theme.lang.idNum, v: idNum },
        { l: "POSITION", v: position },
        { l: theme.lang.dob, v: birthDate }, // birthDate sudah generated
        { l: theme.lang.validUntil, v: "01/2030" }
    ];

    fields.forEach(f => {
        ctx.fillStyle = labelColor; ctx.font = '14px Arial'; 
        ctx.fillText(f.l, tx, ty);
        ty += 22;
        ctx.fillStyle = valueColor; ctx.font = 'bold 22px Arial'; 
        ctx.fillText(f.v, tx, ty);
        ty += 35;
    });

    const qrData = `${schoolName}-${idNum}-${fullName}`;
    const qrUrl = await QRCode.toDataURL(qrData);
    const qrImg = await loadImage(qrUrl);
    ctx.drawImage(qrImg, 860, 440, 120, 120);

    return canvas.toBuffer();
};

// --- 2. DYNAMIC CERTIFICATE ---
export const drawCanvaCert = async (data, countryKey) => {
    const canvas = createCanvas(1240, 1754);
    const ctx = canvas.getContext('2d');
    const theme = getCountryData(countryKey);
    const { color1 } = theme.style;
    const { fullName, idNum, schoolName, position, city } = data;

    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,1240,1754);

    ctx.fillStyle = color1; ctx.beginPath(); ctx.arc(620, 150, 60, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 60px Times'; ctx.textAlign = 'center'; ctx.fillText(schoolName[0], 620, 170);

    ctx.fillStyle = '#000'; ctx.font = 'bold 40px Times';
    ctx.fillText(schoolName, 620, 260);
    ctx.font = '20px Arial'; ctx.fillStyle = '#555';
    ctx.fillText(`${city}`, 620, 290);

    ctx.fillStyle = color1; ctx.font = 'bold 45px Arial';
    ctx.fillText(theme.lang.certTitle, 620, 450);

    ctx.textAlign = 'left'; ctx.fillStyle = '#000'; ctx.font = '26px Arial';
    const text = theme.lang.certBody(fullName, idNum, schoolName, position);
    wrapText(ctx, text, 150, 600, 940, 50);

    ctx.textAlign = 'right';
    const dateNow = new Date().toLocaleDateString();
    ctx.fillText(`Date: ${dateNow}`, 1090, 1300);

    ctx.fillStyle = color1; ctx.fillRect(790, 1450, 300, 2);
    ctx.textAlign = 'center'; ctx.font = '20px Arial';
    ctx.fillText("Principal / Director", 940, 1480);

    return canvas.toBuffer();
};

// --- 3. DYNAMIC CONTRACT ---
export const drawCanvaContract = async (data, countryKey) => {
    const canvas = createCanvas(1240, 1754);
    const ctx = canvas.getContext('2d');
    const theme = getCountryData(countryKey);
    const { color1, color2 } = theme.style;
    const { fullName, schoolName } = data;

    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,1240,1754);
    
    ctx.fillStyle = color1; ctx.fillRect(0,0,1240,40);
    ctx.fillStyle = color2; ctx.fillRect(0,40,1240,10);

    ctx.textAlign = 'center'; ctx.fillStyle = '#000'; ctx.font = 'bold 40px Arial';
    ctx.fillText(theme.lang.contractTitle, 620, 150);

    ctx.textAlign = 'left'; ctx.font = '24px Arial';
    const text = theme.lang.contractBody(schoolName, fullName);
    let y = 300;
    y = wrapText(ctx, text, 120, y, 1000, 40);
    
    y += 50;
    ctx.font = 'bold 22px Arial'; ctx.fillText("1. DUTIES AND RESPONSIBILITIES", 120, y); y+=30;
    ctx.font = '22px Arial'; ctx.fillText("The Employee shall perform duties as assigned by the School.", 120, y); y+=50;
    
    ctx.font = 'bold 22px Arial'; ctx.fillText("2. COMPENSATION", 120, y); y+=30;
    ctx.font = '22px Arial'; ctx.fillText("The School shall pay the Employee a monthly salary.", 120, y); y+=50;

    y = 1500;
    ctx.fillStyle = '#000'; 
    ctx.fillRect(150, y, 350, 2); ctx.fillRect(740, y, 350, 2);
    ctx.textAlign = 'center';
    ctx.fillText(schoolName, 325, y+30);
    ctx.fillText(fullName, 915, y+30);

    return canvas.toBuffer();
};