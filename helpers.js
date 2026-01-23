// helpers.js
import { gotScraping } from 'got-scraping';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';

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
            followRedirect: false, 
            timeout: { request: 30000 },
            retry: { limit: 2 }
        });
    }

    exportCookies() { return this.cookieJar.serializeSync(); }

    async get(url) {
        try { return await this.client.get(url); } 
        catch (error) { if (error.response?.statusCode >= 300 && error.response?.statusCode < 400) return error.response; throw error; }
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
        } catch (error) { if (error.response?.statusCode >= 300 && error.response?.statusCode < 400) return error.response; throw error; }
    }
}

export function extractInputValue(html, name) {
    const $ = cheerio.load(html);
    let val = $(`input[name="${name}"]`).val();
    if(!val) {
        // Fallback meta tag (khusus authenticity_token)
        if(name === 'authenticity_token') val = $('meta[name="csrf-token"]').attr('content');
    }
    return val;
}

export function extractAllInputs(html, formSelector = 0) {
    const $ = cheerio.load(html);
    let form;
    if (typeof formSelector === 'string') form = $(formSelector);
    else form = $('form').eq(formSelector);
    
    if (!form.length) return {};

    const inputs = {};
    form.find('input, textarea, select').each((i, el) => {
        const name = $(el).attr('name');
        const value = $(el).val();
        if (name) inputs[name] = value || '';
    });
    
    // Auto inject token if missing in form but present in meta
    if(!inputs['authenticity_token']) {
        const metaToken = $('meta[name="csrf-token"]').attr('content');
        if(metaToken) inputs['authenticity_token'] = metaToken;
    }

    return inputs;
}