// --- START OF FILE lib/network.js ---

import { gotScraping } from 'got-scraping';
import { CookieJar } from 'tough-cookie';

/**
 * HttpSession Class
 * Manages HTTP requests, cookies, and browser-like headers for scraping.
 * Uses got-scraping for robust, browser-like requests.
 */
export class HttpSession {
    /**
     * @param {object|null} serializedCookies Optional serialized cookies from a previous session to restore.
     */
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
            // === PENYEMPURNAAN HEADER ===
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
            followRedirect: false,
            timeout: { request: 30000 },
            retry: { limit: 2 }
        });
    }

    exportCookies() {
        return this.cookieJar.serializeSync();
    }

    async get(url, customHeaders = {}) {
        try {
            return await this.client.get(url, { headers: customHeaders });
        } catch (error) {
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
                    'Referer': `${origin}/`, // Default, akan ditimpa jika ada di customHeaders
                    ...customHeaders
                }
            });
        } catch (error) {
            if (error.response?.statusCode >= 300 && error.response?.statusCode < 400) {
                return error.response;
            }
            throw error;
        }
    }
}
// --- END OF FILE lib/network.js ---