// helpers.js

import { gotScraping } from 'got-scraping';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';

export class HttpSession {
    constructor(serializedCookies = null) {
        // Jika ada cookie simpanan, load dulu
        this.cookieJar = serializedCookies 
            ? CookieJar.deserializeSync(serializedCookies) 
            : new CookieJar();

        this.client = gotScraping.extend({
            cookieJar: this.cookieJar,
            headerGeneratorOptions: {
                browsers: [{ name: 'chrome', minVersion: 115 }],
                devices: ['desktop'],
                locales: ['en-US', 'en'],
                operatingSystems: ['linux', 'windows'],
            },
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-GB,en;q=0.9',
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

    // Fitur Export Sesi biar bisa disimpan ke JSON
    exportCookies() {
        return this.cookieJar.serializeSync();
    }

    async get(url) {
        try {
            return await this.client.get(url);
        } catch (error) {
            if (error.response && (error.response.statusCode === 302 || error.response.statusCode === 303)) {
                return error.response;
            }
            throw error;
        }
    }

    async post(url, formBody, customHeaders = {}) {
        try {
            return await this.client.post(url, {
                body: formBody,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Origin': 'https://github.com',
                    'Referer': 'https://github.com/login',
                    ...customHeaders
                }
            });
        } catch (error) {
             if (error.response && (error.response.statusCode === 302 || error.response.statusCode === 303)) {
                return error.response;
            }
            throw error;
        }
    }
}

export function extractInputValue(html, name) {
    const $ = cheerio.load(html);
    return $(`input[name="${name}"]`).val();
}

export function extractAllInputs(html, formIndex = 0) {
    const $ = cheerio.load(html);
    // Cari form yang spesifik atau default index 0
    let form;
    if (typeof formIndex === 'string') {
        form = $(formIndex); // Selector CSS (misal: 'form.edit_user')
    } else {
        form = $('form').eq(formIndex);
    }
    
    if (!form.length) return {};

    const inputs = {};
    form.find('input, textarea, select').each((i, el) => {
        const name = $(el).attr('name');
        const value = $(el).val();
        if (name) {
            inputs[name] = value || '';
        }
    });

    return inputs;
}