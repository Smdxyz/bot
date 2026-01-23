// github_automator.js

import { HttpSession, extractInputValue, extractAllInputs } from './helpers.js';
import { generateSemiAuto } from './lib/randomizer.js';
import { drawKTM } from './lib/painter.js';
import { totp } from 'otplib';
import { fakerID_ID as faker } from '@faker-js/faker';

export class GitHubAutomator {
    constructor(ctx, username, password, email, askUserFunc) {
        this.ctx = ctx;
        this.username = username;
        this.password = password;
        this.email = email;
        this.askUser = askUserFunc; // Fungsi buat nanya OTP ke Admin
        this.session = new HttpSession();

        // GENERATE DATA KONSISTEN
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

        this.log(`Target: ${this.profile.fullName} | Email: ${this.email}`);
    }

    async log(message) {
        console.log(`[GH-Auto] ${message}`);
        await this.ctx.reply(`➤ ${message}`).catch(()=>{});
    }

    async run() {
        try {
            await this.log("🔑 Login GitHub...");
            const needsVerification = await this._login();
            
            if (needsVerification) {
                await this.log("⚠️ Verifikasi Device terdeteksi!");
                // Minta OTP ke Admin lewat Telegram
                const otp = await this.askUser(this.ctx.chat.id, "📩 Masukkan *OTP Email* GitHub sekarang:");
                await this._submitDeviceVerification(otp);
            }
            await this.log("✅ Login OK.");

            await this.log("📝 Update Profile & Billing...");
            await this._updateProfile();
            await this._updateBilling();
            
            await this.log("🛡️ Mengaktifkan 2FA (TOTP)...");
            const { setupKey, recoveryCodes } = await this._enable2FA();
            
            // Kirim data rahasia
            const fileContent = `Username: ${this.username}\nPassword: ${this.password}\n2FA Secret: ${setupKey}\n\nRecovery Codes:\n${recoveryCodes.join('\n')}`;
            await this.ctx.replyWithDocument(
                { source: Buffer.from(fileContent), filename: `GH_${this.username}.txt` },
                { caption: "🔐 Simpan file ini baik-baik!" }
            );

            await this.log("🎓 Melamar GitHub Education...");
            await this._applyForEducation();
            
            return { success: true };

        } catch (error) {
            console.error(error);
            await this.ctx.reply(`❌ GAGAL: ${error.message}`);
            return { success: false };
        }
    }

    // --- LOGIKA INTERNAL ---

    async _login() {
        const page = await this.session.get('https://github.com/login');
        const inputs = extractAllInputs(page.data);
        inputs.login = this.username;
        inputs.password = this.password;
        
        const res = await this.session.post('https://github.com/session', new URLSearchParams(inputs).toString());
        
        if (res.status === 302 && res.headers.location.includes('verified-device')) return true;
        if (res.status === 302) return false; // Login sukses langsung
        
        if (res.data.includes('Incorrect username or password')) throw new Error('Password Salah!');
        throw new Error('Login gagal, mungkin kena captcha/rate limit.');
    }

    async _submitDeviceVerification(otp) {
        const page = await this.session.get('https://github.com/sessions/verified-device');
        const token = extractInputValue(page.data, 'authenticity_token');
        
        const res = await this.session.post('https://github.com/sessions/verified-device', new URLSearchParams({
            authenticity_token: token,
            otp: otp
        }).toString());

        if (res.status !== 302 || !res.headers.location.includes('github.com')) {
            throw new Error('OTP Salah atau Expired!');
        }
    }

    async _updateProfile() {
        const page = await this.session.get('https://github.com/settings/profile');
        const inputs = extractAllInputs(page.data, 'form.edit_user');
        inputs['user[profile_name]'] = this.profile.fullName;
        inputs['_method'] = 'put';

        await this.session.post(`https://github.com/users/${this.username}`, new URLSearchParams(inputs).toString());
    }

    async _updateBilling() {
        const page = await this.session.get('https://github.com/settings/billing/payment_information');
        const token = extractInputValue(page.data, 'authenticity_token');

        const data = {
            authenticity_token: token,
            'billing_contact[first_name]': this.billingInfo.firstName,
            'billing_contact[last_name]': this.billingInfo.lastName,
            'billing_contact[address1]': this.billingInfo.address1,
            'billing_contact[city]': this.billingInfo.city,
            'billing_contact[country_code]': this.billingInfo.country,
            'billing_contact[region]': this.billingInfo.region,
            'billing_contact[postal_code]': this.billingInfo.postalCode,
            target: 'user',
            user_id: this.username,
            contact_type: 'billing'
        };

        await this.session.post('https://github.com/account/contact', new URLSearchParams(data).toString());
    }

    async _enable2FA() {
        // Buka halaman intro
        await this.session.get('https://github.com/settings/two_factor_authentication/setup/intro');
        
        // Minta Setup Key
        const appRes = await this.session.post('https://github.com/settings/two_factor_authentication/setup/app', '', { headers: { Accept: 'application/json' }});
        const secret = appRes.data.mashed_secret;
        if (!secret) throw new Error('Gagal ambil 2FA Secret');

        // Generate TOTP
        const token = totp.generate(secret);
        const verifyToken = extractInputValue(appRes.data.html_content, 'authenticity_token');

        // Verifikasi
        const verifyRes = await this.session.post('https://github.com/settings/two_factor_authentication/setup/verify', new URLSearchParams({
            authenticity_token: verifyToken,
            otp: token,
            type: 'app'
        }).toString(), { headers: { Accept: 'application/json' }});

        if (!verifyRes.data.formatted_recovery_codes) throw new Error('Gagal verifikasi TOTP');

        // Enable Final
        const finalToken = extractInputValue(verifyRes.data.html_content, 'authenticity_token');
        await this.session.post('https://github.com/settings/two_factor_authentication/setup/enable', new URLSearchParams({
            authenticity_token: finalToken
        }).toString());

        return { setupKey: secret, recoveryCodes: verifyRes.data.formatted_recovery_codes };
    }

    async _applyForEducation() {
        const schoolName = "NU University of Surakarta";
        const schoolId = "82921"; // ID Statis dari log Anda, lebih aman daripada search ulang

        // 1. Ambil Token Form Awal
        const page1 = await this.session.get('https://github.com/settings/education/benefits');
        const token1 = extractInputValue(page1.data, 'authenticity_token');

        // 2. Submit Step 1 (Pilih Sekolah)
        const step1Data = new URLSearchParams({
            authenticity_token: token1,
            'dev_pack_form[application_type]': 'student',
            'dev_pack_form[school_name]': schoolName,
            'dev_pack_form[selected_school_id]': schoolId,
            'dev_pack_form[school_email]': this.email,
            'dev_pack_form[latitude]': '-7.570020342507728',
            'dev_pack_form[longitude]': '110.80568597565748',
            'dev_pack_form[location_shared]': 'true',
            'dev_pack_form[form_variant]': 'initial_form'
        });

        const res1 = await this.session.post('https://github.com/settings/education/developer_pack_applications', step1Data.toString(), {
            headers: { 'Turbo-Frame': 'dev-pack-form' }
        });

        // 3. Generate Bukti KTM (Base64)
        await this.log("🖼️ Menggambar KTM...");
        const ktmData = generateSemiAuto({
            univName: "NU UNIVERSITY OF SURAKARTA", // Harus uppercase di KTM
            fullName: this.profile.fullName,
            gender: this.profile.gender
        });
        const imgBuffer = await drawKTM(ktmData);
        const base64Img = imgBuffer.toString('base64');

        // 4. Submit Step 2 (Upload Bukti)
        const token2 = extractInputValue(res1.data, 'authenticity_token');
        
        const photoData = JSON.stringify({
            image: `data:image/jpeg;base64,${base64Img}`,
            metadata: { filename: "ktm_proof.jpg", type: "upload", mimeType: "image/jpeg" }
        });

        const finalData = new URLSearchParams();
        // Copy semua data penting dari step 1 (WAJIB)
        for (const [key, val] of step1Data.entries()) {
            if(!['authenticity_token', 'dev_pack_form[form_variant]'].includes(key)) {
                finalData.append(key, val);
            }
        }
        
        // Tambah data baru
        finalData.append('authenticity_token', token2);
        finalData.append('dev_pack_form[proof_type]', '1. Dated school ID - Good');
        finalData.append('dev_pack_form[photo_proof]', photoData);
        finalData.append('dev_pack_form[form_variant]', 'upload_proof_form');
        finalData.append('submit', 'Submit Application');

        const finalRes = await this.session.post('https://github.com/settings/education/developer_pack_applications', finalData.toString(), {
            headers: { 'Turbo-Frame': 'dev-pack-form' }
        });

        // Cek Sukses
        if (finalRes.data.includes('Thanks for submitting')) {
            return true;
        } else {
            console.log("DEBUG HTML GAGAL:", finalRes.data.substring(0, 500));
            throw new Error('Gagal Submit Edu (Cek log)');
        }
    }
}