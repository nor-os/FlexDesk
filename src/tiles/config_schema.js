/**
 * config_schema.js
 *
 * Configuration schema definitions for widget types.
 * Defines field types, validation rules, and default values.
 */

/**
 * Field type definitions for widget configuration.
 */
export const FieldTypes = {
    TEXT: 'text',
    NUMBER: 'number',
    CHECKBOX: 'checkbox',
    SELECT: 'select',
    MULTISELECT: 'multiselect',
    COLOR: 'color',
    RANGE: 'range'
};

/**
 * Validate a configuration value against its field schema.
 * @param {any} value - Value to validate
 * @param {Object} field - Field schema
 * @returns {{valid: boolean, error?: string}} Validation result
 */
export function validateField(value, field) {
    // Check required
    if (field.required && (value == null || value === '')) {
        return { valid: false, error: `${field.label} is required` };
    }

    // Type-specific validation
    switch (field.type) {
        case FieldTypes.NUMBER:
        case FieldTypes.RANGE:
            if (value != null && value !== '') {
                const num = parseFloat(value);
                if (isNaN(num)) {
                    return { valid: false, error: `${field.label} must be a number` };
                }
                if (field.min != null && num < field.min) {
                    return { valid: false, error: `${field.label} must be at least ${field.min}` };
                }
                if (field.max != null && num > field.max) {
                    return { valid: false, error: `${field.label} must be at most ${field.max}` };
                }
            }
            break;

        case FieldTypes.SELECT:
            if (field.required && !value) {
                return { valid: false, error: `${field.label} must be selected` };
            }
            break;

        case FieldTypes.MULTISELECT:
            if (field.required && (!Array.isArray(value) || value.length === 0)) {
                return { valid: false, error: `${field.label} must have at least one selection` };
            }
            break;
    }

    return { valid: true };
}

/**
 * Validate an entire configuration object against a schema.
 * @param {Object} config - Configuration object
 * @param {Object} schema - Schema with fields array
 * @returns {{valid: boolean, errors: Object}} Validation result
 */
export function validateConfig(config, schema) {
    const errors = {};
    let valid = true;

    if (!schema?.fields) {
        return { valid: true, errors: {} };
    }

    schema.fields.forEach(field => {
        const result = validateField(config[field.key], field);
        if (!result.valid) {
            errors[field.key] = result.error;
            valid = false;
        }
    });

    return { valid, errors };
}

/**
 * Merge user config with defaults from schema.
 * @param {Object} config - User configuration
 * @param {Object} schema - Schema with fields array
 * @returns {Object} Merged configuration
 */
export function mergeWithDefaults(config, schema) {
    const result = { ...config };

    if (schema?.fields) {
        schema.fields.forEach(field => {
            if (result[field.key] === undefined && field.default !== undefined) {
                result[field.key] = field.default;
            }
        });
    }

    return result;
}

/**
 * Get options for a select/multiselect field.
 * Handles dynamic options (e.g., 'variables' which gets populated from data).
 * @param {Object} field - Field schema
 * @param {Object} data - Current data context
 * @returns {Array<{value: string, label: string}>} Options array
 */
export function getFieldOptions(field, data) {
    if (Array.isArray(field.options)) {
        return field.options;
    }

    // Dynamic options based on string identifier
    if (field.options === 'variables') {
        return getVariableOptions(data);
    }

    if (field.options === 'namespaces') {
        return getNamespaceOptions(data);
    }

    return [];
}

/**
 * Format a raw analytics variable key into a user-friendly display label.
 * Strips namespace prefixes, internal Godley patterns, and stock type suffixes.
 *
 * Examples:
 *   "Agriculture.__SimpleStocks__::arable_land[State]" → "arable_land"
 *   "Population.population"                             → "population"
 *   "Banks::Assets[Cash]"                              → "Assets / Cash"
 *   "my_variable"                                      → "my_variable"
 *
 * @param {string} name - Raw variable key from analytics
 * @returns {string} Friendly display label
 */
export function formatVariableLabel(name) {
    if (!name) return '';
    let label = name;

    // Strip namespace prefix: "Namespace.rest" → "rest"
    const dotIdx = label.indexOf('.');
    if (dotIdx > 0) {
        label = label.slice(dotIdx + 1);
    }

    // Strip __SimpleStocks__:: or similar double-underscore sector prefixes
    label = label.replace(/^__\w+__::/, '');

    // Handle Godley stock pattern: "Sector::AccountType[Account]" → "AccountType / Account"
    // But first strip [State] / [Rate] suffixes that are internal
    label = label.replace(/\[State\]$/i, '');
    label = label.replace(/\[Rate\]$/i, '');

    // Clean up trailing empty brackets or colons from stripping
    label = label.replace(/\[\]$/, '');

    // Replace :: with readable separator
    label = label.replace(/::/g, ' / ');

    // Replace single colons used as separators with underscore
    label = label.replace(/:/g, '_');

    // Clean up any double spaces or leading/trailing whitespace
    return label.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Get variable options from data.
 * @param {Object} data - Analytics data
 * @returns {Array<{value: string, label: string, category?: string}>} Variable options
 */
export function getVariableOptions(data) {
    const options = [];

    if (!data) return options;

    // Add stocks
    if (data.stocks) {
        Object.keys(data.stocks).forEach(name => {
            options.push({
                value: name,
                label: formatVariableLabel(name),
                category: 'Stocks'
            });
        });
    }

    // Add flows
    if (data.flows) {
        Object.keys(data.flows).forEach(name => {
            options.push({
                value: name,
                label: formatVariableLabel(name),
                category: 'Flows'
            });
        });
    }

    // Add indicators
    if (data.indicators) {
        Object.keys(data.indicators).forEach(name => {
            options.push({
                value: name,
                label: formatVariableLabel(name),
                category: 'Indicators'
            });
        });
    }

    return options;
}

/**
 * Extract unique namespace names from variable keys in data.
 * Stock keys follow the pattern "Namespace.Sector::Type[Account]".
 * @param {Object} data - Analytics data
 * @returns {Array<{value: string, label: string}>}
 */
export function getNamespaceOptions(data) {
    const namespaces = new Set();
    const sources = [data?.stocks, data?.flows, data?.indicators];
    for (const source of sources) {
        if (!source) continue;
        for (const key of Object.keys(source)) {
            const dotIdx = key.indexOf('.');
            if (dotIdx > 0) {
                namespaces.add(key.slice(0, dotIdx));
            }
        }
    }
    if (namespaces.size === 0) namespaces.add('Main');
    return Array.from(namespaces).sort().map(ns => ({ value: ns, label: ns }));
}

export default {
    FieldTypes,
    validateField,
    validateConfig,
    mergeWithDefaults,
    getFieldOptions,
    getVariableOptions,
    formatVariableLabel
};
