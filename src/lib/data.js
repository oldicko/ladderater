/*
 * Ladderater data helpers, shared by the Node build (scripts/build.mjs) and the in-browser web version (src/web.js).
 * Pure functions only: no DOM, no network. Mirrors the validation rules of generate.ps1.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LadderaterData = api;
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

    class DataError extends Error {}

    // RFC 4180 CSV parser: quoted fields, escaped quotes, embedded commas/newlines, CRLF/LF, UTF-8 BOM
    function parseCsv(text) {
        text = String(text || '').replace(/^\uFEFF/, '');
        const rows = [];
        let row = [];
        let field = '';
        let inQuotes = false;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (text[i + 1] === '"') { field += '"'; i++; }
                    else inQuotes = false;
                } else field += ch;
            } else if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                row.push(field); field = '';
            } else if (ch === '\n' || ch === '\r') {
                if (ch === '\r' && text[i + 1] === '\n') i++;
                row.push(field); rows.push(row); row = []; field = '';
            } else field += ch;
        }
        if (inQuotes) throw new DataError('CSV has an unterminated quoted field.');
        if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
        return rows.filter(r => !(r.length === 1 && r[0].trim() === ''));
    }

    // Returns { candidates, warnings }. Candidates use the same shape generate.ps1 produces.
    function candidatesFromCsv(text) {
        const rows = parseCsv(text);
        const warnings = [];
        if (rows.length === 0) return { candidates: [], warnings: ['The CSV contains no candidates.'] };
        const header = rows[0].map(h => h.trim());
        const col = name => header.findIndex(h => h.toLowerCase() === name.toLowerCase());
        for (const required of ['Name', 'Counsellor']) {
            if (col(required) === -1) {
                throw new DataError(`The CSV must have a '${required}' column. Found columns: ${header.join(', ')}`);
            }
        }
        const idx = { name: col('Name'), counsellor: col('Counsellor'), email: col('Email'), comment: col('Comment') };
        const get = (r, i) => (i === -1 || r[i] === undefined ? '' : String(r[i]).trim());
        const seen = new Map();
        const candidates = [];
        rows.slice(1).forEach((r, n) => {
            const rowNumber = n + 2;
            const name = get(r, idx.name);
            if (!name) { warnings.push(`Skipping row ${rowNumber}: missing Name.`); return; }
            const counsellor = get(r, idx.counsellor);
            const email = get(r, idx.email);
            const comment = get(r, idx.comment);
            const key = `${name}|${counsellor}|${email}`.toLowerCase();
            if (seen.has(key)) warnings.push(`Row ${rowNumber} duplicates '${name}' (row ${seen.get(key)}).`);
            else seen.set(key, rowNumber);
            candidates.push({ Name: name, Counsellor: counsellor, Email: email || null, Comment: comment || null, Photo: null });
        });
        if (candidates.length === 0) warnings.push('The CSV contains no candidates.');
        return { candidates, warnings };
    }

    function validateLadder(list, label, minCapacity, warnings) {
        const ids = new Set();
        list.forEach((item, i) => {
            if (!item || typeof item !== 'object') throw new DataError(`${label} #${i + 1} must be an object.`);
            const id = String(item.id === undefined ? '' : item.id);
            if (!ID_PATTERN.test(id)) throw new DataError(`${label} #${i + 1} has an invalid id '${id}'. Use only letters, digits, '-' and '_'.`);
            if (id.startsWith('promotion-')) throw new DataError(`${label} id '${id}' must not start with 'promotion-'.`);
            if (ids.has(id)) throw new DataError(`Duplicate ${label} id '${id}'.`);
            ids.add(id);
            if (!item.name) warnings.push(`${label} '${id}' has no name.`);
            if (item.hasLimit) {
                const d = item.defaultCapacity;
                if (!Number.isInteger(d) || d < minCapacity) {
                    throw new DataError(`${label} '${id}' is limited but 'defaultCapacity' is missing or not a whole number >= ${minCapacity}.`);
                }
                if (item.maxCapacity !== undefined && item.maxCapacity !== null && item.maxCapacity < d) {
                    throw new DataError(`${label} '${id}' has maxCapacity (${item.maxCapacity}) lower than defaultCapacity (${d}).`);
                }
                if (i === list.length - 1) warnings.push(`The last ${label} '${id}' is limited, but overflow has nowhere to go. It will be treated as uncapped.`);
            }
        });
    }

    // Accepts a JSON string or object. Returns { config, warnings } or throws DataError.
    function validateConfig(input) {
        let config = input;
        if (typeof input === 'string') {
            try { config = JSON.parse(input.replace(/^\uFEFF/, '')); }
            catch (e) { throw new DataError(`Config is not valid JSON: ${e.message}`); }
        }
        if (!config || typeof config !== 'object' || Array.isArray(config)) throw new DataError('Config must be a JSON object.');
        const warnings = [];
        if (!Array.isArray(config.bands) || config.bands.length === 0) throw new DataError("Config must define a non-empty 'bands' array.");
        validateLadder(config.bands, 'band', 1, warnings);
        if (config.promotionBuckets !== undefined && config.promotionBuckets !== null) {
            if (!Array.isArray(config.promotionBuckets)) throw new DataError("'promotionBuckets' must be an array.");
            validateLadder(config.promotionBuckets, 'promotion bucket', 0, warnings);
        }
        return { config, warnings };
    }

    // JSON that is safe to embed inside an inline <script> block
    function scriptSafeJson(value) {
        const json = typeof value === 'string' ? value : JSON.stringify(value);
        return json.replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    }

    return { DataError, parseCsv, candidatesFromCsv, validateConfig, scriptSafeJson };
}));
