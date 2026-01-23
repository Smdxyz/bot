// --- START OF FILE services/github/steps/3_billing.js ---

import { extractAllInputs } from '../../../lib/utils.js';
import { generateIndoAddress } from '../../../lib/randomizer.js';
import * as cheerio from 'cheerio';

/**
 * Handles setting the user's billing information on their GitHub account.
 * @param {import('../../../lib/network.js').HttpSession} session The current HTTP session.
 * @param {object} config User configuration including { username, fullName }.
 * @param {function(string): void} logger Function to log progress.
 */
export const handleBilling = async (session, config, logger) => {
    const billingUrl = 'https://github.com/settings/billing/payment_information';
    const postUrl = 'https://github.com/account/contact';

    // 1. GET the billing page to get the authenticity token.
    logger('Mengambil halaman informasi penagihan...');
    const getBillingRes = await session.get(billingUrl);
    if (getBillingRes.statusCode !== 200) {
        throw new Error(`Gagal membuka halaman penagihan. Status: ${getBillingRes.statusCode}`);
    }
    logger('Halaman penagihan berhasil dimuat.');

    // 2. Extract form data. The form might be hidden initially.
    const formSelector = `form[action="/account/contact"]`;
    const billingPayload = extractAllInputs(getBillingRes.body, formSelector);
    if (!billingPayload.authenticity_token) {
        throw new Error('Gagal mengekstrak authenticity_token dari form penagihan.');
    }

    // 3. Generate random address and split the full name.
    const address = generateIndoAddress();
    const nameParts = config.fullName.split(' ');
    const firstName = nameParts.shift() || 'User';
    const lastName = nameParts.join(' ') || 'Name';

    // 4. Populate the payload with consistent and generated data.
    billingPayload['billing_contact[first_name]'] = firstName;
    billingPayload['billing_contact[last_name]'] = lastName;
    billingPayload['billing_contact[address1]'] = address.address1;
    billingPayload['billing_contact[city]'] = address.city;
    billingPayload['billing_contact[country_code]'] = address.countryCode;
    billingPayload['billing_contact[region]'] = address.region;
    billingPayload['billing_contact[postal_code]'] = address.postalCode;
    
    // These fields are necessary based on the cURL
    billingPayload['form_loaded_from'] = 'BILLING_SETTINGS';
    billingPayload['target'] = 'user';
    billingPayload['user_id'] = config.username;
    billingPayload['contact_type'] = 'billing';
    billingPayload['return_to'] = '/settings/billing/payment_information';
    billingPayload['submit'] = 'Save billing information';

    logger(`Menyiapkan untuk menyimpan info penagihan untuk ${firstName} ${lastName} di ${address.city}...`);

    // 5. POST the new billing information.
    const postBillingRes = await session.post(postUrl, new URLSearchParams(billingPayload).toString(), {
        'Referer': billingUrl,
        'Turbo-Frame': 'settings-frame'
    });

    if (postBillingRes.statusCode !== 302 || !postBillingRes.headers.location?.endsWith('/settings/billing/payment_information')) {
         throw new Error(`Pembaruan info penagihan gagal. Status: ${postBillingRes.statusCode}`);
    }
    logger('Informasi penagihan berhasil dikirim, memverifikasi...');

    // 6. Final verification by re-fetching the page and checking the content.
    const verifyRes = await session.get(billingUrl);
    const $ = cheerio.load(verifyRes.body);
    const summaryText = $('.js-billing-information-summary').text();
    
    if (summaryText.includes(firstName) && summaryText.includes(lastName) && summaryText.includes(address.city)) {
        logger('✅ Verifikasi berhasil. Informasi penagihan telah diperbarui.');
    } else {
        throw new Error('Verifikasi gagal. Informasi penagihan yang baru tidak ditemukan di halaman.');
    }
};
// --- END OF FILE services/github/steps/3_billing.js ---