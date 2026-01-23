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
        this.askUser = askUserFunc;
        
        // Inisialisasi Session baru dengan got-scraping
        this.session = new HttpSession();

        // Data Konsisten
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
            await this.log("🔑 Memulai Login (Got-Scraping)...");
            const needsVerification = await this._login();
            
            if (needsVerification) {
                await this.log("⚠️ Terdeteksi 'Device Verification'!");
                const otp = await this.askUser(this.ctx.chat.id, "📩 Cek Email! Masukkan *Kode 6 Digit* dari GitHub:");
                if (!otp) throw new Error("Timeout menunggu OTP.");
                await this._submitDeviceVerification(otp);
            }
            await this.log("✅ Login Sukses & Sesi Tersimpan.");

            await this.log("📝 Mengatur Profil & Billing...");
            await this._updateProfile();
            await this._updateBilling();
            
            await this.log("🛡️ Setup 2FA (TOTP)...");
            const { setupKey, recoveryCodes } = await this._enable2FA();
            
            const fileContent = `Username: ${this.username}\nPassword: ${this.password}\n2FA Secret: ${setupKey}\n\nRecovery Codes:\n${recoveryCodes.join('\n')}`;
            await this.ctx.replyWithDocument(
                { source: Buffer.from(fileContent), filename: `GH_${this.username}_SECURE.txt` },
                { caption: "🔐 *AKUN DIAMANKAN!* Simpan file ini." }
            );

            await this.log("🎓 Mengajukan Student Pack (NU Surakarta)...");
            await this._applyForEducation();
            
            await this.log("🎉 *SELESAI!* Cek status di https://github.com/education/benefits");
            return { success: true };

        } catch (error) {
            console.error(error);
            await this.ctx.reply(`❌ GAGAL: ${error.message}`);
            return { success: false };
        }
    }

    // --- LOGIKA INTERNAL (SAPU BERSIH) ---

    async _login() {
        // 1. GET Halaman Login
        const page = await this.session.get('https://github.com/login');
        
        // 2. Ambil SEMUA input (termasuk hidden timestamp, return_to, dll)
        // Kita ambil form index 0 (biasanya form login utama)
        const formInputs = extractAllInputs(page.body, 0); 
        
        // 3. Isi Kredensial
        formInputs.login = this.username;
        formInputs.password = this.password;
        formInputs.commit = "Sign in"; // Tombol submit

        // 4. POST Login
        const res = await this.session.post('https://github.com/session', new URLSearchParams(formInputs).toString());
        
        // Analisa Respon
        if (res.statusCode === 302) {
            const location = res.headers.location;
            if (location.includes('verified-device')) return true; // Minta OTP
            if (location === 'https://github.com/' || location.startsWith('/')) return false; // Sukses
        }
        
        // Jika status 200, berarti balik ke halaman login (Gagal)
        if (res.body.includes('Incorrect username or password')) throw new Error('Password Salah!');
        if (res.body.includes('CAPTCHA')) throw new Error('Terkena CAPTCHA GitHub (IP Kotor).');
        
        throw new Error(`Login Gagal. Status: ${res.statusCode}`);
    }

    async _submitDeviceVerification(otp) {
        // 1. GET Halaman Verifikasi (untuk refresh token)
        const page = await this.session.get('https://github.com/sessions/verified-device');
        const formInputs = extractAllInputs(page.body);
        
        formInputs.otp = otp;
        delete formInputs.commit; // Biasanya auto-submit via JS, tapi kita kirim manual

        // 2. POST OTP
        const res = await this.session.post('https://github.com/sessions/verified-device', new URLSearchParams(formInputs).toString());

        if (res.statusCode !== 302 || !res.headers.location.includes('github.com')) {
            throw new Error('OTP Salah atau Expired!');
        }
    }

    async _updateProfile() {
        const page = await this.session.get('https://github.com/settings/profile');
        // Cari form dengan class edit_user
        // Cheerio selector: 'form.edit_user'
        // Karena extractAllInputs pakai index, kita cari manual dulu indexnya atau pakai selector spesifik di helper (sudah diupdate)
        // Kita asumsikan extractAllInputs bisa handle selector string di helper saya sebelumnya.
        // TAPI biar aman, kita parse manual di sini khusus form spesifik
        const formInputs = extractAllInputs(page.body, 'form.edit_user');
        
        formInputs['user[profile_name]'] = this.profile.fullName;
        formInputs['_method'] = 'put'; // Penting buat Rails

        await this.session.post(`https://github.com/users/${this.username}`, new URLSearchParams(formInputs).toString());
    }

    async _updateBilling() {
        const page = await this.session.get('https://github.com/settings/billing/payment_information');
        // Form billing biasanya yang pertama atau kedua, kita cari yang ada 'billing_contact'
        const formInputs = extractAllInputs(page.body, 0); 

        // Update data
        formInputs['billing_contact[first_name]'] = this.billingInfo.firstName;
        formInputs['billing_contact[last_name]'] = this.billingInfo.lastName;
        formInputs['billing_contact[address1]'] = this.billingInfo.address1;
        formInputs['billing_contact[city]'] = this.billingInfo.city;
        formInputs['billing_contact[country_code]'] = this.billingInfo.country;
        formInputs['billing_contact[region]'] = this.billingInfo.region;
        formInputs['billing_contact[postal_code]'] = this.billingInfo.postalCode;
        formInputs['submit'] = 'Save billing information';

        await this.session.post('https://github.com/account/contact', new URLSearchParams(formInputs).toString());
    }

    async _enable2FA() {
        await this.session.get('https://github.com/settings/two_factor_authentication/setup/intro');
        
        // Setup App (POST kosong untuk dapat secret)
        const appRes = await this.session.client.post('https://github.com/settings/two_factor_authentication/setup/app', {
            headers: { 
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        
        const appData = JSON.parse(appRes.body);
        const secret = appData.mashed_secret;
        if (!secret) throw new Error('Gagal mendapatkan 2FA Secret.');

        // Generate TOTP
        const token = totp.generate(secret);
        
        // Kita perlu authenticity_token dari HTML yang dikirim di JSON response
        const verifyToken = extractInputValue(appData.html_content, 'authenticity_token');

        // Verifikasi
        const verifyRes = await this.session.client.post('https://github.com/settings/two_factor_authentication/setup/verify', {
            body: new URLSearchParams({
                authenticity_token: verifyToken,
                otp: token,
                type: 'app'
            }).toString(),
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });

        const verifyData = JSON.parse(verifyRes.body);
        if (!verifyData.formatted_recovery_codes) throw new Error('Gagal verifikasi TOTP.');

        // Final Enable
        const enableToken = extractInputValue(verifyData.html_content, 'authenticity_token');
        await this.session.post('https://github.com/settings/two_factor_authentication/setup/enable', new URLSearchParams({
            authenticity_token: enableToken
        }).toString());

        return { setupKey: secret, recoveryCodes: verifyData.formatted_recovery_codes };
    }

    async _applyForEducation() {
        const schoolName = "NU University of Surakarta";
        const schoolId = "82921"; // ID dari log Anda

        // 1. Load Halaman Benefits untuk dapat Token Awal
        const page1 = await this.session.get('https://github.com/settings/education/benefits');
        const formInputs1 = extractAllInputs(page1.body); // Ambil semua hidden input

        // 2. Isi Payload Step 1
        formInputs1['dev_pack_form[application_type]'] = 'student';
        formInputs1['dev_pack_form[school_name]'] = schoolName;
        formInputs1['dev_pack_form[selected_school_id]'] = schoolId;
        formInputs1['dev_pack_form[school_email]'] = this.email;
        formInputs1['dev_pack_form[latitude]'] = '-7.570020342507728';
        formInputs1['dev_pack_form[longitude]'] = '110.80568597565748';
        formInputs1['dev_pack_form[location_shared]'] = 'true';
        formInputs1['continue'] = 'Continue';

        // 3. POST Step 1
        const res1 = await this.session.client.post('https://github.com/settings/education/developer_pack_applications', {
            body: new URLSearchParams(formInputs1).toString(),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Turbo-Frame': 'dev-pack-form', // Header penting buat GitHub
                'Accept': 'text/vnd.turbo-stream.html, text/html, application/xhtml+xml'
            }
        });

        // 4. Generate KTM Proof
        await this.log("🖼️ Menggambar Bukti KTM...");
        const ktmData = generateSemiAuto({
            univName: "NU UNIVERSITY OF SURAKARTA",
            fullName: this.profile.fullName,
            gender: this.profile.gender
        });
        const imgBuffer = await drawKTM(ktmData);
        const base64Img = imgBuffer.toString('base64');

        const photoData = JSON.stringify({
            image: `data:image/jpeg;base64,${base64Img}`,
            metadata: { filename: "proof.jpg", type: "upload", mimeType: "image/jpeg", deviceLabel: null }
        });

        // 5. Siapkan Payload Step 2 (Ambil token baru dari res1)
        // Karena responnya turbo-stream/html, kita parse form di dalamnya
        const formInputs2 = extractAllInputs(res1.body);
        
        // Gabungkan data dari step 1 yang perlu dibawa (sesuai log Anda)
        // GitHub biasanya menyimpan state di server, tapi mengirim ulang parameter kunci lebih aman
        formInputs2['dev_pack_form[school_name]'] = schoolName;
        formInputs2['dev_pack_form[selected_school_id]'] = schoolId;
        formInputs2['dev_pack_form[school_email]'] = this.email;
        formInputs2['dev_pack_form[latitude]'] = '-7.570020342507728';
        formInputs2['dev_pack_form[longitude]'] = '110.80568597565748';
        formInputs2['dev_pack_form[location_shared]'] = 'true';
        
        // Data Baru Step 2
        formInputs2['dev_pack_form[proof_type]'] = '1. Dated school ID - Good';
        formInputs2['dev_pack_form[photo_proof]'] = photoData;
        formInputs2['dev_pack_form[form_variant]'] = 'upload_proof_form';
        formInputs2['submit'] = 'Submit Application';

        // 6. POST Step 2 (Final)
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
            console.log("GAGAL EDU:", finalRes.body.substring(0, 300));
            throw new Error('Gagal Submit Edu. Mungkin IP/Akun ditandai.');
        }
    }
}