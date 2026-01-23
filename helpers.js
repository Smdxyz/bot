// helpers.js

import { gotScraping } from 'got-scraping';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';

/**
 * Class Session "Anti-Deteksi" menggunakan got-scraping.
 * Menangani cookie secara otomatis dan meniru TLS fingerprint browser.
 */
export class HttpSession {
    constructor() {
        this.cookieJar = new CookieJar();
        // Setup instance got-scraping dengan konfigurasi browser asli
        this.client = gotScraping.extend({
            cookieJar: this.cookieJar,
            headerGeneratorOptions: {
                browsers: [{ name: 'chrome', minVersion: 110 }],
                devices: ['desktop'],
                locales: ['en-US', 'en'],
                operatingSystems: ['linux', 'windows'], // Variasi OS agar lebih natural
            },
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-GB,en;q=0.9', // Sesuai request curl Anda
                'Cache-Control': 'max-age=0',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'same-origin',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1'
            },
            // Matikan auto-redirect untuk menangkap 302 (Device Verification)
            followRedirect: false, 
            timeout: { request: 30000 },
            retry: { limit: 2 }
        });
    }

    async get(url) {
        try {
            return await this.client.get(url);
        } catch (error) {
            // Handle redirect manual jika followRedirect: false
            if (error.response && (error.response.statusCode === 302 || error.response.statusCode === 303)) {
                return error.response;
            }
            throw error;
        }
    }

    async post(url, formBody) {
        try {
            return await this.client.post(url, {
                body: formBody, // Mengirim body sebagai string (URL Encoded)
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Origin': 'https://github.com',
                    'Referer': 'https://github.com/login' // Default referer, nanti bisa ditimpa
                }
            });
        } catch (error) {
             if (error.response && (error.response.statusCode === 302 || error.response.statusCode === 303)) {
                return error.response;
            }
            throw error;
        }
    }
    
    // Khusus untuk upload file (multipart) atau JSON jika perlu
    async postJson(url, jsonData) {
        return await this.client.post(url, {
            json: jsonData,
            responseType: 'json'
        });
    }
}

/**
 * Mengekstrak NILAI dari input hidden secara spesifik.
 */
export function extractInputValue(html, name) {
    const $ = cheerio.load(html);
    return $(`input[name="${name}"]`).val();
}

/**
 * Mengekstrak SEMUA input dari sebuah form.
 * Ini memastikan tidak ada hidden field yang tertinggal (timestamp, secret, dll).
 */
export function extractAllInputs(html, formIndex = 0) {
    const $ = cheerio.load(html);
    const form = $('form').eq(formIndex);
    
    if (!form.length) return {};

    const inputs = {};
    
    // Ambil semua <input>
    form.find('input').each((i, el) => {
        const name = $(el).attr('name');
        const value = $(el).val();
        if (name) {
            // Abaikan button submit generic jika tidak diklik, 
            // tapi simpan hidden fields dan text inputs
            inputs[name] = value || '';
        }
    });

    return inputs;
}

/**
 * Helper untuk mencari URL action dari form
 */
export function extractFormAction(html, formIndex = 0) {
    const $ = cheerio.load(html);
    const form = $('form').eq(formIndex);
    return form.attr('action');
}