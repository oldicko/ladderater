'use strict';
// Loads src/app.js into an isolated VM context with a minimal browser stub, so its pure state logic can be tested.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP_JS = fs.readFileSync(path.join(__dirname, '../../src/app.js'), 'utf8');

function loadApp(config, candidates) {
    const store = new Map();
    const context = {
        console: { log() {}, warn() {}, error() {} },
        window: {
            addEventListener() {},
            localStorage: {
                getItem: k => (store.has(k) ? store.get(k) : null),
                setItem: (k, v) => store.set(k, String(v)),
                removeItem: k => store.delete(k)
            }
        },
        document: {},
        INPUT_CONFIG: config,
        INPUT_CANDIDATES: candidates
    };
    vm.createContext(context);
    vm.runInContext('const CONFIG = INPUT_CONFIG; const INITIAL_CANDIDATES = INPUT_CANDIDATES;', context);
    vm.runInContext(APP_JS, context);
    // Same set-up as init(), without touching the DOM
    vm.runInContext(`
        bands = normaliseLadder(CONFIG.bands, 'band', 1, { color: '#64748b', colorLight: '#f8fafc', colorBorder: '#94a3b8' });
        promoBuckets = normaliseLadder(getPromotionBuckets(), 'promotion bucket', 0, null);
        if (promoBuckets.length === 0) promoBuckets = normaliseLadder(getDefaultPromotionBuckets(), 'promotion bucket', 0, null);
        allCandidates = INITIAL_CANDIDATES.map((c, index) => ({ id: 'cand-' + index, name: c.Name, counsellor: c.Counsellor, email: null, photo: null, comment: null }));
        candidateById = new Map(allCandidates.map(c => [c.id, c]));
        boardHash = computeBoardHash(allCandidates, CONFIG);
        storageKey = STORAGE_KEY_PREFIX + boardHash;
        state = createDefaultState();
        renderApp = () => {}; renderAll = () => {};
    `, context);
    // JSON round trip so results are plain arrays/objects of this realm (deepStrictEqual checks prototypes)
    const run = code => {
        const out = vm.runInContext(`JSON.stringify((() => { return (${code}); })() ?? null)`, context);
        return JSON.parse(out);
    };
    return {
        run,
        names: list => run(`(${JSON.stringify(list)}).split('.').reduce((o, k) => o[k], state)`).map(c => c.name),
        place: (name, bandId, index = -1) => run(`moveCandidate(allCandidates.find(c => c.name === ${JSON.stringify(name)}).id, ${JSON.stringify(bandId)}, ${index})`),
        star: name => run(`toggleStar(allCandidates.find(c => c.name === ${JSON.stringify(name)}).id, null)`)
    };
}

const BANDS = [
    { id: 'top', name: 'Top', hasLimit: true, defaultCapacity: 2, maxCapacity: 5 },
    { id: 'strong', name: 'Strong', hasLimit: true, defaultCapacity: 2, maxCapacity: 5 },
    { id: 'core', name: 'Core', hasLimit: false },
    { id: 'needs', name: 'Needs', hasLimit: false }
];

function people(n) {
    return Array.from({ length: n }, (_, i) => ({ Name: `Person ${String.fromCharCode(65 + i)}`, Counsellor: `C${i % 2}` }));
}

module.exports = { loadApp, BANDS, people };
