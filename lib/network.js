// --- START OF FILE lib/network.js ---

import { gotScraping } from 'got-scraping';
import { CookieJar } from 'tough-cookie';

export class HttpSession {
    constructor(serializedCookies = null) {
        this.cookieJar = serializedCookies 
            ? CookieJar.deserializeSync(serializedCookies) 
            : new CookieJar();

        this.client = gotScraping.extend({
            cookieJar: this.cookieJar,
            headerGeneratorOptions: {
                browsers: [{ name: 'chrome', minVersion: 120 }],
                devices: ['desktop'],
                locales: ['en-US', 'en'],
                operatingSystems: ['linux', 'windows'],
            },
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'max-age=0',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'same-origin',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1'
            },
            // === PERBAIKAN UTAMA: AKTIFKAN FOLLOW REDIRECT ===
            followRedirect: true, // Diubah dari false
            timeout: { request: 30000 },
            retry: { limit: 2 }
        });
    }

    exportCookies() {
        return this.cookieJar.serializeSync();
    }

    async get(url, customHeaders = {}) {
        // Karena followRedirect: true, tidak perlu lagi menangani error.response secara manual
        return await this.client.get(url, { headers: customHeaders });
    }

    async post(url, formBody, customHeaders = {}) {
        const origin = new URL(url).origin;
        // Karena followRedirect: true, tidak perlu lagi menangani error.response secara manual
        return await this.client.post(url, {
            body: formBody,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Origin': origin,
                'Referer': `${origin}/`,
                ...customHeaders
            }
        });
    }
}
// --- END OF FILE lib/network.js ---