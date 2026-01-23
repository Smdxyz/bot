// github_automator.js

import { HttpSession, extractInputValue, extractAllInputs } from './helpers.js';
import { generateSemiAuto } from './lib/randomizer.js';
import { drawKTM } from './lib/painter.js';
import { fakerID_ID as faker } from '@faker-js/faker';

export class GitHubAutomator {
    constructor(ctx, username = '', password = '', email = '', existingState = null, askUserFunc = null) {
        this.ctx = ctx;
        this.askUser = askUserFunc;
        
        if (existingState) {
            // LOAD DARI JSON (Restore Session)
            console.log("♻️ Merestore sesi dari JSON...");
            this.username = existingState.username;
            this.password = existingState.password;
            this.email = existingState.email;
            this.profile = existingState.profile;
            this.billingInfo = existingState.billingInfo;
            this.session = new HttpSession(existingState.cookies);
            this.log(`Sesi dipulihkan untuk: ${this.profile.fullName}`);
        } else {
            // SESI BARU
            this.username = username;
            this.password = password;
            this.email = email;
            this.session = new HttpSession();

            // Generate Data Konsisten SEKALI SAJA di awal
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

    // Fungsi untuk export state ke JSON
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
        console.log(`[GH-Auto] ${message}`);
        await this.ctx.reply(`➤ ${message}`).catch(()=>{});
    }

    // ============================================================
    // STEP 1: LOGIN (Support OTP Email & 2FA App)
    // ============================================================
    async step1_Login() {
        await this.log("🔑 [Step 1] Login dimulai...");
        
        const page = await this.session.get('https://github.com/login');
        const formInputs = extractAllInputs(page.body, 0);
        
        formInputs.login = this.username;
        formInputs.password = this.password;
        formInputs.commit = "Sign in";

        const res = await this.session.post('https://github.com/session', new URLSearchParams(formInputs).toString());
        
        // Cek Redirect
        if (res.statusCode === 302) {
            const loc = res.headers.location;
            
            // A. Kena OTP Email
            if (loc.includes('verified-device')) {
                await this.log("⚠️ Minta Verifikasi Email!");
                const otp = await this.askUser(this.ctx.chat.id, "📩 Masukkan OTP Email:");
                if(!otp) throw new Error("Timeout OTP Email.");
                
                const vPage = await this.session.get('https://github.com/sessions/verified-device');
                const vInputs = extractAllInputs(vPage.body);
                vInputs.otp = otp;
                delete vInputs.commit;
                
                const vRes = await this.session.post('https://github.com/sessions/verified-device', new URLSearchParams(vInputs).toString());
                if (vRes.statusCode !== 302) throw new Error("OTP Email Salah!");
            }
            
            // B. Kena 2FA (Authenticator App)
            else if (loc.includes('two-factor')) {
                await this.log("🔐 Minta 2FA Authenticator (TOTP)!");
                const appOtp = await this.askUser(this.ctx.chat.id, "📲 Masukkan Kode 2FA Authenticator:");
                if(!appOtp) throw new Error("Timeout 2FA.");

                // Request ke endpoint two-factor sesuai curl
                const tfPage = await this.session.get('https://github.com/sessions/two-factor');
                const tfInputs = extractAllInputs(tfPage.body); // Ambil token
                
                // Construct payload manual biar persis curl
                const tfPayload = new URLSearchParams();
                tfPayload.append('authenticity_token', tfInputs.authenticity_token);
                tfPayload.append('app_otp', appOtp);

                const tfRes = await this.session.post('https://github.com/sessions/two-factor', tfPayload.toString(), {
                    'Referer': 'https://github.com/sessions/two-factor/app'
                });

                if (tfRes.statusCode === 302) {
                    await this.log("✅ 2FA Tembus!");
                } else {
                    throw new Error("Kode 2FA Salah!");
                }
            }
        } else {
            if (res.body.includes('Incorrect username')) throw new Error("Username/Password Salah!");
        }

        await this.log("✅ [Step 1] Login Selesai. Sesi disimpan.");
    }

    // ============================================================
    // STEP 2: SET FULL NAME (Konsisten)
    // ============================================================
    async step2_SetName() {
        await this.log(`📝 [Step 2] Mengatur Nama Profil: ${this.profile.fullName}`);
        const page = await this.session.get('https://github.com/settings/profile');
        const formInputs = extractAllInputs(page.body, 'form.edit_user'); // Selector spesifik
        
        formInputs['user[profile_name]'] = this.profile.fullName;
        formInputs['_method'] = 'put';

        const res = await this.session.post(`https://github.com/users/${this.username}`, new URLSearchParams(formInputs).toString());
        if (res.statusCode !== 302) throw new Error("Gagal Update Profil.");
        
        await this.log("✅ [Step 2] Profil Sukses.");
    }

    // ============================================================
    // STEP 3: SET BILLING INFO (Konsisten)
    // ============================================================
    async step3_SetBilling() {
        await this.log(`💳 [Step 3] Mengatur Billing Info...`);
        const page = await this.session.get('https://github.com/settings/billing/payment_information');
        
        // Cari form billing (kadang index berubah, kita cari yg ada field first_name)
        let formInputs = {};
        if (page.body.includes('billing_contact[first_name]')) {
            formInputs = extractAllInputs(page.body, 0);
            if (!formInputs['billing_contact[first_name]']) formInputs = extractAllInputs(page.body, 1);
        } else {
            // Fallback: coba ambil form index 0 aja
            formInputs = extractAllInputs(page.body, 0);
        }

        formInputs['billing_contact[first_name]'] = this.billingInfo.firstName;
        formInputs['billing_contact[last_name]'] = this.billingInfo.lastName;
        formInputs['billing_contact[address1]'] = this.billingInfo.address1;
        formInputs['billing_contact[city]'] = this.billingInfo.city;
        formInputs['billing_contact[country_code]'] = this.billingInfo.country;
        formInputs['billing_contact[region]'] = this.billingInfo.region;
        formInputs['billing_contact[postal_code]'] = this.billingInfo.postalCode;
        
        // Pastikan target user & tipe contact benar
        formInputs['target'] = 'user';
        formInputs['contact_type'] = 'billing';

        const res = await this.session.post('https://github.com/account/contact', new URLSearchParams(formInputs).toString());
        if (res.statusCode !== 302) throw new Error("Gagal Update Billing.");

        await this.log("✅ [Step 3] Billing Sukses.");
    }

    // ============================================================
    // STEP 4: APPLY EDUCATION (Generete KTM & Upload)
    // ============================================================
    async step4_ApplyEdu() {
        await this.log(`🎓 [Step 4] Apply Education (NU Surakarta)...`);
        
        const schoolName = "NU University of Surakarta";
        const schoolId = "82921";

        // A. Pre-check Halaman Benefits
        const page1 = await this.session.get('https://github.com/settings/education/benefits');
        if (page1.url.includes('two_factor_authentication/setup')) {
            throw new Error("⛔ Wajib 2FA! Silakan aktifkan 2FA manual di browser lalu lanjut.");
        }

        // B. Submit Step 1 (Pilih Sekolah)
        const formInputs1 = extractAllInputs(page1.body);
        // Timpa data
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

        // C. Generate KTM (Base64)
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

        // D. Submit Step 2 (Upload Bukti)
        const formInputs2 = extractAllInputs(res1.body);
        
        // Bawa ulang data step 1 (Wajib konsisten)
        formInputs2['dev_pack_form[school_name]'] = schoolName;
        formInputs2['dev_pack_form[selected_school_id]'] = schoolId;
        formInputs2['dev_pack_form[school_email]'] = this.email;
        formInputs2['dev_pack_form[latitude]'] = '-7.570020342507728';
        formInputs2['dev_pack_form[longitude]'] = '110.80568597565748';
        formInputs2['dev_pack_form[location_shared]'] = 'true';
        formInputs2['dev_pack_form[application_type]'] = 'student';
        
        // Data Step 2
        formInputs2['dev_pack_form[proof_type]'] = '1. Dated school ID - Good';
        formInputs2['dev_pack_form[photo_proof]'] = photoData;
        formInputs2['dev_pack_form[form_variant]'] = 'upload_proof_form';
        formInputs2['submit'] = 'Submit Application';

        const finalRes = await this.session.client.post('https://github.com/settings/education/developer_pack_applications', {
            body: new URLSearchParams(formInputs2).toString(),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Turbo-Frame': 'dev-pack-form' }
        });

        if (finalRes.body.includes('Thanks for submitting')) {
            await this.log("🎉 [Step 4] BERHASIL SUBMIT! Cek Email.");
        } else {
            throw new Error('Gagal Submit Edu (Cek log console).');
        }
    }
}