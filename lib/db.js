import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.resolve('database.db'), { verbose: null });

// Setup Schema
const setupSchema = () => {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            balance INTEGER DEFAULT 2500,
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

export const getUser = (id, refCandidate = null) => {
    const numericId = parseInt(id);
    if (isNaN(numericId)) return null; 

    let user = db.prepare('SELECT * FROM users WHERE id = ?').get(numericId);
    
    if (!user) {
        const myRefCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const joinedAt = Date.now();
        let balance = 2500; 
        let referrerId = null;

        if (refCandidate) {
            const referrer = db.prepare('SELECT * FROM users WHERE ref_code = ?').get(refCandidate);
            if (referrer && referrer.id !== numericId) {
                referrerId = referrer.id;
                balance += 1000;
                db.prepare('UPDATE users SET balance = balance + 2000, referrals = referrals + 1 WHERE id = ?')
                  .run(referrer.id);
            }
        }

        db.prepare('INSERT INTO users (id, balance, joined_at, ref_code, ref_by) VALUES (?, ?, ?, ?, ?)')
          .run(numericId, balance, joinedAt, myRefCode, referrerId);
        
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(numericId);
        user.isNew = true;
    }

    try { user.tempData = user.temp_data ? JSON.parse(user.temp_data) : {}; } catch (e) { user.tempData = {}; }
    
    // Auto Reset VIP jika Expired
    if (user.vip === 1 && user.vip_exp < Date.now()) {
        db.prepare('UPDATE users SET vip = 0 WHERE id = ?').run(numericId);
        user.vip = 0;
    }

    return user;
};

export const updateUser = (id, data) => {
    const numericId = parseInt(id);
    if (isNaN(numericId)) return;

    if (data.tempData !== undefined) {
        data.temp_data = JSON.stringify(data.tempData);
        delete data.tempData;
    }
    
    const fields = Object.keys(data);
    const values = Object.values(data);
    if (fields.length === 0) return;

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    try {
        db.prepare(`UPDATE users SET ${setClause} WHERE id = ?`).run(...values, numericId);
    } catch (e) { console.error("DB Error:", e.message); }
};

// HELPER: Diskon 50% untuk VIP
export const calculatePrice = (userId, basePrice) => {
    const user = getUser(userId);
    if (user && user.vip === 1) return Math.ceil(basePrice * 0.5);
    return basePrice;
};

// REEDEM CODE LOGIC
export const getCode = (code) => {
    const data = db.prepare('SELECT * FROM codes WHERE code = ?').get(code);
    if(data) data.claimed_by = JSON.parse(data.claimed_by);
    return data;
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