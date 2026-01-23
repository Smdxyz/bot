// github_automator.js

import { HttpSession, extractInputValue, extractAllInputs } from './helpers.js';
import { generateSemiAuto } from './lib/randomizer.js';
import { drawKTM } from './lib/painter.js';
import { totp } from 'otplib';
import { fakerID_ID as faker } from '@faker-js/faker';

export class GitHubAutomator {
    constructor(ctx, username = '', password = '', email = '', existingState = null) {
        this.ctx = ctx;
        this.username = username; // Default
        
        if (existingState) {
            // Rehydrate
            Object.assign(this, existingState); // Copy semua properti dari JSON DB
            this.session = new HttpSession(existingState.cookies);
            this.log(`♻️ Sesi diload: ${this.profile.fullName}`);
        } else {
            // New Session
            this.username = username;
            this.password = password;
            this.email = email;
            this.session = new HttpSession();

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
        }
    }

    setOtpCallback(cb) { this.otpCallback = cb; }

    async _waitForOtp() {
        if (!this.otpCallback) throw new Error("Callback OTP belum diset.");
        await this.otpCallback();
        return new Promise((resolve) => {
            global.otpResolver = resolve;
            global.otpUserId = this.ctx.chat.id;
        });
    }

    // PENTING: Method ini dipanggil index.js untuk save ke DB
    exportState() {
        return JSON.stringify({
            username: this.username,
            password: this.password,
            email: this.email,
            profile: this.profile,
            billingInfo: this.billingInfo,
            cookies: this.session.exportCookies()
        });
    }

    async log(message) {
        console.log(`[GH] ${message}`);
        await this.ctx.reply(`➤ ${message}`).catch(()=>{});
    }

    // --- STEP 1: LOGIN ---
    async step1_Login() {
        await this.log("🔑 [Step 1] Login...");
        const page = await this.session.get('https://github.com/login');
        const formInputs = extractAllInputs(page.body, 0);
        
        formInputs.login = this.username;
        formInputs.password = this.password;

        const res = await this.session.post('https://github.com/session', new URLSearchParams(formInputs).toString());
        
        if (res.statusCode === 302) {
            const loc = res.headers.location;
            if (loc.includes('verified-device')) {
                await this.log("⚠️ Butuh OTP Email...");
                const otp = await this._waitForOtp();
                const vPage = await this.session.get('https://github.com/sessions/verified-device');
                const vInputs = extractAllInputs(vPage.body);
                vInputs.otp = otp;
                delete vInputs.commit;
                
                const vRes = await this.session.post('https://github.com/sessions/verified-device', new URLSearchParams(vInputs).toString());
                if (vRes.statusCode !== 302) throw new Error("OTP Salah!");
            }
        } else {
             if (res.body.includes('Incorrect username')) throw new Error("Password Salah!");
        }
        await this.log("✅ Login Sukses.");
    }

    // --- STEP 2: PROFILE (PERBAIKAN SELECTOR) ---
    async step2_SetName() {
        await this.log(`📝 [Step 2] Set Nama: ${this.profile.fullName}`);
        const page = await this.session.get('https://github.com/settings/profile');
        
        // Cek apakah halaman terload benar
        if (!page.body.includes('Public profile')) {
            throw new Error("Gagal load halaman profile. Mungkin sesi login habis. Coba Step 1 lagi.");
        }

        // Cari form yang punya input 'user[profile_name]'
        // Kita tidak pakai selector CSS, tapi cari manual di text body
        // karena library cheerio kadang bingung kalau ada form nested
        let formInputs = extractAllInputs(page.body, 'form.edit_user'); // Coba selector class dulu
        
        if (!formInputs['user[profile_name]']) {
             // Fallback: Ambil form index 0, 1, 2... sampai ketemu
             for(let i=0; i<5; i++) {
                 const temp = extractAllInputs(page.body, i);
                 if (temp['user[profile_name]']) {
                     formInputs = temp;
                     break;
                 }
             }
        }
        
        if (!formInputs['user[profile_name]']) {
             throw new Error("Form Profile tidak ditemukan di HTML. GitHub mungkin mengubah layout.");
        }

        formInputs['user[profile_name]'] = this.profile.fullName;
        // Hapus input file kosong biar gak error multipart
        delete formInputs['user[profile_email]']; // Optional
        
        const res = await this.session.post(`https://github.com/users/${this.username}`, new URLSearchParams(formInputs).toString());
        
        if (res.statusCode !== 302) {
             // Debugging: Print title halaman errornya
            const title = res.body.match(/<title>(.*?)<\/title>/);
            const errTitle = title ? title[1] : "Unknown Error";
            console.log("FAIL BODY:", res.body.substring(0, 500));
            throw new Error(`Gagal Update Profil. Status: ${res.statusCode}. Page: ${errTitle}`);
        }
        await this.log("✅ Nama Sukses.");
    }

    // --- STEP 3: BILLING ---
    async step3_SetBilling() {
        await this.log(`💳 [Step 3] Set Billing...`);
        const page = await this.session.get('https://github.com/settings/billing/payment_information');
        
        // Cari form billing
        let formInputs = {};
        for(let i=0; i<5; i++) {
             const temp = extractAllInputs(page.body, i);
             if (temp['billing_contact[first_name]']) {
                 formInputs = temp;
                 break;
             }
        }

        if(!formInputs['billing_contact[first_name]']) {
             // Mungkin sudah terisi? Kita coba overwrite paksa dengan payload manual
             // Ambil token dari meta tag kalau form gak ketemu
             const token = extractInputValue(page.body, 'authenticity_token');
             if(!token) throw new Error("Gagal ambil token billing.");
             formInputs = { authenticity_token: token };
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
        // Hapus submit button value lama jika ada
        delete formInputs['submit']; 

        const res = await this.session.post('https://github.com/account/contact', new URLSearchParams(formInputs).toString());
        if (res.statusCode !== 302) throw new Error(`Gagal Update Billing. Status: ${res.statusCode}`);
        await this.log("✅ Billing Sukses.");
    }

    // --- STEP 4: EDU ---
    async step4_ApplyEdu() {
        await this.log(`🎓 [Step 4] Apply Edu...`);
        const schoolName = "NU University of Surakarta";
        const schoolId = "82921";

        const page1 = await this.session.get('https://github.com/settings/education/benefits');
        if (page1.url.includes('two_factor_authentication/setup')) {
            throw new Error("⛔ WAJIB AKTIFKAN 2FA MANUAL DULU DI BROWSER!");
        }

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

        await this.log("🖼️ Membuat KTM...");
        const ktmData = generateSemiAuto({
            univName: "NU UNIVERSITY OF SURAKARTA",
            fullName: this.profile.fullName,
            gender: this.profile.gender
        });
        const imgBuffer = await drawKTM(ktmData);
        
        const photoData = JSON.stringify({
            image: `data:image/jpeg;base64,${imgBuffer.toString('base64')}`,
            metadata: { filename: "proof.jpg", type: "upload", mimeType: "image/jpeg" }
        });

        const formInputs2 = extractAllInputs(res1.body);
        formInputs2['dev_pack_form[school_name]'] = schoolName;
        formInputs2['dev_pack_form[selected_school_id]'] = schoolId;
        formInputs2['dev_pack_form[school_email]'] = this.email;
        formInputs2['dev_pack_form[latitude]'] = '-7.570020342507728';
        formInputs2['dev_pack_form[longitude]'] = '110.80568597565748';
        formInputs2['dev_pack_form[location_shared]'] = 'true';
        formInputs2['dev_pack_form[application_type]'] = 'student';
        formInputs2['dev_pack_form[proof_type]'] = '1. Dated school ID - Good';
        formInputs2['dev_pack_form[photo_proof]'] = photoData;
        formInputs2['dev_pack_form[form_variant]'] = 'upload_proof_form';
        formInputs2['submit'] = 'Submit Application';

        const finalRes = await this.session.client.post('https://github.com/settings/education/developer_pack_applications', {
            body: new URLSearchParams(formInputs2).toString(),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Turbo-Frame': 'dev-pack-form' }
        });

        if (finalRes.body.includes('Thanks for submitting')) {
            await this.log("🎉 SUCCESS! Cek email.");
        } else {
            console.log("FAIL HTML:", finalRes.body.substring(0, 300));
            throw new Error('Gagal Submit Edu.');
        }
    }
}