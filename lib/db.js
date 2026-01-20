import Database from 'better-sqlite3';
import path from 'path';

// Inisialisasi Database SQLite
const db = new Database(path.resolve('database.db'), { verbose: null });

// --- SKEMA DATABASE ---
const setupSchema = () => {
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

export const getUser = (id, refCandidate = null) => {
    let user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    
    // Jika user BARU
    if (!user) {
        const myRefCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const joinedAt = Date.now();
        let balance = 2000;
        let referrerId = null;

        if (refCandidate) {
            const referrer = db.prepare('SELECT * FROM users WHERE ref_code = ?').get(refCandidate);
            if (referrer && referrer.id !== id) {
                referrerId = referrer.id;
                balance += 1500; // Bonus Invitee
                
                // Bonus Inviter
                db.prepare('UPDATE users SET balance = balance + 3000, referrals = referrals + 1 WHERE id = ?')
                  .run(referrer.id);
            }
        }

        db.prepare('INSERT INTO users (id, balance, joined_at, ref_code, ref_by) VALUES (?, ?, ?, ?, ?)')
          .run(id, balance, joinedAt, myRefCode, referrerId);
        
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        user.isNew = true;
        user.referrerId = referrerId;
    }

    // --- MAPPING (Fix CamelCase to SnakeCase reading) ---
    // Agar index.js bisa baca user.tempData dan user.dailyLast
    try {
        user.tempData = user.temp_data ? JSON.parse(user.temp_data) : {};
    } catch (e) {
        user.tempData = {};
    }
    user.dailyLast = user.daily_last; // Map daily_last DB ke dailyLast JS
    
    return user;
};

export const updateUser = (id, data) => {
    // --- MAPPING (Fix CamelCase to SnakeCase writing) ---
    // Terjemahkan tempData -> temp_data sebelum simpan ke DB
    if (data.tempData !== undefined) {
        data.temp_data = JSON.stringify(data.tempData);
        delete data.tempData; // Hapus key lama biar ga error "no such column"
    }

    // Terjemahkan dailyLast -> daily_last
    if (data.dailyLast !== undefined) {
        data.daily_last = data.dailyLast;
        delete data.dailyLast;
    }

    const fields = Object.keys(data);
    const values = Object.values(data);
    
    if (fields.length === 0) return;

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    
    try {
        const stmt = db.prepare(`UPDATE users SET ${setClause} WHERE id = ?`);
        stmt.run(...values, id);
    } catch (e) {
        console.error("Update Error:", e.message, data);
    }
};

export const getCode = (code) => {
    const codeData = db.prepare('SELECT * FROM codes WHERE code = ?').get(code);
    if (codeData) {
        codeData.claimed_by = JSON.parse(codeData.claimed_by);
    }
    return codeData;
};

export const updateCode = (code, data) => {
    if(data.claimed_by) {
        data.claimed_by = JSON.stringify(data.claimed_by);
    }
    const fields = Object.keys(data);
    const values = Object.values(data);
    const setClause = fields.map(field => `${field} = ?`).join(', ');
    db.prepare(`UPDATE codes SET ${setClause} WHERE code = ?`).run(...values, code);
};

export const addCode = (code, value, limit) => {
    db.prepare('INSERT OR REPLACE INTO codes (code, value, limit_total) VALUES (?, ?, ?)')
      .run(code, value, limit);
};

export const getPrice = (userId) => {
    return 3000; 
};