import Database from 'better-sqlite3';
import path from 'path';

// Inisialisasi Database SQLite
const db = new Database(path.resolve('database.db'), { verbose: null }); // Matikan verbose biar ga spam console

// --- SKEMA DATABASE ---
const setupSchema = () => {
    // Tabel Users
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            balance INTEGER DEFAULT 2000,
            vip INTEGER DEFAULT 0,
            vip_exp INTEGER DEFAULT 0,
            joined_at INTEGER,
            ref_code TEXT,
            ref_by INTEGER,
            referrals INTEGER DEFAULT 0,
            daily_last TEXT,
            state TEXT,
            temp_data TEXT
        );
    `);
    // Tabel Kode Redeem
    db.exec(`
        CREATE TABLE IF NOT EXISTS codes (
            code TEXT PRIMARY KEY,
            value INTEGER,
            limit_total INTEGER,
            used_count INTEGER DEFAULT 0,
            claimed_by TEXT DEFAULT '[]'
        );
    `);
    console.log("Database schema checked/created successfully.");
};
setupSchema();

// --- FUNGSI DATABASE ---

// GET USER (Dengan Logika Referral)
// refCandidate adalah kode referral yang dibawa user saat klik link start
export const getUser = (id, refCandidate = null) => {
    let user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    
    // Jika user BARU
    if (!user) {
        const myRefCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const joinedAt = Date.now();
        let balance = 2000; // Welcome Bonus Standar
        let referrerId = null;

        // Cek Referral Code Candidate
        if (refCandidate) {
            // Cari pemilik kode
            const referrer = db.prepare('SELECT * FROM users WHERE ref_code = ?').get(refCandidate);
            
            // Validasi: Referrer ada, dan bukan diri sendiri (preventif)
            if (referrer && referrer.id !== id) {
                referrerId = referrer.id;
                
                // 1. Bonus buat Invitee (Yang diundang)
                balance += 1500; // Tambahan 1500

                // 2. Bonus buat Inviter (Pengundang)
                const newRefBalance = referrer.balance + 3000;
                const newRefCount = (referrer.referrals || 0) + 1;
                
                db.prepare('UPDATE users SET balance = ?, referrals = ? WHERE id = ?')
                  .run(newRefBalance, newRefCount, referrer.id);
                
                // Return info referrer buat notifikasi (opsional, ditangani di index.js)
            }
        }

        db.prepare('INSERT INTO users (id, balance, joined_at, ref_code, ref_by) VALUES (?, ?, ?, ?, ?)')
          .run(id, balance, joinedAt, myRefCode, referrerId);
        
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        user.isNew = true; // Flag untuk trigger pesan welcome di index.js
        user.referrerId = referrerId;
    }

    // Parse JSON
    try {
        user.temp_data = user.temp_data ? JSON.parse(user.temp_data) : {};
    } catch (e) {
        user.temp_data = {};
    }
    return user;
};

// UPDATE USER
export const updateUser = (id, data) => {
    if (data.temp_data) {
        data.temp_data = JSON.stringify(data.temp_data);
    }

    const fields = Object.keys(data);
    const values = Object.values(data);
    
    if (fields.length === 0) return;

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const stmt = db.prepare(`UPDATE users SET ${setClause} WHERE id = ?`);
    stmt.run(...values, id);
};

// GET KODE REDEEM
export const getCode = (code) => {
    const codeData = db.prepare('SELECT * FROM codes WHERE code = ?').get(code);
    if (codeData) {
        codeData.claimed_by = JSON.parse(codeData.claimed_by);
    }
    return codeData;
};

// UPDATE KODE REDEEM
export const updateCode = (code, data) => {
    if(data.claimed_by) {
        data.claimed_by = JSON.stringify(data.claimed_by);
    }
    const fields = Object.keys(data);
    const values = Object.values(data);
    const setClause = fields.map(field => `${field} = ?`).join(', ');
    db.prepare(`UPDATE codes SET ${setClause} WHERE code = ?`).run(...values, code);
};

// ADD KODE BARU
export const addCode = (code, value, limit) => {
    db.prepare('INSERT OR REPLACE INTO codes (code, value, limit_total) VALUES (?, ?, ?)')
      .run(code, value, limit);
};

// Simple Price Getter (Bisa dikembangkan)
export const getPrice = (userId) => {
    // Misal VIP lebih murah
    return 3000; 
};