// --- START OF FILE lib/network.js ---

import { gotScraping } from 'got-scraping';
import { CookieJar } from 'tough-cookie';

export class HttpSession {
    constructor(serializedCookies = null) {
        this.cookieJar = serializedCookies 
            ? CookieJar.deserializeSync(serializedCookies) 
            : new CookieJar();

        // Kita gunakan konfigurasi yang meniru browser Desktop secara konsisten
        // agar GitHub tidak mengirimkan versi Mobile yang merusak parser.
        this.client = gotScraping.extend({
            cookieJar: this.cookieJar,
            headerGeneratorOptions: {
                browsers: [{ name: 'chrome', minVersion: 120 }],
                devices: ['desktop'], // WAJIB DESKTOP agar parser cheerio bekerja
                locales: ['en-US', 'en'],
                operatingSystems: ['windows'], // Konsisten di Windows agar fingerprint stabil
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
            followRedirect: false, // Kita handle manual sesuai temuan Anda
            http2: true, // GitHub support HTTP2, ini lebih cepat dan less-suspicious
            timeout: { request: 30000 }, // Timeout 30 detik agar tidak stuck selamanya
            retry: { limit: 1 }
        });
    }

    exportCookies() {
        return this.cookieJar.serializeSync();
    }

    async get(url, customHeaders = {}) {
        try {
            return await this.client.get(url, { headers: customHeaders });
        } catch (error) {
            // Return response jika itu adalah redirect (3xx), jangan throw error
            if (error.response?.statusCode >= 300 && error.response?.statusCode < 400) {
                return error.response;
            }
            throw error;
        }
    }

    async post(url, formBody, customHeaders = {}) {
        try {
            const origin = new URL(url).origin;
            return await this.client.post(url, {
                body: formBody,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Origin': origin,
                    'Referer': `${origin}/login`, // Default referer yang aman
                    ...customHeaders
                }
            });
        } catch (error) {
            // Return response jika itu adalah redirect (3xx), jangan throw error
            if (error.response?.statusCode >= 300 && error.response?.statusCode < 400) {
                return error.response;
            }
            throw error;
        }
    }
}
// --- END OF FILE lib/network.js ---