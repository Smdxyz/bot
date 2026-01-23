// github_automator.js

import { HttpSession, extractInputValue, extractAllInputs } from './helpers.js';
import { generateSemiAuto } from './lib/randomizer.js';
import { drawKTM } from './lib/painter.js';
import { totp } from 'otplib';
import { fakerID_ID as faker } from '@faker-js/faker';

export class GitHubAutomator {
    constructor(ctx, username, password, email) {
        this.ctx = ctx;
        this.username = username;
        this.password = password;
        this.email = email;
        this.session = new HttpSession();

        const firstName = faker.person.firstName('male');
        const lastName = faker.person.lastName('male');
        this.fullName = `${firstName} ${lastName}`.toUpperCase();

        this.billingInfo = {
            firstName: firstName.toUpperCase(),
            lastName: lastName.toUpperCase(),
            address1: "Jl. Cipaganti No. 45, Kelurahan Cipaganti, Kecamatan Coblong",
            city: "Bandung",
            country: "ID",
            region: "Jawa Barat",
            postalCode: "40131",
        };

        this.log(`Data konsisten dibuat untuk Sesi Ini: "${this.fullName}"`);
    }

    async log(message) {
        console.log(`[GH-Auto | ${this.username}] ${message}`);
        await this.ctx.reply(`- ${message}`).catch(e => console.error("Gagal kirim log ke Telegram:", e.message));
    }

    async run() {
        try {
            await this.log("Mencoba login...");
            const needsVerification = await this._login();
            
            if (needsVerification) {
                await this.log("Akun membutuhkan verifikasi perangkat (OTP Email).");
                const otp = await this.ctx.prompt.text("Silakan masukkan kode OTP dari email Anda (waktu 60 detik):", { timeout: 60000 });
                await this._submitDeviceVerification(otp);
            }
            await this.log("✅ Login berhasil!");

            await this.log("Mengatur nama profil...");
            await this._updateProfile();
            await this.log("✅ Nama profil berhasil diatur.");
            
            await this.log("Mengatur informasi billing...");
            await this._updateBilling();
            await this.log("✅ Informasi billing berhasil diatur.");

            await this.log("Memulai proses aktivasi 2FA...");
            const { setupKey, recoveryCodes } = await this._enable2FA();
            await this.log("✅ 2FA berhasil diaktifkan!");
            
            const recoveryCodesText = recoveryCodes.join('\n');
            const recoveryFile = Buffer.from(recoveryCodesText, 'utf-8');
            await this.ctx.replyWithDocument(
                { source: recoveryFile, filename: `github_recovery_codes_${this.username}.txt` },
                { caption: `🔑 *PENTING!* Simpan recovery codes ini. Setup Key 2FA Anda: \`${setupKey}\``, parse_mode: 'Markdown'}
            );

            await this.log("Memulai pendaftaran GitHub Education...");
            await this._applyForEducation();
            await this.log("🚀 Pendaftaran GitHub Education berhasil dikirim!");
            
            return { success: true };

        } catch (error) {
            console.error(`[GH-Auto | ${this.username}] Automasi Gagal:`, error);
            await this.ctx.reply(`❌ Automasi Gagal: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
    
    // --- Metode Internal ---

    async _login() {
        const loginPageRes = await this.session.get('https://github.com/login');
        const loginData = extractAllInputs(loginPageRes.data);
        loginData.login = this.username;
        loginData.password = this.password;
        
        const loginRes = await this.session.post('https://github.com/session', new URLSearchParams(loginData).toString());
        
        if (loginRes.status === 302 && loginRes.headers.location.includes('/sessions/verified-device')) return true;
        if (loginRes.status === 302 && (loginRes.headers.location === 'https://github.com/' || loginRes.headers.location.startsWith('/'))) return false;
        
        // Cek pesan error di body jika ada
        if (loginRes.data && loginRes.data.includes('Incorrect username or password')) {
            throw new Error('Username atau password salah.');
        }
        throw new Error('Gagal login, respons tidak dikenal.');
    }

    async _submitDeviceVerification(otp) {
        const verificationPageRes = await this.session.get('https://github.com/sessions/verified-device');
        const authToken = extractInputValue(verificationPageRes.data, 'authenticity_token');
        if (!authToken) throw new Error('Gagal mendapatkan token verifikasi.');
        
        const otpRes = await this.session.post('https://github.com/sessions/verified-device', new URLSearchParams({ authenticity_token: authToken, otp: otp }).toString());
        
        if (otpRes.status !== 302 || !otpRes.headers.location.includes('github.com')) {
            throw new Error('Kode OTP salah atau sesi tidak valid.');
        }
    }

    async _updateProfile() {
        const profilePageRes = await this.session.get('https://github.com/settings/profile');
        const formHtml = profilePageRes.data;
        const allInputs = extractAllInputs(formHtml, 'form.edit_user');
        
        allInputs['user[profile_name]'] = this.fullName;
        allInputs['_method'] = 'put';

        const updateRes = await this.session.post(`https://github.com/users/${this.username}`, new URLSearchParams(allInputs).toString());
        if (updateRes.status !== 302 || !updateRes.headers.location.includes('/settings/profile')) {
            throw new Error('Gagal update nama profil.');
        }
    }

    async _updateBilling() {
        const billingPageRes = await this.session.get('https://github.com/settings/billing/payment_information');
        const authToken = extractInputValue(billingPageRes.data, 'authenticity_token');

        const payload = new URLSearchParams({
            authenticity_token: authToken,
            'billing_contact[first_name]': this.billingInfo.firstName,
            'billing_contact[last_name]': this.billingInfo.lastName,
            'billing_contact[address1]': this.billingInfo.address1,
            'billing_contact[city]': this.billingInfo.city,
            'billing_contact[country_code]': this.billingInfo.country,
            'billing_contact[region]': this.billingInfo.region,
            'billing_contact[postal_code]': this.billingInfo.postalCode,
            target: 'user',
            user_id: this.username,
            contact_type: 'billing',
            return_to: '/settings/billing/payment_information'
        });

        const updateRes = await this.session.post('https://github.com/account/contact', payload.toString());
        if (updateRes.status !== 302) throw new Error('Gagal update informasi billing.');
    }

    async _enable2FA() {
        await this.session.get('https://github.com/settings/two_factor_authentication/setup/intro');
        const authAppFormRes = await this.session.post('https://github.com/settings/two_factor_authentication/setup/app', '', { headers: { 'Accept': 'application/json' } });
        const setupKey = authAppFormRes.data.mashed_secret;
        if (!setupKey) throw new Error('Tidak bisa menemukan `mashed_secret` untuk 2FA.');
        
        const code = totp.generate(setupKey);
        const verifyToken = extractInputValue(authAppFormRes.data.html_content, 'authenticity_token');
        const verifyRes = await this.session.post('https://github.com/settings/two_factor_authentication/setup/verify', new URLSearchParams({ authenticity_token: verifyToken, otp: code, type: 'app' }).toString(), { headers: { 'Accept': 'application/json' } });
        
        const recoveryCodes = verifyRes.data.formatted_recovery_codes;
        if (!recoveryCodes) throw new Error('Verifikasi OTP berhasil, tetapi gagal mendapatkan recovery codes.');

        const enableToken = extractInputValue(verifyRes.data.html_content, 'authenticity_token');
        await this.session.post('https://github.com/settings/two_factor_authentication/setup/enable', new URLSearchParams({ authenticity_token: enableToken }).toString());

        return { setupKey, recoveryCodes };
    }
    
    async _applyForEducation() {
        const schoolName = "NU University of Surakarta";
        const benefitsPageRes = await this.session.get('https://github.com/settings/education/benefits');
        const step1Token = extractInputValue(benefitsPageRes.data, 'authenticity_token');

        const schoolSearchRes = await this.session.get(`https://github.com/settings/education/developer_pack_applications/schools?q=${encodeURIComponent(schoolName)}`);
        const schoolIdMatch = schoolSearchRes.data.match(/data-selected-school-id="(\d+)"/);
        if (!schoolIdMatch) throw new Error(`Sekolah "${schoolName}" tidak ditemukan.`);
        const schoolId = schoolIdMatch[1];
        
        // PERBAIKAN FATAL: Payload step 1 sekarang lengkap
        const step1Payload = new URLSearchParams({
            'authenticity_token': step1Token,
            'dev_pack_form[application_type]': 'student',
            'dev_pack_form[school_name]': schoolName,
            'dev_pack_form[selected_school_id]': schoolId,
            'dev_pack_form[school_email]': this.email,
            'dev_pack_form[latitude]': '-7.570020342507728',
            'dev_pack_form[longitude]': '110.80568597565748',
            'dev_pack_form[location_shared]': 'true',
            'dev_pack_form[camera_required]': 'false',
            'dev_pack_form[email_domains]': '[]',
            'dev_pack_form[new_school]': 'false',
            'dev_pack_form[override_distance_limit]': 'false',
            'dev_pack_form[two_factor_required]': 'false',
            'dev_pack_form[user_too_far_from_school]': 'false',
            'dev_pack_form[form_variant]': 'initial_form',
            'continue': 'Continue'
        });

        const step1Res = await this.session.post('https://github.com/settings/education/developer_pack_applications', step1Payload.toString(), {
            headers: { 'Turbo-Frame': 'dev-pack-form' }
        });
        
        const step2Token = extractInputValue(step1Res.data, 'authenticity_token');
        
        await this.log("Membuat dokumen bukti KTM...");
        const ktmData = generateSemiAuto({ univName: schoolName, fullName: this.fullName, gender: 'pria' });
        const buffer = await drawKTM(ktmData);
        const proofBase64 = buffer.toString('base64');
        await this.log("✅ Dokumen bukti KTM berhasil dibuat.");

        const photoProofPayload = {
            image: `data:image/jpeg;base64,${proofBase64}`,
            metadata: { filename: "proof.jpg", type: "upload", mimeType: "image/jpeg", deviceLabel: null }
        };

        // PERBAIKAN FATAL: Payload final sekarang membawa SEMUA data dari step 1
        const finalPayload = new URLSearchParams();
        // Salin semua data dari payload pertama, kecuali token dan variant lama
        for (const [key, value] of step1Payload.entries()) {
            if (key !== 'authenticity_token' && key !== 'dev_pack_form[form_variant]' && key !== 'continue') {
                finalPayload.append(key, value);
            }
        }
        
        // Tambahkan data spesifik untuk step 2
        finalPayload.append('authenticity_token', step2Token);
        finalPayload.append('dev_pack_form[proof_type]', '1. Dated school ID - Good');
        finalPayload.append('dev_pack_form[photo_proof]', JSON.stringify(photoProofPayload));
        finalPayload.append('dev_pack_form[form_variant]', 'upload_proof_form');
        finalPayload.append('submit', 'Submit Application');

        const finalRes = await this.session.post('https://github.com/settings/education/developer_pack_applications', finalPayload.toString(), {
            headers: { 'Turbo-Frame': 'dev-pack-form' }
        });

        if (finalRes.status !== 200 || !finalRes.data.includes('Thanks for submitting')) {
            console.log("Response Gagal Apply Edu:", finalRes.data);
            throw new Error('Gagal submit aplikasi GitHub Education. Cek log untuk detail.');
        }
    }
}