// helpers.js

import axios from 'axios';

/**
 * Class untuk mengelola sesi HTTP, termasuk cookies dan header default.
 * Ini adalah jantung dari script "susah modar" kita.
 */
export class HttpSession {
    constructor(userAgent) {
        this.cookieJar = {};
        this.userAgent = userAgent || 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';
        this.axiosInstance = axios.create({
            headers: {
                'User-Agent': this.userAgent,
                // Header umum yang sering ditemukan di browser modern
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'same-origin',
                'Upgrade-Insecure-Requests': '1',
            },
            // Penting: Jangan biarkan axios melempar error pada status 3xx (redirect)
            // agar kita bisa menangani redirect secara manual.
            validateStatus: function (status) {
                // Terima semua status code agar kita bisa menganalisa response-nya
                return status >= 200 && status < 500;
            },
            // Jangan ikuti redirect secara otomatis
            maxRedirects: 0,
        });
    }

    /**
     * Mengurai dan menyimpan cookies dari header 'set-cookie'.
     * @param {Array<string>} setCookieHeader Header dari response axios.
     */
    _updateCookies(setCookieHeader) {
        if (!setCookieHeader) return;
        setCookieHeader.forEach(cookieString => {
            const [cookiePair] = cookieString.split(';');
            const [key, value] = cookiePair.split('=');
            if (key && value) {
                this.cookieJar[key.trim()] = value.trim();
            }
        });
    }

    /**
     * Mengubah cookie jar menjadi string untuk header request.
     * @returns {string} String cookie.
     */
    _getCookieString() {
        return Object.entries(this.cookieJar)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ');
    }

    /**
     * Wrapper untuk request GET.
     */
    async get(url, config = {}) {
        const headers = {
            ...config.headers,
            'Cookie': this._getCookieString(),
        };
        const response = await this.axiosInstance.get(url, { ...config, headers });
        this._updateCookies(response.headers['set-cookie']);
        return response;
    }

    /**
     * Wrapper untuk request POST.
     */
    async post(url, data, config = {}) {
        const headers = {
            ...config.headers,
            'Cookie': this._getCookieString(),
            'Content-Type': 'application/x-www-form-urlencoded',
        };
        const response = await this.axiosInstance.post(url, data, { ...config, headers });
        this._updateCookies(response.headers['set-cookie']);
        return response;
    }
}

/**
 * Mengekstrak nilai dari tag input hidden dalam HTML. Dibuat lebih tangguh.
 * @param {string} html Konten HTML.
 * @param {string} name Nama input yang dicari.
 * @returns {string|null} Nilai dari input.
 */
export function extractInputValue(html, name) {
    const regex = new RegExp(`name=["']${name}["'][^>]*value=["']([^"']*)["']`);
    const match = html.match(regex);
    return match ? match[1] : null;
}

/**
 * Mengekstrak semua input dari sebuah form menjadi objek.
 * @param {string} html Konten HTML.
 * @param {string} formSelector Selector CSS untuk form (contoh: 'form#edit_user_123').
 * @returns {Object} Objek berisi nama dan nilai input.
 */
export function extractAllInputs(html, formSelector = 'form') {
    let formHtml = html;
    // Jika selector diberikan, coba cari blok form-nya dulu
    if (formSelector !== 'form') {
        const selectorRegex = new RegExp(`<form[^>]*id=["']${formSelector.split('#')[1]}["'][^>]*>([\\s\\S]*?)</form>`);
        const formHtmlMatch = html.match(selectorRegex);
        if (formHtmlMatch) {
            formHtml = formHtmlMatch[1];
        }
    }
    
    const inputs = {};
    // Regex ini mencari tag <input> dan <textarea>
    const regex = /<(?:input|textarea)[^>]*name=["']([^"']+)["'][^>]*?(?:value=["']([^"']*)["'])?/g;
    let match;

    while ((match = regex.exec(formHtml)) !== null) {
        // match[1] is the name, match[2] is the value (bisa undefined)
        inputs[match[1]] = match[2] || '';
    }
    
    // Khusus untuk authenticity_token yang kadang ada di meta tag
    if (!inputs.authenticity_token) {
        const tokenFromMeta = html.match(/<meta name="csrf-token" content="([^"]+)"/);
        if (tokenFromMeta) {
            inputs.authenticity_token = tokenFromMeta[1];
        }
    }

    return inputs;
}