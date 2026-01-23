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
        // If serialized cookies are provided, deserialize them. Otherwise, create a new empty cookie jar.
        this.cookieJar = serializedCookies 
            ? CookieJar.deserializeSync(serializedCookies) 
            : new CookieJar();

        // Extend got-scraping with our specific configuration
        this.client = gotScraping.extend({
            cookieJar: this.cookieJar,
            // Options to generate realistic browser headers
            headerGeneratorOptions: {
                browsers: [{ name: 'chrome', minVersion: 120 }],
                devices: ['desktop'],
                locales: ['en-US', 'en'],
                operatingSystems: ['linux', 'windows'],
            },
            // Default headers for all requests
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
            followRedirect: false, // IMPORTANT: We handle redirects manually to inspect headers
            timeout: { request: 30000 },
            retry: { limit: 2 }
        });
    }

    /**
     * Exports the current session cookies to a serializable JSON object.
     * @returns {object} The serialized cookie jar.
     */
    exportCookies() {
        return this.cookieJar.serializeSync();
    }

    /**
     * Performs a GET request.
     * @param {string} url The URL to request.
     * @returns {Promise<object>} The response object from got.
     */
    async get(url) {
        try {
            return await this.client.get(url);
        } catch (error) {
            // If the error is a redirect (3xx), got-scraping throws. We catch it and return the response.
            if (error.response?.statusCode >= 300 && error.response?.statusCode < 400) {
                return error.response;
            }
            throw error; // Re-throw other errors
        }
    }

    /**
     * Performs a POST request with form data.
     * @param {string} url The URL to post to.
     * @param {string|URLSearchParams} formBody The body of the request.
     * @param {object} customHeaders Additional headers to include.
     * @returns {Promise<object>} The response object from got.
     */
    async post(url, formBody, customHeaders = {}) {
        try {
            return await this.client.post(url, {
                body: formBody,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Origin': 'https://github.com', // Common origin for GitHub forms
                    'Referer': 'https://github.com/login', // Common referer
                    ...customHeaders
                }
            });
        } catch (error) {
            // Also catch redirects on POST
            if (error.response?.statusCode >= 300 && error.response?.statusCode < 400) {
                return error.response;
            }
            throw error;
        }
    }
}