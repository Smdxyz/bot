// github_automator.js

import { HttpSession, extractInputValue, extractAllInputs } from './helpers.js';
import { generateSemiAuto } from './lib/randomizer.js';
import { drawKTM } from './lib/painter.js';
import { fakerID_ID as faker } from '@faker-js/faker';

export class GitHubAutomator {
    constructor(ctx, username, password, email, askUserFunc) {
        this.ctx = ctx;
        this.username = username;
        this.password = password;
        this.email = email;
        this.askUser = askUserFunc;
        
        this.session = new HttpSession();

        // --- 1. GENERATE DATA KONSISTEN (SEKALI SAJA DI SINI) ---
        const sex = Math.random() > 0.5 ? 'male' : 'female';
        const firstName = faker.person.firstName(sex);
        const lastName = faker.person.lastName(sex);
        
        // Nama Lengkap untuk Profile & KTM
        this.fullName = `${firstName} ${lastName}`.toUpperCase();
        this.gender = sex === 'male' ? 'pria' : 'wanita';

        // Data Billing (Nama Depan & Belakang dipisah tapi dari sumber yang sama)
        this.billingInfo = {
            firstName: firstName.toUpperCase(),
            lastName: lastName.toUpperCase(),
            address1: "Jl. Cipaganti No. 45, Kelurahan Cipaganti, Kecamatan Coblong",
            city: "Bandung",
            country: "ID",
            region: "Jawa Barat",
            postalCode: "40131",
        };

        this.log(`♻️ Data Konsisten Dibuat: ${this.fullName} (${this.email})`);
    }

    async log(message) {
        console.log(`[GH-Auto] ${message}`);
        await this.ctx.reply(`➤ ${message}`).catch(()=>{});
    }

    async run() {
        try {
            // 1. LOGIN
            await this.log("🔑 Memulai Login...");
            const needsVerification = await this._login();
            
            if (needsVerification) {
                await this.log("⚠️ Terdeteksi 'Device Verification'!");
                const otp = await this.askUser(this.ctx.chat.id, "📩 Cek Email! Masukkan *Kode 6 Digit* dari GitHub:");
                if (!otp) throw new Error("Timeout menunggu OTP.");
                await this._submitDeviceVerification(otp);
            }
            await this.log("✅ Login Sukses.");

            // 2. SET PROFILE & BILLING (WAJIB SAMA)
            await this.log(`📝 Update Profile: ${this.fullName}`);
            await this._updateProfile();
            
            await this.log(`💳 Update Billing: ${this.billingInfo.firstName} ${this.billingInfo.lastName}`);
            await this._updateBilling();
            
            // 3. SKIP 2FA (Bypass sesuai request)
            await this.log("⏩ Skip Setup 2FA (Sesuai instruksi)...");
            // const { setupKey, recoveryCodes } = await this._enable2FA(); // DI-COMMENT DULU
            
            // 4. APPLY EDUCATION (VERIFIKASI)
            await this.log("🎓 Memulai Pendaftaran Student Pack...");
            // Catatan: Jika akun belum aktif 2FA, GitHub mungkin akan redirect ke halaman setup 2FA
            // saat mencoba akses halaman education. Kita coba saja.
            await this._applyForEducation();
            
            await this.log("🎉 *SELESAI!* Silakan cek email/status.");
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
        const formInputs = extractAllInputs(page.body, 0); 
        
        formInputs.login = this.username;
        formInputs.password = this.password;
        formInputs.commit = "Sign in";

        const res = await this.session.post('https://github.com/session', new URLSearchParams(formInputs).toString());
        
        if (res.statusCode === 302) {
            const location = res.headers.location;
            if (location.includes('verified-device')) return true; 
            if (location === 'https://github.com/' || location.startsWith('/')) return false; 
        }
        
        if (res.body.includes('Incorrect username or password')) throw new Error('Password Salah!');
        if (res.body.includes('CAPTCHA')) throw new Error('Terkena CAPTCHA GitHub (IP Kotor).');
        
        throw new Error(`Login Gagal. Status: ${res.statusCode}`);
    }

    async _submitDeviceVerification(otp) {
        const page = await this.session.get('https://github.com/sessions/verified-device');
        const formInputs = extractAllInputs(page.body);
        
        formInputs.otp = otp;
        delete formInputs.commit;

        const res = await this.session.post('https://github.com/sessions/verified-device', new URLSearchParams(formInputs).toString());

        if (res.statusCode !== 302 || !res.headers.location.includes('github.com')) {
            throw new Error('OTP Salah atau Expired!');
        }
    }

    async _updateProfile() {
        const page = await this.session.get('https://github.com/settings/profile');
        const formInputs = extractAllInputs(page.body, 'form.edit_user');
        
        // PENTING: Pakai nama konsisten yang di-generate di constructor
        formInputs['user[profile_name]'] = this.fullName;
        formInputs['_method'] = 'put'; 

        await this.session.post(`https://github.com/users/${this.username}`, new URLSearchParams(formInputs).toString());
    }

    async _updateBilling() {
        const page = await this.session.get('https://github.com/settings/billing/payment_information');
        const formInputs = extractAllInputs(page.body, 0); 

        // PENTING: Pakai nama konsisten dari constructor
        formInputs['billing_contact[first_name]'] = this.billingInfo.firstName;
        formInputs['billing_contact[last_name]'] = this.billingInfo.lastName;
        
        // Data alamat statis (bisa diubah di constructor)
        formInputs['billing_contact[address1]'] = this.billingInfo.address1;
        formInputs['billing_contact[city]'] = this.billingInfo.city;
        formInputs['billing_contact[country_code]'] = this.billingInfo.country;
        formInputs['billing_contact[region]'] = this.billingInfo.region;
        formInputs['billing_contact[postal_code]'] = this.billingInfo.postalCode;
        formInputs['submit'] = 'Save billing information';

        await this.session.post('https://github.com/account/contact', new URLSearchParams(formInputs).toString());
    }

    async _applyForEducation() {
        const schoolName = "NU University of Surakarta";
        const schoolId = "82921"; 

        // 1. Load Halaman Benefits
        const page1 = await this.session.get('https://github.com/settings/education/benefits');
        
        // Cek apakah diredirect ke 2FA setup (karena kita skip 2FA)
        if (page1.url.includes('two_factor_authentication/setup')) {
            throw new Error("⛔ Akun ini BELUM 2FA. GitHub mewajibkan 2FA untuk daftar Edu. Silakan aktifkan manual atau nyalakan fitur 2FA di bot.");
        }

        const formInputs1 = extractAllInputs(page1.body);

        formInputs1['dev_pack_form[application_type]'] = 'student';
        formInputs1['dev_pack_form[school_name]'] = schoolName;
        formInputs1['dev_pack_form[selected_school_id]'] = schoolId;
        formInputs1['dev_pack_form[school_email]'] = this.email;
        // Lokasi Hardcoded sesuai request
        formInputs1['dev_pack_form[latitude]'] = '-7.570020342507728';
        formInputs1['dev_pack_form[longitude]'] = '110.80568597565748';
        formInputs1['dev_pack_form[location_shared]'] = 'true';
        formInputs1['continue'] = 'Continue';

        const res1 = await this.session.client.post('https://github.com/settings/education/developer_pack_applications', {
            body: new URLSearchParams(formInputs1).toString(),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Turbo-Frame': 'dev-pack-form',
                'Accept': 'text/vnd.turbo-stream.html, text/html, application/xhtml+xml'
            }
        });

        // 2. Generate Bukti KTM (Base64) - Nama DIJAMIN SAMA dengan Profil
        await this.log(`🖼️ Menggambar Bukti KTM atas nama: ${this.fullName}...`);
        
        const ktmData = generateSemiAuto({
            univName: "NU UNIVERSITY OF SURAKARTA",
            fullName: this.fullName, // <-- KONSISTENSI DI SINI
            gender: this.gender      // <-- KONSISTENSI DI SINI
        });
        
        // Generate gambar
        const imgBuffer = await drawKTM(ktmData);
        const base64Img = imgBuffer.toString('base64');

        const photoData = JSON.stringify({
            image: `data:image/jpeg;base64,${base64Img}`,
            metadata: { filename: "proof.jpg", type: "upload", mimeType: "image/jpeg", deviceLabel: null }
        });

        // 3. Siapkan Payload Final
        // Ambil token baru dari response step 1
        const formInputs2 = extractAllInputs(res1.body);
        
        // Gabungkan data penting dari step 1 ke step 2 (Wajib dibawa ulang)
        formInputs2['dev_pack_form[school_name]'] = schoolName;
        formInputs2['dev_pack_form[selected_school_id]'] = schoolId;
        formInputs2['dev_pack_form[school_email]'] = this.email;
        formInputs2['dev_pack_form[latitude]'] = '-7.570020342507728';
        formInputs2['dev_pack_form[longitude]'] = '110.80568597565748';
        formInputs2['dev_pack_form[location_shared]'] = 'true';
        formInputs2['dev_pack_form[application_type]'] = 'student';
        
        // Data Baru Step 2
        formInputs2['dev_pack_form[proof_type]'] = '1. Dated school ID - Good';
        formInputs2['dev_pack_form[photo_proof]'] = photoData;
        formInputs2['dev_pack_form[form_variant]'] = 'upload_proof_form';
        formInputs2['submit'] = 'Submit Application';

        // 4. POST Step 2 (Final)
        const finalRes = await this.session.client.post('https://github.com/settings/education/developer_pack_applications', {
            body: new URLSearchParams(formInputs2).toString(),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Turbo-Frame': 'dev-pack-form'
            }
        });

        if (finalRes.body.includes('Thanks for submitting')) {
            return true;
        } else {
            console.log("GAGAL EDU (Snippet):", finalRes.body.substring(0, 300));
            // Cek apakah ditolak karena 2FA
            if (finalRes.body.includes('two-factor')) {
                throw new Error('Gagal: GitHub mewajibkan 2FA aktif sebelum submit.');
            }
            throw new Error('Gagal Submit Edu. Cek log console untuk detail HTML.');
        }
    }
}