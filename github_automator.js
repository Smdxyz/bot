// github_automator.js

import { HttpSession, extractInputValue, extractAllInputs } from './helpers.js';
import { generateSemiAuto } from './lib/randomizer.js';
import { drawKTM } from './lib/painter.js';
import { totp } from 'otplib';
import { fakerID_ID as faker } from '@faker-js/faker';

export class GitHubAutomator {
    constructor(ctx, username = '', password = '', email = '', existingState = null) {
        this.ctx = ctx;
        this.otpCallback = null; // Fungsi untuk memanggil prompt OTP di index.js
        this.otpResolver = null; // Fungsi untuk menyelesaikan promise OTP
        
        if (existingState) {
            console.log("♻️ Restore Session...");
            this.username = existingState.username;
            this.password = existingState.password;
            this.email = existingState.email;
            this.profile = existingState.profile;
            this.billingInfo = existingState.billingInfo;
            this.session = new HttpSession(existingState.cookies);
        } else {
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

    // Dipanggil dari index.js untuk set callback trigger OTP
    setOtpCallback(cb) {
        this.otpCallback = cb;
    }

    // Dipanggil dari index.js saat user memasukkan kode OTP
    resolveOtp(code) {
        if (this.otpResolver) {
            this.otpResolver(code);
            this.otpResolver = null;
        }
    }

    // Fungsi internal untuk menunggu OTP dari user
    async _waitForOtp() {
        if (!this.otpCallback) throw new Error("OTP Callback belum diset di index.js");
        
        // Panggil prompt di Telegram
        await this.otpCallback();
        
        // Return Promise yang akan di-resolve oleh resolveOtp()
        return new Promise((resolve) => {
            this.otpResolver = resolve;
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
        }, null, 2);
    }

    async log(message) {
        console.log(`[GH] ${message}`);
        await this.ctx.reply(`➤ ${message}`).catch(()=>{});
    }

    // --- STEP 1: LOGIN ---
    async step1_Login() {
        await this.log("🔑 [Step 1] Login dimulai...");
        
        const page = await this.session.get('https://github.com/login');
        const formInputs = extractAllInputs(page.body, 0);
        
        formInputs.login = this.username;
        formInputs.password = this.password;
        formInputs.commit = "Sign in";

        const res = await this.session.post('https://github.com/session', new URLSearchParams(formInputs).toString());
        
        if (res.statusCode === 302) {
            const loc = res.headers.location;
            
            // Kena OTP Email
            if (loc.includes('verified-device')) {
                await this.log("⚠️ Masukkan OTP Email!");
                
                // Tunggu input dari user (via mekanisme resolveOtp)
                const otp = await this._waitForOtp();
                
                const vPage = await this.session.get('https://github.com/sessions/verified-device');
                const vInputs = extractAllInputs(vPage.body);
                vInputs.otp = otp;
                delete vInputs.commit;
                
                const vRes = await this.session.post('https://github.com/sessions/verified-device', new URLSearchParams(vInputs).toString());
                if (vRes.statusCode !== 302) throw new Error("OTP Email Salah!");
                
                await this.log("✅ OTP Diterima.");
            }
        } else {
             if (res.body.includes('Incorrect username')) throw new Error("Username/Password Salah!");
        }

        await this.log("✅ [Step 1] Login Sukses.");
    }

    // --- STEP 2: PROFILE ---
    async step2_SetName() {
        await this.log(`📝 [Step 2] Set Nama: ${this.profile.fullName}`);
        const page = await this.session.get('https://github.com/settings/profile');
        const formInputs = extractAllInputs(page.body, 'form.edit_user');
        
        formInputs['user[profile_name]'] = this.profile.fullName;
        formInputs['_method'] = 'put';

        const res = await this.session.post(`https://github.com/users/${this.username}`, new URLSearchParams(formInputs).toString());
        if (res.statusCode !== 302) throw new Error("Gagal Update Profil.");
        await this.log("✅ Nama Sukses.");
    }

    // --- STEP 3: BILLING ---
    async step3_SetBilling() {
        await this.log(`💳 [Step 3] Set Billing...`);
        const page = await this.session.get('https://github.com/settings/billing/payment_information');
        
        let formInputs = extractAllInputs(page.body, 0);
        if (!formInputs['billing_contact[first_name]']) formInputs = extractAllInputs(page.body, 1);

        formInputs['billing_contact[first_name]'] = this.billingInfo.firstName;
        formInputs['billing_contact[last_name]'] = this.billingInfo.lastName;
        formInputs['billing_contact[address1]'] = this.billingInfo.address1;
        formInputs['billing_contact[city]'] = this.billingInfo.city;
        formInputs['billing_contact[country_code]'] = this.billingInfo.country;
        formInputs['billing_contact[region]'] = this.billingInfo.region;
        formInputs['billing_contact[postal_code]'] = this.billingInfo.postalCode;
        formInputs['target'] = 'user';
        formInputs['contact_type'] = 'billing';

        const res = await this.session.post('https://github.com/account/contact', new URLSearchParams(formInputs).toString());
        if (res.statusCode !== 302) throw new Error("Gagal Update Billing.");
        await this.log("✅ Billing Sukses.");
    }

    // --- STEP 4: EDU ---
    async step4_ApplyEdu() {
        await this.log(`🎓 [Step 4] Apply Edu...`);
        
        // 1. Cek Syarat 2FA
        const page1 = await this.session.get('https://github.com/settings/education/benefits');
        if (page1.url.includes('two_factor_authentication/setup')) {
            throw new Error("⛔ WAJIB AKTIFKAN 2FA MANUAL DULU DI BROWSER!");
        }

        // 2. Submit Data Sekolah
        const formInputs1 = extractAllInputs(page1.body);
        formInputs1['dev_pack_form[application_type]'] = 'student';
        formInputs1['dev_pack_form[school_name]'] = "NU University of Surakarta";
        formInputs1['dev_pack_form[selected_school_id]'] = "82921";
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
            fullName: this.profile.fullName,
            gender: this.profile.gender
        });
        const imgBuffer = await drawKTM(ktmData);
        const photoData = JSON.stringify({
            image: `data:image/jpeg;base64,${imgBuffer.toString('base64')}`,
            metadata: { filename: "proof.jpg", type: "upload", mimeType: "image/jpeg" }
        });

        // 4. Submit Final
        const formInputs2 = extractAllInputs(res1.body);
        formInputs2['dev_pack_form[school_name]'] = "NU University of Surakarta";
        formInputs2['dev_pack_form[selected_school_id]'] = "82921";
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
            await this.log("🎉 SUCCESS! Silakan cek email student.");
        } else {
            console.log("FAIL HTML:", finalRes.body.substring(0, 400));
            throw new Error('Gagal Submit Edu. Cek log.');
        }
    }
}