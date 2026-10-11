#!/usr/bin/env node
/*
 * Ladderater build (Node port of generate.ps1, no dependencies).
 *
 *   node scripts/build.mjs                 -> ladderater.html (standalone, data from candidates.csv + config.json)
 *                                             and dist/index.html (public web app, data loaded in the browser)
 *   node scripts/build.mjs --standalone    -> only ladderater.html
 *   node scripts/build.mjs --web           -> only dist/index.html
 *   Options: --candidates <path> --config <path> --output <path> --dist <dir>
 *
 * The Entra ID photo download from generate.ps1 is intentionally not ported; use generate.ps1 -Token for that.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = require(path.join(root, 'src/lib/data.js'));

const PLACEHOLDER_LINE = 'const INITIAL_CANDIDATES = {{CANDIDATES_JSON}};\n        const CONFIG = {{CONFIG_JSON}};';

function arg(name, fallback) {
    const i = process.argv.indexOf(name);
    return i !== -1 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : fallback;
}
const read = p => fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
function fail(msg) {
    console.error(`ERROR: ${msg}`);
    process.exit(1);
}

const src = path.join(root, 'src');
const paths = {
    candidates: arg('--candidates', path.join(root, 'candidates.csv')),
    config: arg('--config', path.join(root, 'config.json')),
    output: arg('--output', path.join(root, 'ladderater.html')),
    dist: arg('--dist', path.join(root, 'dist'))
};
const onlyStandalone = process.argv.includes('--standalone');
const onlyWeb = process.argv.includes('--web');

// Template with styles and app code inlined; data placeholders left in place
export function assembleTemplate() {
    let html = read(path.join(src, 'index.html')).replace(/\r\n/g, '\n');
    html = html.replace('{{STYLES}}', () => read(path.join(src, 'styles.css')))
        .replace('{{APP_JS}}', () => read(path.join(src, 'app.js')));
    if (!html.includes(PLACEHOLDER_LINE)) fail('src/index.html is missing the INITIAL_CANDIDATES / CONFIG placeholders.');
    return html;
}

function loadInputs() {
    if (!fs.existsSync(paths.candidates)) fail(`Candidates file not found: ${paths.candidates}`);
    if (!fs.existsSync(paths.config)) fail(`Config file not found: ${paths.config}`);
    try {
        const { candidates, warnings } = D.candidatesFromCsv(read(paths.candidates));
        const configText = read(paths.config).trim();
        const { warnings: cw } = D.validateConfig(configText);
        [...warnings, ...cw].forEach(w => console.warn(`  Warning: ${w}`));
        console.log(`Loaded ${candidates.length} candidates and validated config.`);
        return { candidates, configText };
    } catch (e) {
        if (e instanceof D.DataError) fail(e.message);
        throw e;
    }
}

function write(p, content) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, 'utf8');
    console.log(`Wrote ${path.relative(root, p)} (${(Buffer.byteLength(content) / 1024).toFixed(0)} KB)`);
}

const template = assembleTemplate();
// Standalone files keep the template comments for the web hooks harmlessly; strip them for tidiness
const standaloneTemplate = template.replace(/\n?\s*<!-- web:(startup|script) -->/g, '');

if (!onlyWeb) {
    const { candidates, configText } = loadInputs();
    const dataBlock = `const INITIAL_CANDIDATES = ${D.scriptSafeJson(candidates)};\n        const CONFIG = ${D.scriptSafeJson(configText)};`;
    write(paths.output, standaloneTemplate.replace(PLACEHOLDER_LINE, () => dataBlock));
}

if (!onlyStandalone) {
    const sampleCsv = read(path.join(root, 'candidates.csv'));
    const sampleConfig = read(path.join(root, 'config.json')).trim();
    const offlineTemplate = standaloneTemplate.replace(PLACEHOLDER_LINE,
        'const INITIAL_CANDIDATES = {{CANDIDATES_JSON}};\n        const CONFIG = {{CONFIG_JSON}};');
    const dataBlock = [
        'window.LADDERATER_DEFER_INIT = true;',
        '        let INITIAL_CANDIDATES = null;',
        '        let CONFIG = null;',
        `        const SAMPLE_CSV = ${D.scriptSafeJson(JSON.stringify(sampleCsv))};`,
        `        const SAMPLE_CONFIG = ${D.scriptSafeJson(JSON.stringify(sampleConfig))};`,
        `        const STANDALONE_TEMPLATE = ${D.scriptSafeJson(JSON.stringify(offlineTemplate))};`
    ].join('\n');
    const web = template
        .replace(PLACEHOLDER_LINE, () => dataBlock)
        .replace('<!-- web:startup -->', () => read(path.join(src, 'web-startup.html')).trimEnd())
        .replace('<!-- web:script -->', () =>
            `<script>\n${read(path.join(src, 'lib/data.js'))}\n    </script>\n    <script>\n${read(path.join(src, 'web.js'))}\n    </script>`);
    write(path.join(paths.dist, 'index.html'), web);
    write(path.join(paths.dist, '.nojekyll'), '');
}
