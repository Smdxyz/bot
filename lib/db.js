// --- START OF FILE lib/db.js ---

import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.resolve('database.db'), { verbose: null });

// Setup Schema
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
            temp_data TEXT,
            gh_session TEXT  -- KOLOM BARU BUAT SIMPAN SESI GITHUB
        );
    `);
    
    // Migrasi otomatis jika kolom gh_session belum ada (untuk user lama)
    try {
        db.prepare('ALTER TABLE users ADD COLUMN gh_session TEXT').run();
        console.log("✅ Kolom gh_session berhasil ditambahkan.");
    } catch (e) {
        // Ignore error kalau kolom sudah ada
    }

    db.exec(`
        CREATE TABLE IF NOT EXISTS codes (
            code TEXT PRIMARY KEY,
            value INTEGER,
            limit_total INTEGER,
            used_count INTEGER DEFAULT 0,
            claimed_by TEXT DEFAULT '[]'
        );
    `);
};
setupSchema();

// --- FUNGSI DATABASE ---

export const getUser = (id, refCandidate = null) => {
    let user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    
    if (!user) {
        const myRefCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const joinedAt = Date.now();
        let balance = 2000;
        let referrerId = null;

        if (refCandidate) {
            const referrer = db.prepare('SELECT * FROM users WHERE ref_code = ?').get(refCandidate);
            if (referrer && referrer.id !== id) {
                referrerId = referrer.id;
                balance += 1500; 
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

    // Parsing JSON fields
    try { user.tempData = user.temp_data ? JSON.parse(user.temp_data) : {}; } catch (e) { user.tempData = {}; }
    try { user.ghSession = user.gh_session ? JSON.parse(user.gh_session) : null; } catch (e) { user.ghSession = null; }
    
    user.dailyLast = user.daily_last;
    return user;
};

export const updateUser = (id, data) => {
    // Mapping CamelCase ke SnakeCase DB
    if (data.tempData !== undefined) {
        data.temp_data = JSON.stringify(data.tempData);
        delete data.tempData;
    }
    if (data.dailyLast !== undefined) {
        data.daily_last = data.dailyLast;
        delete data.dailyLast;
    }
    // Mapping Session GitHub
    if (data.ghSession !== undefined) {
        data.gh_session = data.ghSession ? JSON.stringify(data.ghSession) : null;
        delete data.ghSession;
    }

    const fields = Object.keys(data);
    const values = Object.values(data);
    
    if (fields.length === 0) return;

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    
    try {
        const stmt = db.prepare(`UPDATE users SET ${setClause} WHERE id = ?`);
        stmt.run(...values, id);
    } catch (e) {
        console.error("Update DB Error:", e.message);
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
    if(data.claimed_by) data.claimed_by = JSON.stringify(data.claimed_by);
    const fields = Object.keys(data);
    const values = Object.values(data);
    const setClause = fields.map(field => `${field} = ?`).join(', ');
    db.prepare(`UPDATE codes SET ${setClause} WHERE code = ?`).run(...values, code);
};

export const addCode = (code, value, limit) => {
    db.prepare('INSERT OR REPLACE INTO codes (code, value, limit_total) VALUES (?, ?, ?)')
      .run(code, value, limit);
};

export const getPrice = (userId) => 3000;