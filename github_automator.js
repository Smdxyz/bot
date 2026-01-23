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
        
        formInputs['user[profile_name]'] = this.profile.fullName;
        formInputs['_method'] = 'put'; 

        await this.session.post(`https://github.com/users/${this.username}`, new URLSearchParams(formInputs).toString());
    }

    async _updateBilling() {
        const page = await this.session.get('https://github.com/settings/billing/payment_information');
        const formInputs = extractAllInputs(page.body, 0); 

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

    // --- BAGIAN INI YANG DIPERBAIKI ---
    async _enable2FA() {
        // 1. GET Intro Page (UNTUK AMBIL TOKEN)
        const introRes = await this.session.get('https://github.com/settings/two_factor_authentication/setup/intro');
        
        // Ambil token dari form di halaman intro
        // Token ini wajib dibawa saat request ke /setup/app
        const formInputs = extractAllInputs(introRes.body);
        const token = formInputs.authenticity_token;
        
        if (!token) {
            // Fallback: coba cari pake regex manual kalau extractAllInputs gagal di halaman ini
            const match = introRes.body.match(/name="authenticity_token" value="([^"]+)"/);
            if(!match) throw new Error("Gagal mengambil token CSRF dari halaman 2FA Intro");
        }

        // 2. Setup App (POST dengan TOKEN)
        const appRes = await this.session.client.post('https://github.com/settings/two_factor_authentication/setup/app', {
            body: new URLSearchParams({
                authenticity_token: token || formInputs.authenticity_token
            }).toString(),
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        
        // Cek apakah response JSON
        let appData;
        try {
            appData = JSON.parse(appRes.body);
        } catch (e) {
            console.error("2FA Setup Error Body:", appRes.body.substring(0, 200));
            throw new Error("Gagal memulai 2FA. GitHub mengembalikan HTML, bukan JSON.");
        }

        const secret = appData.mashed_secret;
        if (!secret) throw new Error('Gagal mendapatkan 2FA Secret.');

        // 3. Generate TOTP
        const code = totp.generate(secret);
        const verifyToken = extractInputValue(appData.html_content, 'authenticity_token');

        // 4. Verifikasi
        const verifyRes = await this.session.client.post('https://github.com/settings/two_factor_authentication/setup/verify', {
            body: new URLSearchParams({
                authenticity_token: verifyToken,
                otp: code,
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

        // 5. Final Enable
        const enableToken = extractInputValue(verifyData.html_content, 'authenticity_token');
        await this.session.post('https://github.com/settings/two_factor_authentication/setup/enable', new URLSearchParams({
            authenticity_token: enableToken
        }).toString());

        return { setupKey: secret, recoveryCodes: verifyData.formatted_recovery_codes };
    }

    async _applyForEducation() {
        const schoolName = "NU University of Surakarta";
        const schoolId = "82921"; 

        const page1 = await this.session.get('https://github.com/settings/education/benefits');
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
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Turbo-Frame': 'dev-pack-form',
                'Accept': 'text/vnd.turbo-stream.html, text/html, application/xhtml+xml'
            }
        });

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

        const formInputs2 = extractAllInputs(res1.body);
        
        formInputs2['dev_pack_form[school_name]'] = schoolName;
        formInputs2['dev_pack_form[selected_school_id]'] = schoolId;
        formInputs2['dev_pack_form[school_email]'] = this.email;
        formInputs2['dev_pack_form[latitude]'] = '-7.570020342507728';
        formInputs2['dev_pack_form[longitude]'] = '110.80568597565748';
        formInputs2['dev_pack_form[location_shared]'] = 'true';
        
        formInputs2['dev_pack_form[proof_type]'] = '1. Dated school ID - Good';
        formInputs2['dev_pack_form[photo_proof]'] = photoData;
        formInputs2['dev_pack_form[form_variant]'] = 'upload_proof_form';
        formInputs2['submit'] = 'Submit Application';

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
            throw new Error('Gagal Submit Edu. Mungkin IP/Akun ditandai atau email ditolak.');
        }
    }
}