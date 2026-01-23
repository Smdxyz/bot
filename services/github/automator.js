// --- START OF FILE services/github/automator.js ---

import { HttpSession } from '../../lib/network.js';
import { handleLogin } from './steps/1_login.js';
import { handleProfile } from './steps/2_profile.js';
import { handleBilling } from './steps/3_billing.js';
import { handleEduApply } from './steps/4_edu.js';
import { handle2FASetup } from './steps/2fa_setup.js';
import { generatePerson } from '../../lib/randomizer.js';

export class GitHubAutomator {
    constructor(ctx, userConfig = {}, existingSession = null) {
        this.ctx = ctx; // Context Telegram untuk log
        
        if (existingSession) {
            this.session = new HttpSession(existingSession.cookies);
            // === PERBAIKAN DI SINI ===
            // Pastikan this.config selalu menjadi objek, bahkan jika sesi lama tidak memilikinya.
            this.config = existingSession.config || userConfig || {}; 
            this.state = existingSession.state || {};
            console.log("♻️ Session Resumed");
        } else {
            this.session = new HttpSession();
            const person = generatePerson();
            this.config = { ...userConfig, ...person };
            this.state = {}; 
        }
    }

    async log(msg) {
        console.log(`[GH-AUTO] ${msg}`);
    }

    exportData() {
        return JSON.stringify({
            cookies: this.session.exportCookies(),
            config: this.config,
            state: this.state
        });
    }

    async runStep1_Login(otpCallback) {
        await this.log("🚀 Memulai Step 1: Login...");
        await handleLogin(this.session, this.config, otpCallback, this.log.bind(this));
        this.state.step1 = true;
        await this.log("✅ Step 1: Login Selesai.");
    }

    async runStep2_Profile() {
        await this.log("👤 Memulai Step 2: Setup Profile...");
        await handleProfile(this.session, this.config, this.log.bind(this));
        this.state.step2 = true;
        await this.log("✅ Step 2: Profile Selesai.");
    }

    async runStep2_5_2FASetup() {
        await this.log("🔐 Memulai Step 2.5: Setup 2FA...");
        const result = await handle2FASetup(this.session, this.config, this.log.bind(this));
        this.state.step2_5 = true;
        await this.log("✅ Step 2.5: 2FA Setup Selesai.");
        return result;
    }

    async runStep3_Billing() {
        await this.log("💳 Memulai Step 3: Billing Info...");
        await handleBilling(this.session, this.config, this.log.bind(this));
        this.state.step3 = true;
        await this.log("✅ Step 3: Billing Selesai.");
    }

    async runStep4_Education() {
        await this.log("🎓 Memulai Step 4: Apply Student Pack...");
        await handleEduApply(this.session, this.config, this.log.bind(this));
        this.state.step4 = true;
        await this.log("✅ Step 4: Aplikasi Student Pack Selesai.");
    }
}
// --- END OF FILE services/github/automator.js ---