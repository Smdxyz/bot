// --- START OF FILE lib/utils.js ---

import * as cheerio from 'cheerio';

/**
 * Extracts the value of a single input field from an HTML string.
 * Includes a fallback for the authenticity_token from a meta tag.
 * @param {string} html The HTML content to parse.
 * @param {string} name The 'name' attribute of the input to find.
 * @returns {string|undefined} The value of the input field, or undefined if not found.
 */
export function extractInputValue(html, name) {
    const $ = cheerio.load(html);
    let val = $(`input[name="${name}"]`).attr('value'); // Use .attr('value') for reliability
    
    // Fallback specific for authenticity_token which is often in a meta tag
    if (!val && name === 'authenticity_token') {
        val = $('meta[name="csrf-token"]').attr('content');
    }
    
    return val;
}

/**
 * Extracts all input, textarea, and select fields from a form in an HTML string.
 * This is a more robust version that correctly extracts values from hidden inputs.
 * @param {string} html The HTML content to parse.
 * @param {number|string} formSelector The CSS selector of the form (e.g., '#login_form') or its index (e.g., 0).
 * @returns {object} An object where keys are input names and values are their corresponding values.
 */
export function extractAllInputs(html, formSelector = 0) {
    const $ = cheerio.load(html);
    let form;

    // Determine how to select the form
    if (typeof formSelector === 'string') {
        form = $(formSelector);
    } else {
        form = $('form').eq(formSelector);
    }
    
    if (!form.length) {
        console.warn(`[Parser] Form with selector "${formSelector}" not found.`);
        return {};
    }

    const inputs = {};
    // Find all relevant form elements
    form.find('input, textarea, select').each((i, el) => {
        const element = $(el);
        const name = element.attr('name');
        const type = element.attr('type');
        let value;

        // Skip buttons/submits that don't have a value attribute
        if ((type === 'submit' || type === 'button') && !element.attr('value')) {
            return;
        }

        // Handle checkboxes and radio buttons
        if (type === 'checkbox' || type === 'radio') {
            if (element.is(':checked')) {
                value = element.val() || 'on';
            } else {
                return; // Don't include unchecked boxes
            }
        } else {
            // Use .val() for user-interactive fields, but fallback to .attr('value')
            value = element.val();
            if (value === undefined || value === null) {
                value = element.attr('value');
            }
        }
        
        if (name) {
            inputs[name] = value || ''; // Default to empty string
        }
    });
    
    // Auto-inject authenticity_token if it was missed in the form but exists on the page
    if (!inputs['authenticity_token']) {
        const metaToken = $('meta[name="csrf-token"]').attr('content');
        if (metaToken) {
            inputs['authenticity_token'] = metaToken;
        }
    }

    return inputs;
}
// --- END OF FILE lib/utils.js ---