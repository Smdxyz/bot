// github_automator.js

import { HttpSession, extractInputValue, extractAllInputs } from './helpers.js';
import { generateSemiAuto } from './lib/randomizer.js';
import { drawKTM } from './lib/painter.js';
import { totp } from 'otplib';
import { fakerID_ID as faker } from '@faker-js/faker';
import * as cheerio from 'cheerio'; // Wajib ada untuk parsing form yang akurat

export class GitHubAutomator {
    constructor(ctx, username = '', password = '', email = '', existingState = null, askUserFunc = null) {
        this.ctx = ctx;
        this.askUser = askUserFunc;
        
        if (existingState) {
            // Restore Sesi dari Database/JSON
            this.username = existingState.username;
            this.password = existingState.password;
            this.email = existingState.email;
            this.profile = existingState.profile;
            this.billingInfo = existingState.billingInfo;
            this.session = new HttpSession(existingState.cookies);
            this.log(`♻️ Sesi dipulihkan: ${this.profile.fullName}`);
        } else {
            // Sesi Baru
            this.username = username;
            this.password = password;
            this.email = email;
            this.session = new HttpSession();

            // Generate Data Konsisten (Nama Profile == Nama Billing == Nama KTM)
            const sex = Math.random() > 0.5 ? 'male' : 'female';
            const firstName = faker.person.firstName(sex);
            const lastName = faker.person.lastName(sex);
            
            this.profile = {
                fullName: `${firstName} ${lastName}`.toUpperCase(),
                gender: sex === 'male' ? 'pria' : 'wanita'
            };

            this.billingInfo = {
                firstName: firstName.toUpperCase(),
                lastName: lastName.toUpperCase(),
                address1: "Jl. Cipaganti No. 45, Kelurahan Cipaganti, Kecamatan Coblong",
                city: "Bandung",
                country: "ID",
                region: "Jawa Barat",
                postalCode: "40131",
            };
            
            this.log(`Target Baru: ${this.profile.fullName}`);
        }
    }

    setOtpCallback(cb) { this.otpCallback = cb; }

    async _waitForOtp() {
        if (!this.otpCallback) throw new Error("Callback OTP belum diset.");
        await this.otpCallback();
        return new Promise((resolve) => {
            // Disimpan di global agar bisa diakses index.js saat user reply
            global.otpResolver = resolve;
            global.otpUserId = this.ctx.chat.id;
        });
    }

    exportState() {
        return JSON.stringify({
            username: this.username,
            password: this.password,
            email: this.email,
            profile: this.profile,
            billingInfo: this.billingInfo,
            cookies: this.session.exportCookies(),
            timestamp: new Date().toISOString()
        });
    }

    async log(message) {
        console.log(`[GH] ${message}`);
        await this.ctx.reply(`➤ ${message}`).catch(()=>{});
    }

    // ============================================================
    // STEP 1: LOGIN
    // ============================================================
    async step1_Login() {
        await this.log("🔑 [Step 1] Login...");
        
        const page = await this.session.get('https://github.com/login');
        const formInputs = extractAllInputs(page.body, 0);
        
        formInputs.login = this.username;
        formInputs.password = this.password;
        formInputs.commit = "Sign in";

        const res = await this.session.post('https://github.com/session', new URLSearchParams(formInputs).toString());
        
        // Logika Redirect
        if (res.statusCode === 302) {
            const loc = res.headers.location;
            if (loc.includes('verified-device')) {
                await this.log("⚠️ Butuh OTP Email...");
                const otp = await this._waitForOtp(); // Tunggu input user di Telegram
                
                // Submit OTP
                const vPage = await this.session.get('https://github.com/sessions/verified-device');
                const vInputs = extractAllInputs(vPage.body);
                vInputs.otp = otp;
                delete vInputs.commit;
                
                const vRes = await this.session.post('https://github.com/sessions/verified-device', new URLSearchParams(vInputs).toString());
                if (vRes.statusCode !== 302) throw new Error("OTP Salah / Expired!");
                
            } else if (loc.includes('two-factor')) {
                throw new Error("Akun ini sudah aktif 2FA App. Bot belum support login 2FA App existing.");
            }
        } else {
             if (res.body.includes('Incorrect username')) throw new Error("Password Salah!");
             if (res.body.includes('CAPTCHA')) throw new Error("Kena CAPTCHA. Ganti IP Server.");
        }
        await this.log("✅ Login Sukses.");
    }

    // ============================================================
    // STEP 2: SET PROFILE (UPDATED - LEBIH PINTAR)
    // ============================================================
    async step2_SetName() {
        await this.log(`📝 [Step 2] Set Nama: ${this.profile.fullName}`);
        const page = await this.session.get('https://github.com/settings/profile');
        
        if (!page.body.includes('Public profile')) {
            throw new Error("Gagal load profile. Sesi mungkin habis. Coba Step 1 lagi.");
        }

        // --- LOGIKA FIX: Cari form spesifik by Action URL ---
        const $ = cheerio.load(page.body);
        // Cari form yang action-nya mengarah ke update user kita
        const form = $(`form[action="/users/${this.username}"]`).first();

        if (!form.length) {
            console.log("DEBUG HTML:", page.body.substring(0, 500));
            throw new Error(`Form profile untuk user ${this.username} tidak ditemukan.`);
        }

        // Ambil semua input dalam form tersebut
        const formInputs = {};
        form.find('input, textarea, select').each((i, el) => {
            const name = $(el).attr('name');
            const value = $(el).val();
            if (name) formInputs[name] = value || '';
        });

        // Set data baru
        formInputs['user[profile_name]'] = this.profile.fullName;
        formInputs['_method'] = 'put'; // Wajib

        // Debug: Cek apakah field rahasia 'required_field_xxxx' terbawa
        const secretKeys = Object.keys(formInputs).filter(k => k.startsWith('required_field_') || k.includes('timestamp'));
        if (secretKeys.length === 0) console.warn("[WARNING] Anti-bot fields tidak ditemukan!");

        // Submit
        const res = await this.session.post(`https://github.com/users/${this.username}`, new URLSearchParams(formInputs).toString());
        
        // Validasi Sukses
        // 1. Redirect 302 ke /settings/profile (Sukses standar)
        if (res.statusCode === 302 && res.headers.location.includes('/settings/profile')) {
             await this.log("✅ Nama Sukses (Redirect).");
             return;
        }
        // 2. 200 OK dengan pesan sukses (Kadang GitHub begini)
        if (res.statusCode === 200 && res.body.includes('Profile updated successfully')) {
             await this.log("✅ Nama Sukses (Flash Message).");
             return;
        }

        console.log("FAIL BODY:", res.body.substring(0, 300));
        throw new Error(`Gagal Update Profil. Status: ${res.statusCode}`);
    }

    // ============================================================
    // STEP 3: SET BILLING
    // ============================================================
    async step3_SetBilling() {
        await this.log(`💳 [Step 3] Set Billing...`);
        const page = await this.session.get('https://github.com/settings/billing/payment_information');
        
        // Cari form billing (kadang index berubah)
        let formInputs = {};
        if (page.body.includes('billing_contact[first_name]')) {
            formInputs = extractAllInputs(page.body, 0);
            if (!formInputs['billing_contact[first_name]']) formInputs = extractAllInputs(page.body, 1);
        } else {
            formInputs = extractAllInputs(page.body, 0);
        }

        // Kalau form masih kosong, coba ambil token dari meta tag dan bangun payload manual
        if(!formInputs.authenticity_token) {
             const token = extractInputValue(page.body, 'authenticity_token');
             if(token) formInputs.authenticity_token = token;
        }

        formInputs['billing_contact[first_name]'] = this.billingInfo.firstName;
        formInputs['billing_contact[last_name]'] = this.billingInfo.lastName;
        formInputs['billing_contact[address1]'] = this.billingInfo.address1;
        formInputs['billing_contact[city]'] = this.billingInfo.city;
        formInputs['billing_contact[country_code]'] = this.billingInfo.country;
        formInputs['billing_contact[region]'] = this.billingInfo.region;
        formInputs['billing_contact[postal_code]'] = this.billingInfo.postalCode;
        formInputs['target'] = 'user';
        formInputs['contact_type'] = 'billing';
        delete formInputs['submit']; // Hapus value tombol submit lama

        const res = await this.session.post('https://github.com/account/contact', new URLSearchParams(formInputs).toString());
        
        if (res.statusCode !== 302) throw new Error(`Gagal Update Billing. Status: ${res.statusCode}`);
        await this.log("✅ Billing Sukses.");
    }

    // ============================================================
    // STEP 4: APPLY EDUCATION
    // ============================================================
    async step4_ApplyEdu() {
        await this.log(`🎓 [Step 4] Apply Edu...`);
        const schoolName = "NU University of Surakarta";
        const schoolId = "82921";

        // 1. Pre-check
        const page1 = await this.session.get('https://github.com/settings/education/benefits');
        if (page1.url.includes('two_factor_authentication/setup')) {
            throw new Error("⛔ WAJIB 2FA! Aktifkan 2FA manual di browser lalu coba lagi.");
        }

        // 2. Submit Step 1
        const formInputs1 = extractAllInputs(page1.body);
        formInputs1['dev_pack_form[application_type]'] = 'student';
        formInputs1['dev_pack_form[school_name]'] = schoolName;
        formInputs1['dev_pack_form[selected_school_id]'] = schoolId;
        formInputs1['dev_pack_form[school_email]'] = this.email;
        formInputs1['dev_pack_form[latitude]'] = '-7.570020342507728';
        formInputs1['dev_pack_form[longitude]'] = '110.80568597565748';
        formInputs1['dev_pack_form[location_shared]'] = 'true';
        formInputs1['continue'] = 'Continue';

        const res1 = await this.session.client.post('https://github.com/settings/education/developer_pack_applications', {
            body: new URLSearchParams(formInputs1).toString(),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Turbo-Frame': 'dev-pack-form' }
        });

        // 3. Generate Bukti
        await this.log("🖼️ Membuat KTM...");
        const ktmData = generateSemiAuto({
            univName: "NU UNIVERSITY OF SURAKARTA",
            fullName: this.profile.fullName, // Konsisten
            gender: this.profile.gender
        });
        const imgBuffer = await drawKTM(ktmData);
        const photoData = JSON.stringify({
            image: `data:image/jpeg;base64,${imgBuffer.toString('base64')}`,
            metadata: { filename: "proof.jpg", type: "upload", mimeType: "image/jpeg" }
        });

        // 4. Submit Step 2
        const formInputs2 = extractAllInputs(res1.body);
        
        // Bawa ulang data step 1
        formInputs2['dev_pack_form[school_name]'] = schoolName;
        formInputs2['dev_pack_form[selected_school_id]'] = schoolId;
        formInputs2['dev_pack_form[school_email]'] = this.email;
        formInputs2['dev_pack_form[latitude]'] = '-7.570020342507728';
        formInputs2['dev_pack_form[longitude]'] = '110.80568597565748';
        formInputs2['dev_pack_form[location_shared]'] = 'true';
        formInputs2['dev_pack_form[application_type]'] = 'student';
        
        // Data baru
        formInputs2['dev_pack_form[proof_type]'] = '1. Dated school ID - Good';
        formInputs2['dev_pack_form[photo_proof]'] = photoData;
        formInputs2['dev_pack_form[form_variant]'] = 'upload_proof_form';
        formInputs2['submit'] = 'Submit Application';

        const finalRes = await this.session.client.post('https://github.com/settings/education/developer_pack_applications', {
            body: new URLSearchParams(formInputs2).toString(),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Turbo-Frame': 'dev-pack-form' }
        });

        if (finalRes.body.includes('Thanks for submitting')) {
            await this.log("🎉 SUCCESS! Cek email student.");
        } else {
            console.log("FAIL EDU:", finalRes.body.substring(0, 300));
            throw new Error('Gagal Submit Edu. Mungkin ditolak sistem.');
        }
    }
}