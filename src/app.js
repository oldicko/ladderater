'use strict';
/*
 * Ladderater application logic.
 *
 * INITIAL_CANDIDATES and CONFIG are injected by generate.ps1 in a <script> block that runs before this file.
 * Candidate objects are immutable records shared by reference between the state lists; only candidate ids are
 * persisted to localStorage (see serialiseState) so that large embedded profile photos never hit the storage quota.
 */

const STATE_VERSION = 2;
const STORAGE_KEY_PREFIX = 'ladderater_state:';
const LEGACY_STORAGE_KEY = 'ladderater_state';
const SIDEBAR_STORAGE_KEY = 'ladderater_sidebar_collapsed';
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const SAFE_CSS_VALUE_PATTERN = /^[#A-Za-z0-9(),.%\s-]+$/;
const DEFAULT_MAX_CAPACITY = 20;

let allCandidates = [];
let candidateById = new Map();
let bands = [];          // Normalised copy of CONFIG.bands
let promoBuckets = [];   // Normalised promotion buckets
let state = {};
let draggedCandidateId = null;
let currentView = 'performance';
let boardHash = '';
let storageKey = '';
let storageWarningShown = false;
let exportFeedbackTimer = null;
let exportButtonOriginalHtml = null;

// ---------------------------------------------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------------------------------------------

function getPromotionBuckets() {
    if (CONFIG.promotionBuckets && Array.isArray(CONFIG.promotionBuckets) && CONFIG.promotionBuckets.length > 0) {
        return CONFIG.promotionBuckets;
    }
    if (CONFIG.promotionBands && Array.isArray(CONFIG.promotionBands) && CONFIG.promotionBands.length > 0) {
        return CONFIG.promotionBands;
    }
    if (CONFIG.promotionMode === 'three-buckets' || CONFIG.promotionMode === 'three-bucket' || CONFIG.promotionMode === '3-bucket') {
        return [
            {
                id: 'promote-now',
                name: 'Promote Now',
                shortName: 'Now',
                description: 'Readiness for promotion in the current cycle',
                hasLimit: true,
                defaultCapacity: 3,
                maxCapacity: 10,
                color: '#16a34a',
                colorLight: '#f0fdf4',
                colorBorder: '#22c55e'
            },
            {
                id: 'promote-soon',
                name: 'Promote Soon',
                shortName: 'Soon',
                description: 'Readiness for promotion in the next cycle',
                hasLimit: false,
                color: '#ca8a04',
                colorLight: '#fefce8',
                colorBorder: '#f59e0b'
            },
            {
                id: 'promote-later',
                name: 'Promote Later',
                shortName: 'Later',
                description: 'Readiness for promotion in a future cycle',
                hasLimit: false,
                color: '#475569',
                colorLight: '#f8fafc',
                colorBorder: '#94a3b8'
            }
        ];
    }
    return getDefaultPromotionBuckets();
}

// Default 2-tier mode (Expected / Potential)
function getDefaultPromotionBuckets() {
    return [
        {
            id: 'expected',
            name: 'Expected Promotions',
            shortName: 'Expected',
            description: 'Highest priority candidates recommended for promotion. Set space to 0 to disable this row and manage all promotions in the uncapped row below.',
            hasLimit: true,
            defaultCapacity: (CONFIG.defaultExpectedSpaces !== undefined ? CONFIG.defaultExpectedSpaces : 3),
            maxCapacity: (CONFIG.maxExpectedSpaces !== undefined ? CONFIG.maxExpectedSpaces : 10),
            color: '#ca8a04',
            colorLight: '#fffbeb',
            colorBorder: '#f59e0b'
        },
        {
            id: 'potential',
            name: 'Potential Promotions',
            shortName: 'Potential',
            description: 'Candidates recommended for potential promotion space (uncapped). Excess candidates cascade here if Expected slots are full.',
            hasLimit: false,
            color: '#64748b',
            colorLight: '#f8fafc',
            colorBorder: '#94a3b8'
        }
    ];
}

function toNonNegativeInt(value, fallback) {
    const n = Number(value);
    return (value !== null && value !== '' && Number.isFinite(n) && n >= 0) ? Math.floor(n) : fallback;
}

function asText(value) {
    return (value === null || value === undefined) ? '' : String(value);
}

/**
 * Validates and normalises a list of bands/buckets so the rest of the app can rely on:
 *  - unique, markup-safe ids (they are used in element ids, CSS class names and inline handlers)
 *  - numeric capacities for limited entries
 *  - the final entry being uncapped (otherwise overflow has nowhere to cascade and candidates would vanish)
 */
function normaliseLadder(list, label, minCapacity, colorDefaults) {
    const seenIds = new Set();
    const result = [];
    (Array.isArray(list) ? list : []).forEach(item => {
        if (!item || typeof item.id !== 'string' || !SAFE_ID_PATTERN.test(item.id) || item.id.startsWith('promotion-')) {
            console.warn(`Ignoring ${label} with missing or invalid id (allowed: letters, digits, '-' and '_'):`, item);
            return;
        }
        if (seenIds.has(item.id)) {
            console.warn(`Ignoring duplicate ${label} id "${item.id}".`);
            return;
        }
        seenIds.add(item.id);

        const copy = { ...item, hasLimit: !!item.hasLimit };
        copy.name = asText(item.name) || item.id;
        copy.description = asText(item.description);
        if (item.shortName !== undefined) copy.shortName = asText(item.shortName);
        ['color', 'colorLight', 'colorBorder'].forEach(key => {
            if (copy[key] !== undefined && !SAFE_CSS_VALUE_PATTERN.test(asText(copy[key]))) {
                console.warn(`Ignoring invalid ${key} on ${label} "${item.id}":`, copy[key]);
                delete copy[key];
            }
            if (copy[key] === undefined && colorDefaults) copy[key] = colorDefaults[key];
        });
        if (copy.hasLimit) {
            copy.defaultCapacity = Math.max(minCapacity, toNonNegativeInt(item.defaultCapacity, 3));
            copy.maxCapacity = Math.max(copy.defaultCapacity, toNonNegativeInt(item.maxCapacity, DEFAULT_MAX_CAPACITY));
        }
        result.push(copy);
    });

    const last = result[result.length - 1];
    if (last && last.hasLimit) {
        console.warn(`The last ${label} "${last.id}" has a capacity limit but there is nowhere for overflow to cascade. Treating it as uncapped.`);
        last.hasLimit = false;
    }
    return result;
}

function isTwoTierPromoMode() {
    return promoBuckets.length === 2 && promoBuckets[0].id === 'expected' && promoBuckets[1].id === 'potential';
}

function getPromoCapacity(bucketId) {
    const value = state.promotionCapacities ? state.promotionCapacities[bucketId] : undefined;
    if (value !== undefined) return value;
    const bucket = promoBuckets.find(b => b.id === bucketId);
    return (bucket && bucket.hasLimit) ? bucket.defaultCapacity : 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------------------------------------------

// Initialize App
window.addEventListener('DOMContentLoaded', () => {
    init();
});

function init() {
    bands = normaliseLadder(CONFIG.bands, 'band', 1, { color: '#64748b', colorLight: '#f8fafc', colorBorder: '#94a3b8' });
    promoBuckets = normaliseLadder(getPromotionBuckets(), 'promotion bucket', 0, null);
    if (promoBuckets.length === 0) {
        console.warn('No valid promotion buckets configured; falling back to the default Expected / Potential buckets.');
        promoBuckets = normaliseLadder(getDefaultPromotionBuckets(), 'promotion bucket', 0, null);
    }

    if (bands.length === 0) {
        document.getElementById('board-container').innerHTML =
            '<div class="empty-state">No valid performance bands are configured. Check the "bands" section of config.json and re-run generate.ps1.</div>';
        return;
    }

    injectDynamicStyles();

    // Set titles and metadata
    document.getElementById('app-title').innerText = CONFIG.title || 'LADDERATER';
    const statusBadge = document.getElementById('app-status-badge');
    statusBadge.innerHTML = `<span class="pulse-dot"></span>${escapeHtml(CONFIG.subtitle || 'Appraisal Panel Active')}`;
    document.title = `${CONFIG.title || 'Ladderater'} - Calibration Panel`;

    // Enable view switcher if promotions are enabled
    if (CONFIG.enablePromotions) {
        document.getElementById('view-switcher').style.display = 'flex';
    }

    allCandidates = (Array.isArray(INITIAL_CANDIDATES) ? INITIAL_CANDIDATES : []).map((c, index) => ({
        id: `cand-${index}`,
        name: asText(c.Name),
        counsellor: asText(c.Counsellor),
        email: c.Email || null,
        photo: c.Photo || null,
        comment: c.Comment || null
    }));
    candidateById = new Map(allCandidates.map(c => [c.id, c]));

    boardHash = computeBoardHash(allCandidates, CONFIG);
    storageKey = STORAGE_KEY_PREFIX + boardHash;
    state = loadState();
    saveState();

    // Restore sidebar collapsed state
    if (storageGet(SIDEBAR_STORAGE_KEY) === 'true') {
        document.getElementById('sidebar-left').classList.add('collapsed');
    }

    // Keep multiple tabs of the same board in sync instead of letting them silently overwrite each other
    window.addEventListener('storage', e => {
        if (e.key !== storageKey || !e.newValue) return;
        state = loadState();
        renderAll();
    });

    renderAll();
}

// Generate dynamic CSS variables and classes for each band
function injectDynamicStyles() {
    const styleEl = document.createElement('style');
    let css = ':root {\n';
    bands.forEach(b => {
        css += `  --color-${b.id}: ${b.color};\n`;
        css += `  --color-${b.id}-light: ${b.colorLight};\n`;
        css += `  --color-${b.id}-border: ${b.colorBorder};\n`;
    });
    promoBuckets.forEach(b => {
        css += `  --color-promo-${b.id}: ${b.color || '#64748b'};\n`;
        css += `  --color-promo-${b.id}-light: ${b.colorLight || '#f8fafc'};\n`;
        css += `  --color-promo-${b.id}-border: ${b.colorBorder || '#cbd5e1'};\n`;
    });
    css += '}\n';

    bands.forEach(b => {
        css += `
        .band-${b.id} .slot-box.drag-over,
        .band-${b.id} .plus-slot.drag-over {
            border-color: var(--color-${b.id}) !important;
            background-color: var(--color-${b.id}-light) !important;
            color: var(--color-${b.id}) !important;
        }
        .badge-${b.id} {
            background: var(--color-${b.id}) !important;
        }
        .pill-${b.id} {
            background-color: var(--color-${b.id}) !important;
            color: #ffffff !important;
        }
        .btn-promote-${b.id} {
            border-color: var(--color-${b.id}-border) !important;
            color: var(--color-${b.id}) !important;
            background-color: var(--color-${b.id}-light) !important;
        }
        .btn-promote-${b.id}:hover {
            background-color: var(--color-${b.id}-border) !important;
            color: #ffffff !important;
        }
        `;
    });

    promoBuckets.forEach(b => {
        css += `
        .band-promotion-${b.id} .slot-box.drag-over,
        .band-promotion-${b.id} .plus-slot.drag-over {
            border-color: var(--color-promo-${b.id}-border) !important;
            background-color: var(--color-promo-${b.id}-light) !important;
            color: var(--color-promo-${b.id}) !important;
        }
        `;
    });

    styleEl.textContent = css;
    document.head.appendChild(styleEl);
}

// ---------------------------------------------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------------------------------------------

function storageGet(key) {
    try {
        return window.localStorage.getItem(key);
    } catch (e) {
        return null;
    }
}

function storageSet(key, value) {
    try {
        window.localStorage.setItem(key, value);
        return true;
    } catch (e) {
        console.warn('Unable to write to localStorage', e);
        return false;
    }
}

function storageRemove(key) {
    try {
        window.localStorage.removeItem(key);
    } catch (e) {
        // Ignore: storage unavailable
    }
}

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return hash.toString();
}

function getConfigSignature(config) {
    const configStr = (config.bands || []).map(b => `${b.id}:${b.hasLimit}:${b.defaultCapacity}`).join(';');
    const pBuckets = (config.promotionBuckets || config.promotionBands || []);
    const promoStr = `${config.enablePromotions || false}:${config.promotionMode || ''}:${pBuckets.map(b => `${b.id}:${b.name}:${b.hasLimit}:${b.defaultCapacity}:${b.description}`).join(';')}:${config.defaultExpectedSpaces || ''}`;
    return configStr + '||' + promoStr;
}

// State hash incorporating the candidate list and band configuration. It is order-sensitive because candidate ids
// are derived from CSV row position; display-only fields (comment, photo) are excluded so editing them, or
// re-generating with/without Entra ID photos, does not wipe an in-progress session.
function computeBoardHash(candidates, config) {
    const candStr = candidates.map(c => [c.name, c.counsellor, c.email || ''].join('|')).join(';');
    return 'v2_' + hashString(candStr + '||' + getConfigSignature(config));
}

// Hash used by builds before state version 2. Only used to recognise (and migrate) their saved state.
function computeLegacyHash(candidates, config) {
    const candStr = candidates.map(c => c.name + '|' + c.counsellor + '|' + (c.email || '') + '|' + (c.comment || '') + '|' + (c.photo ? 'hasphoto' : '')).sort().join(';');
    return hashString(candStr + '||' + getConfigSignature(config));
}

function identityKey(c) {
    return [asText(c.name), asText(c.counsellor), asText(c.email)].join('\u0001');
}

function byName(a, b) {
    return a.name.localeCompare(b.name);
}

function clampCapacity(value, min, bucket) {
    const n = toNonNegativeInt(value, bucket.defaultCapacity);
    return Math.min(Math.max(n, min), bucket.maxCapacity);
}

/**
 * Builds a complete, internally consistent state object from a (possibly partial, stale or corrupted) saved state.
 * Guarantees every candidate appears exactly once on the performance board (in a band or unranked), that promotion
 * ladders only contain known, de-duplicated candidates, and that starred ids match the promotion ladders.
 * @param {object} saved Saved state (any version).
 * @param {function} resolveId Maps a saved reference (id string or legacy candidate object) to a current candidate id.
 */
function buildState(saved, resolveId) {
    saved = saved || {};
    const result = {
        unranked: [],
        bands: {},
        capacities: {},
        discussingCandidateId: null,
        starredCandidateIds: [],
        promotionBands: {},
        promotionCapacities: {}
    };

    const takeFrom = seen => list => (Array.isArray(list) ? list : []).map(ref => {
        const id = resolveId(ref);
        if (typeof id !== 'string' || seen.has(id) || !candidateById.has(id)) return null;
        seen.add(id);
        return candidateById.get(id);
    }).filter(Boolean);

    // Performance board
    const ranked = new Set();
    const takeRanked = takeFrom(ranked);
    const savedBands = saved.bands || {};
    const savedCaps = saved.capacities || {};
    bands.forEach(b => {
        result.bands[b.id] = takeRanked(savedBands[b.id]);
        if (b.hasLimit) {
            result.capacities[b.id] = clampCapacity(savedCaps[b.id], 1, b);
        }
    });
    // Anyone not placed in a band (including candidates new to the list) is unranked, kept in alphabetical order
    result.unranked = allCandidates.filter(c => !ranked.has(c.id)).sort(byName);

    // Promotion board (builds before v2 stored the two-tier ladders in dedicated fields)
    const promoted = new Set();
    const takePromoted = takeFrom(promoted);
    const savedPromo = saved.promotionBands || {};
    const savedPromoCaps = saved.promotionCapacities || {};
    promoBuckets.forEach(b => {
        let list = savedPromo[b.id];
        if (!Array.isArray(list)) {
            if (b.id === 'expected') list = saved.promotionLadderExpected;
            else if (b.id === 'potential') list = saved.promotionLadderPotential;
        }
        result.promotionBands[b.id] = takePromoted(list);
        if (b.hasLimit) {
            let cap = savedPromoCaps[b.id];
            if (cap === undefined && b.id === 'expected') cap = saved.promotionCapacityExpected;
            result.promotionCapacities[b.id] = clampCapacity(cap, 0, b);
        }
    });
    // Starred candidates that somehow are not on a ladder are appended to the last (uncapped) bucket
    const orphanStarred = takePromoted(saved.starredCandidateIds);
    if (orphanStarred.length > 0 && promoBuckets.length > 0) {
        result.promotionBands[promoBuckets[promoBuckets.length - 1].id].push(...orphanStarred);
    }
    result.starredCandidateIds = promoBuckets.flatMap(b => result.promotionBands[b.id].map(c => c.id));

    const discussingId = resolveId(saved.discussingCandidateId);
    result.discussingCandidateId = result.unranked.some(c => c.id === discussingId)
        ? discussingId
        : (result.unranked.length > 0 ? result.unranked[0].id : null);

    cascadeOverflow(result);
    cascadeOverflowPromotion(result);
    return result;
}

function createDefaultState() {
    return buildState({}, id => id);
}

function loadState() {
    const saved = storageGet(storageKey);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed && parsed.version === STATE_VERSION && parsed.hash === boardHash) {
                return buildState(parsed.state, id => id);
            }
        } catch (e) {
            console.error('Failed to restore cached calibration state', e);
        }
    }
    return loadLegacyState() || createDefaultState();
}

// Migrates state saved by builds before version 2, which stored whole candidate objects under a single global key
// with position-based ids. Those ids are re-mapped by candidate identity because the CSV row order may have changed.
function loadLegacyState() {
    const saved = storageGet(LEGACY_STORAGE_KEY);
    if (!saved) return null;
    try {
        const parsed = JSON.parse(saved);
        if (!parsed || !parsed.state || parsed.hash !== computeLegacyHash(allCandidates, CONFIG)) return null;

        const available = new Map();
        allCandidates.forEach(c => {
            const key = identityKey(c);
            if (!available.has(key)) available.set(key, []);
            available.get(key).push(c.id);
        });
        const idMap = new Map();
        const collect = obj => {
            if (!obj || typeof obj !== 'object' || typeof obj.id !== 'string' || idMap.has(obj.id)) return;
            const queue = available.get(identityKey(obj));
            if (queue && queue.length > 0) idMap.set(obj.id, queue.shift());
        };
        const s = parsed.state;
        const lists = [s.unranked, s.promotionLadderExpected, s.promotionLadderPotential]
            .concat(Object.values(s.bands || {}), Object.values(s.promotionBands || {}));
        lists.forEach(list => (Array.isArray(list) ? list : []).forEach(collect));

        const migrated = buildState(s, ref => idMap.get(ref && typeof ref === 'object' ? ref.id : ref));
        if (storageSet(storageKey, serialiseState(migrated))) {
            storageRemove(LEGACY_STORAGE_KEY);
        }
        return migrated;
    } catch (e) {
        console.error('Failed to migrate legacy calibration state', e);
        return null;
    }
}

function serialiseState(s) {
    const toIds = list => list.map(c => c.id);
    const mapToIds = obj => Object.fromEntries(Object.entries(obj).map(([key, list]) => [key, toIds(list)]));
    return JSON.stringify({
        version: STATE_VERSION,
        hash: boardHash,
        savedAt: new Date().toISOString(),
        state: {
            bands: mapToIds(s.bands),
            capacities: s.capacities,
            discussingCandidateId: s.discussingCandidateId,
            starredCandidateIds: s.starredCandidateIds.slice(),
            promotionBands: mapToIds(s.promotionBands),
            promotionCapacities: s.promotionCapacities
        }
    });
}

function saveState() {
    if (!storageSet(storageKey, serialiseState(state))) {
        showStorageWarning();
    }
}

function showStorageWarning() {
    if (storageWarningShown) return;
    storageWarningShown = true;
    const badge = document.getElementById('app-status-badge');
    if (!badge) return;
    badge.textContent = 'Progress is NOT being saved';
    badge.title = 'Browser storage is unavailable or full. Use Export List regularly to avoid losing work.';
    badge.style.backgroundColor = '#fef2f2';
    badge.style.borderColor = '#fecaca';
    badge.style.color = '#b91c1c';
}

// ---------------------------------------------------------------------------------------------------------------
// Avatars
// ---------------------------------------------------------------------------------------------------------------

// Avatar Generator (Profile Photo or SVG Initials)
function getAvatarHtml(candidate, id) {
    if (candidate && candidate.photo) {
        return `<img src="${escapeHtml(candidate.photo)}" class="candidate-avatar" alt="${escapeHtml(candidate.name)}" id="avatar-${id}" />`;
    }
    return getAvatarSvg(candidate ? candidate.name : '', id);
}

// SVG Avatar Generator
function getAvatarSvg(name, id) {
    const gradients = [
        ['#4f46e5', '#818cf8'], // Indigo
        ['#0891b2', '#22d3ee'], // Cyan
        ['#0d9488', '#2dd4bf'], // Teal
        ['#db2777', '#f472b6'], // Pink
        ['#7c3aed', '#a78bfa'], // Purple
        ['#ea580c', '#fb923c'], // Orange
        ['#e11d48', '#fb7185'], // Rose
        ['#2563eb', '#60a5fa'], // Blue
    ];

    name = asText(name);
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % gradients.length;
    const grad = gradients[index];

    const initials = name.split(/\s+/)
                         .map(n => Array.from(n)[0])
                         .filter(c => c)
                         .join('')
                         .slice(0, 2)
                         .toUpperCase();

    return `
        <svg viewBox="0 0 40 40" class="candidate-avatar">
            <defs>
                <linearGradient id="grad-${id}" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="${grad[0]}" />
                    <stop offset="100%" stop-color="${grad[1]}" />
                </linearGradient>
            </defs>
            <circle cx="20" cy="20" r="20" fill="url(#grad-${id})" />
            <text x="50%" y="54%" font-size="13" font-family="'Outfit', 'Inter', sans-serif" font-weight="700" fill="#ffffff" dominant-baseline="middle" text-anchor="middle">${escapeHtml(initials)}</text>
        </svg>
    `;
}

// ---------------------------------------------------------------------------------------------------------------
// View switching
// ---------------------------------------------------------------------------------------------------------------

function switchView(viewName) {
    if (!CONFIG.enablePromotions) return;
    currentView = viewName;

    document.getElementById('btn-view-performance').classList.toggle('active', viewName === 'performance');
    document.getElementById('btn-view-promotion').classList.toggle('active', viewName === 'promotion');

    renderAll();
}

// Re-renders the skeletons and content of every panel, preserving the search box contents
function renderAll() {
    const searchEl = document.getElementById('search-input');
    const searchVal = searchEl ? searchEl.value : '';

    renderLeftSidebarSkeleton();
    renderBoardSkeleton();
    renderRightSidebarSkeleton();

    const newSearchEl = document.getElementById('search-input');
    if (newSearchEl) newSearchEl.value = searchVal;

    renderApp();
}

// ---------------------------------------------------------------------------------------------------------------
// Drag & Drop Handlers
// ---------------------------------------------------------------------------------------------------------------

function handleDragStart(e, candidateId) {
    draggedCandidateId = candidateId;
    e.dataTransfer.setData('text/plain', candidateId);
    e.dataTransfer.effectAllowed = 'move';

    setTimeout(() => {
        const el = document.getElementById(candidateId);
        if (el) el.classList.add('dragging');
    }, 0);
}

function handleDragEnd(e, candidateId) {
    const el = document.getElementById(candidateId);
    if (el) el.classList.remove('dragging');
    draggedCandidateId = null;
    clearDragHighlights();
}

function clearDragHighlights() {
    document.querySelectorAll('.drag-over').forEach(box => {
        box.classList.remove('drag-over');
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e, targetEl) {
    e.preventDefault();
    targetEl.classList.add('drag-over');
}

function handleDragLeave(e, targetEl) {
    // Ignore leave events caused by moving over the target's own children
    if (e.relatedTarget && targetEl.contains(e.relatedTarget)) return;
    targetEl.classList.remove('drag-over');
}

// Only accept drops of known candidate ids (ignores text or files dragged in from elsewhere)
function getDraggedCandidateId(e) {
    let candidateId = null;
    try {
        candidateId = e.dataTransfer.getData('text/plain');
    } catch (err) {
        candidateId = null;
    }
    candidateId = candidateId || draggedCandidateId;
    return candidateById.has(candidateId) ? candidateId : null;
}

function handleDrop(e, targetBandId, targetIndex) {
    e.preventDefault();
    // Cards in the right sidebar sit inside its own drop zone: stop the drop being handled twice
    e.stopPropagation();
    clearDragHighlights();
    const candidateId = getDraggedCandidateId(e);
    if (!candidateId) return;

    moveCandidate(candidateId, targetBandId, targetIndex);
}

function handleDropUnranked(e) {
    e.preventDefault();
    clearDragHighlights();
    const candidateId = getDraggedCandidateId(e);
    if (!candidateId) return;

    unrankCandidateForCurrentView(candidateId);
}

function unrankCandidateForCurrentView(candidateId) {
    if (currentView === 'promotion') {
        unrankCandidatePromotion(candidateId);
    } else {
        unrankCandidate(candidateId);
    }
}

// ---------------------------------------------------------------------------------------------------------------
// Core Calibration Operations
// ---------------------------------------------------------------------------------------------------------------

function moveCandidate(candidateId, targetBandId, targetIndex) {
    if (!targetBandId) {
        unrankCandidateForCurrentView(candidateId);
        return;
    }
    if (targetBandId.startsWith('promotion-')) {
        moveCandidatePromotion(candidateId, targetBandId, targetIndex);
        return;
    }

    const band = state.bands[targetBandId];
    if (!band) return;

    let candidate = null;

    // Find and extract candidate from unranked
    const unrankedIdx = state.unranked.findIndex(c => c.id === candidateId);
    if (unrankedIdx !== -1) {
        candidate = state.unranked.splice(unrankedIdx, 1)[0];
    } else {
        // Find and extract candidate from existing bands
        for (const bandId in state.bands) {
            const idx = state.bands[bandId].findIndex(c => c.id === candidateId);
            if (idx !== -1) {
                candidate = state.bands[bandId].splice(idx, 1)[0];
                break;
            }
        }
    }

    if (!candidate) return;

    // Insert candidate in new target
    let actualIndex = targetIndex;
    if (actualIndex > band.length || actualIndex === -1) {
        actualIndex = band.length;
    }

    band.splice(actualIndex, 0, candidate);

    // Apply overflow cascades
    cascadeOverflow();

    // Advance sequential discussion pointer if the candidate under discussion was the one moved
    if (state.discussingCandidateId === candidateId) {
        autoAdvanceDiscussion();
    }

    saveState();
    renderApp();
}

function unrankCandidate(candidateId) {
    let candidate = null;

    // Find and extract candidate from bands
    for (const bandId in state.bands) {
        const idx = state.bands[bandId].findIndex(c => c.id === candidateId);
        if (idx !== -1) {
            candidate = state.bands[bandId].splice(idx, 1)[0];
            break;
        }
    }

    if (!candidate) return;

    // Place back in unranked pool (maintain alphabetic order)
    state.unranked.push(candidate);
    state.unranked.sort(byName);

    // Reset focus to this unranked candidate to discuss them again
    state.discussingCandidateId = candidate.id;

    saveState();
    renderApp();
}

// Cascades sequentially top-down until it hits an unlimited band
function cascadeOverflow(s = state) {
    for (let i = 0; i < bands.length - 1; i++) {
        const currentBand = bands[i];
        const nextBand = bands[i + 1];
        if (currentBand.hasLimit) {
            const currentCap = s.capacities[currentBand.id];
            while (s.bands[currentBand.id].length > currentCap) {
                const popped = s.bands[currentBand.id].pop();
                s.bands[nextBand.id].unshift(popped);
            }
        }
    }
}

function changeSlots(bandId, delta) {
    const bandConfig = bands.find(b => b.id === bandId);
    if (!bandConfig || !bandConfig.hasLimit) return;
    const newVal = state.capacities[bandId] + delta;
    if (newVal < 1 || newVal > bandConfig.maxCapacity) return;

    state.capacities[bandId] = newVal;
    const inputEl = document.getElementById(`input-${bandId}-slots`);
    if (inputEl) inputEl.value = newVal;

    cascadeOverflow();
    saveState();
    renderApp();
}

function resetBoard() {
    if (!confirm("Are you sure you want to reset all rankings? This will return all candidates to their default starting states.")) return;

    // Return everyone to the unranked pool and clear promotions, keeping the configured slot capacities
    state = buildState({
        capacities: state.capacities,
        promotionCapacities: state.promotionCapacities
    }, id => id);

    saveState();
    renderAll();
}

function setDiscussingCandidate(candidateId) {
    state.discussingCandidateId = candidateId;
    saveState();
    renderApp();
}

function skipDiscussingCandidate() {
    if (state.unranked.length <= 1) return;

    const currentIdx = state.unranked.findIndex(c => c.id === state.discussingCandidateId);
    let nextIdx = currentIdx + 1;
    if (nextIdx >= state.unranked.length) {
        nextIdx = 0;
    }
    state.discussingCandidateId = state.unranked[nextIdx].id;
    saveState();
    renderApp();
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar-left');
    sidebar.classList.toggle('collapsed');
    storageSet(SIDEBAR_STORAGE_KEY, String(sidebar.classList.contains('collapsed')));
}

function autoAdvanceDiscussion() {
    if (state.unranked.length > 0) {
        state.discussingCandidateId = state.unranked[0].id;
    } else {
        state.discussingCandidateId = null;
    }
}

function promoteDiscussing(targetBandId) {
    if (!state.discussingCandidateId) return;
    moveCandidate(state.discussingCandidateId, targetBandId, 0); // Insert at position 1 (index 0) of that band
}

function handleSearch() {
    if (currentView === 'performance') {
        renderUnrankedList();
    } else {
        renderCandidatePool();
    }
}

// ---------------------------------------------------------------------------------------------------------------
// Dynamic Layout Skeletal Renderers
// ---------------------------------------------------------------------------------------------------------------

function renderLeftSidebarSkeleton() {
    const scrollContainer = document.querySelector('.sidebar-left-scroll');

    if (currentView === 'performance') {
        scrollContainer.innerHTML = `
            <div class="sidebar-section">
                <div class="sidebar-section-header">
                    <h3>Band Allocations</h3>
                    <button class="btn-close-sidebar" onclick="toggleSidebar()" title="Hide panel">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="11 17 6 12 11 7"></polyline><polyline points="18 17 13 12 18 7"></polyline></svg>
                    </button>
                </div>
                <div id="band-allocations-container"></div>
            </div>

            <div class="sidebar-section">
                <h3>Counsellor Breakdown</h3>
                <div class="counsellor-list" id="counsellor-breakdown"></div>
            </div>
        `;
        renderBandAllocationsConfig();
    } else {
        let configRowsHtml = '';
        const limitedBuckets = promoBuckets.filter(b => b.hasLimit);

        if (limitedBuckets.length > 0) {
            limitedBuckets.forEach(b => {
                const cap = getPromoCapacity(b.id);
                configRowsHtml += `
                    <div class="config-row">
                        <label for="input-promotion-${b.id}-slots" title="${escapeHtml(b.name)}">${escapeHtml(b.shortName || b.name)} Spaces:</label>
                        <div class="input-number-wrapper">
                            <button onclick="changePromotionCapacity('${b.id}', -1)">-</button>
                            <input type="number" id="input-promotion-${b.id}-slots" min="0" max="${b.maxCapacity}" value="${cap}" readonly>
                            <button onclick="changePromotionCapacity('${b.id}', 1)">+</button>
                        </div>
                    </div>
                `;
            });
        } else {
            configRowsHtml = `
                <div style="font-size: 12px; color: var(--text-secondary); padding: 4px 0 8px;">
                    All promotion buckets are currently uncapped.
                </div>
            `;
        }

        scrollContainer.innerHTML = `
            <div class="sidebar-section">
                <div class="sidebar-section-header">
                    <h3>Promotion Config</h3>
                    <button class="btn-close-sidebar" onclick="toggleSidebar()" title="Hide panel">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="11 17 6 12 11 7"></polyline><polyline points="18 17 13 12 18 7"></polyline></svg>
                    </button>
                </div>
                ${configRowsHtml}
            </div>

            <div class="sidebar-section">
                <h3>Counsellor Promo Stats</h3>
                <div class="counsellor-list" id="counsellor-breakdown"></div>
            </div>
        `;
    }
}

function renderBandAllocationsConfig() {
    const container = document.getElementById('band-allocations-container');
    let html = '';
    bands.forEach(b => {
        if (b.hasLimit) {
            html += `
                <div class="config-row">
                    <label for="input-${b.id}-slots" title="${escapeHtml(b.name)}">${escapeHtml(b.name)}:</label>
                    <div class="input-number-wrapper">
                        <button onclick="changeSlots('${b.id}', -1)">-</button>
                        <input type="number" id="input-${b.id}-slots" min="1" max="${b.maxCapacity}" value="${state.capacities[b.id]}" readonly>
                        <button onclick="changeSlots('${b.id}', 1)">+</button>
                    </div>
                </div>
            `;
        }
    });
    container.innerHTML = html;
}

function renderBoardSkeleton() {
    const container = document.getElementById('board-container');
    let html = '';

    if (currentView === 'performance') {
        bands.forEach((b, idx) => {
            const badgeNum = idx + 1;
            const counterId = `count-${b.id}`;
            const slotsId = `slots-${b.id}`;

            html += `
                <section class="band-section band-${b.id}" data-band-id="${b.id}">
                    <div class="band-info">
                        <div>
                            <div class="band-header">
                                <span class="band-badge badge-${b.id}">${badgeNum}</span>
                                <h2>${escapeHtml(b.name)}</h2>
                            </div>
                            <p class="band-desc">${escapeHtml(b.description)}</p>
                        </div>
                        <div class="band-counter">
                            ${b.hasLimit ? 'Slots' : 'Ranked'}: <span class="band-counter-val" id="${counterId}">0</span>
                        </div>
                    </div>
                    <div class="${b.hasLimit ? 'band-slots' : 'band-slots-unlimited'}" id="${slotsId}">
                        <!-- Slots injected dynamically -->
                    </div>
                </section>
            `;
        });
    } else {
        const twoTier = isTwoTierPromoMode();
        const showExpected = !twoTier || (getPromoCapacity('expected') > 0);

        promoBuckets.forEach((b, idx) => {
            if (twoTier && b.id === 'expected' && !showExpected) {
                return; // Hidden when Expected capacity is 0
            }

            const isGoldenPot = (twoTier && b.id === 'potential' && !showExpected);

            const borderColor = isGoldenPot ? '#f59e0b' : (b.colorBorder || '#94a3b8');
            const bgColor = isGoldenPot ? '#fffbeb' : (b.colorLight || '#f8fafc');
            const badgeBg = isGoldenPot ? '#eab308' : (b.color || '#94a3b8');
            const badgeColor = '#ffffff';

            // badgeIcon is trusted HTML from config.json (e.g. an HTML entity)
            let badgeIcon = b.badgeIcon;
            if (!badgeIcon) {
                if (twoTier) {
                    badgeIcon = (b.id === 'expected' || isGoldenPot) ? '&#9733;' : '&#9734;';
                } else {
                    badgeIcon = idx === 0 ? '&#9733;' : (idx === 1 ? '&#9734;' : '&#9675;');
                }
            }

            const borderRightColor = isGoldenPot ? '#fef08a' : (b.colorBorder ? b.colorLight : '#e2e8f0');
            const counterBg = isGoldenPot ? '#fef08a; border-color: #f59e0b;' : `${b.colorLight || '#e2e8f0'}; border-color: ${b.colorBorder || '#94a3b8'}; color: ${b.color || '#334155'};`;

            let desc = b.description;
            if (isGoldenPot) {
                desc = 'Candidates recommended for potential promotion space (uncapped). Expected promotions row is currently disabled.';
            }

            const counterId = `count-promotion-${b.id}`;
            const slotsId = `slots-promotion-${b.id}`;
            const initialCountText = b.hasLimit ? `0 / ${getPromoCapacity(b.id)}` : `0`;

            html += `
                <section class="band-section band-promotion-${b.id}" data-band-id="promotion-${b.id}" style="border-color: ${borderColor}; background-color: ${bgColor};">
                    <div class="band-info" style="border-right-color: ${borderRightColor};">
                        <div>
                            <div class="band-header">
                                <span class="band-badge badge-promotion-${b.id}" style="background: ${badgeBg}; color: ${badgeColor};">${badgeIcon}</span>
                                <h2>${escapeHtml(b.name)}</h2>
                            </div>
                            <p class="band-desc">${escapeHtml(desc)}</p>
                        </div>
                        <div class="band-counter">
                            Allocated: <span class="band-counter-val" id="${counterId}" style="background: ${counterBg}">${initialCountText}</span>
                        </div>
                    </div>
                    <div class="${b.hasLimit ? 'band-slots' : 'band-slots-unlimited'}" id="${slotsId}">
                        <!-- Slots injected dynamically -->
                    </div>
                </section>
            `;
        });
    }

    container.innerHTML = html;
}

function renderRightSidebarSkeleton() {
    const sidebar = document.querySelector('.sidebar-right');

    if (currentView === 'performance') {
        sidebar.innerHTML = `
            <div class="sidebar-header-right">
                <h2>Unranked Candidates</h2>
                <div class="discuss-next-container" id="discuss-next-container"></div>
                <div class="search-box-wrapper">
                    <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input type="text" id="search-input" placeholder="Search candidates or counsellors..." oninput="handleSearch()">
                </div>
            </div>
            <div class="unranked-list-scroll" id="unranked-list"></div>
        `;
    } else {
        const hasLimitedWithSlots = promoBuckets.some(b => b.hasLimit && getPromoCapacity(b.id) > 0);
        const gridCols = hasLimitedWithSlots ? '1fr 1fr' : '1fr';
        const autoFillBtn = hasLimitedWithSlots ? `<button class="discuss-btn" onclick="autoFillPromotion()" title="Auto-fill empty limited slots with top-performing ranked candidates" style="border-color: #ca8a04; color: #ca8a04; background: #ffffff;">Auto-Fill</button>` : '';

        sidebar.innerHTML = `
            <div class="sidebar-header-right">
                <h2>Candidate Pool</h2>

                <!-- Quick Promo Actions -->
                <div class="discuss-next-container" style="background: linear-gradient(135deg, #fef08a 0%, #fffbeb 100%); border-color: #fef08a; box-shadow: none;">
                    <div class="discuss-next-title" style="color: #ca8a04;">
                        <span></span>Promotion Actions
                    </div>
                    <div class="discuss-active-actions" style="grid-template-columns: ${gridCols};">
                        ${autoFillBtn}
                        <button class="discuss-btn" onclick="clearPromotionLadder()" title="Remove all candidates from promotion" style="border-color: #ef4444; color: #ef4444; background: #ffffff; ${!hasLimitedWithSlots ? 'grid-column: span 1;' : ''}">Clear Ladder</button>
                    </div>
                </div>

                <div class="search-box-wrapper">
                    <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input type="text" id="search-input" placeholder="Search available candidates..." oninput="handleSearch()">
                </div>
            </div>
            <div class="unranked-list-scroll" id="unranked-list"></div>
        `;
    }
}

// ---------------------------------------------------------------------------------------------------------------
// Render Functions
// ---------------------------------------------------------------------------------------------------------------

function renderApp() {
    if (currentView === 'performance') {
        bands.forEach(b => {
            if (b.hasLimit) {
                renderLimitedBand(b.id);
            } else {
                renderUnlimitedBand(b.id);
            }
        });
        renderUnrankedList();
        renderDiscussNext();
    } else {
        renderPromotionLadder();
        renderCandidatePool();
    }
    renderCounsellorBreakdown();
    renderHeaderStats();
}

function renderCard(candidate, bandId, index) {
    const avatar = getAvatarHtml(candidate, candidate.id);
    const isStarred = state.starredCandidateIds.includes(candidate.id);
    let starredClass = isStarred ? 'starred' : '';
    let customCardStyle = '';

    const isPromotionView = (currentView === 'promotion');
    const isPromoBand = !!bandId && bandId.startsWith('promotion-');
    const promoBucketId = isPromoBand ? bandId.slice('promotion-'.length) : null;
    const currentBucket = promoBucketId ? promoBuckets.find(b => b.id === promoBucketId) : null;

    if (isStarred && isPromoBand && currentBucket) {
        if (isTwoTierPromoMode()) {
            if (promoBucketId === 'expected') {
                starredClass = 'starred promo-expected';
            } else if (promoBucketId === 'potential') {
                starredClass = (getPromoCapacity('expected') === 0) ? 'starred promo-expected' : 'starred promo-potential';
            }
        } else {
            starredClass = `starred promo-${currentBucket.id}`;
            customCardStyle = `border-color: ${currentBucket.colorBorder || '#f59e0b'}; background: linear-gradient(135deg, ${currentBucket.colorLight || '#fffbeb'} 0%, #ffffff 100%);`;
        }
    }

    // Build star button (only if enabled)
    let starBtn = '';
    if (CONFIG.enablePromotions) {
        let starFill = '#eab308';
        let starStroke = '#d97706';
        if (isStarred && currentBucket && !isTwoTierPromoMode()) {
            starFill = currentBucket.color || '#eab308';
            starStroke = currentBucket.colorBorder || currentBucket.color || '#d97706';
        }
        const starSvg = isStarred ? `
            <svg viewBox="0 0 24 24" fill="${starFill}" stroke="${starStroke}" stroke-width="2" class="star-icon">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
        ` : `
            <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" class="star-icon">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
        `;
        starBtn = `
            <button class="card-star-btn ${isStarred ? 'starred' : ''}" onclick="event.stopPropagation(); toggleStar('${candidate.id}', event)" title="${isStarred ? 'Remove from promotion consideration' : 'Consider for promotion'}">
                ${starSvg}
            </button>
        `;
    }

    const showUnrank = isPromotionView ? isPromoBand : !!bandId;
    const clickUnrank = isPromotionView ? `unrankCandidatePromotion('${candidate.id}')` : `unrankCandidate('${candidate.id}')`;

    const unrankBtn = !showUnrank ? '' : `
        <button class="card-unrank-btn" onclick="event.stopPropagation(); ${clickUnrank}" title="Remove from ladder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
    `;

    const isActiveDiscuss = (!isPromotionView && !bandId && state.discussingCandidateId === candidate.id) ? 'active-discussion' : '';
    const clickAction = (!isPromotionView && !bandId) ? `onclick="setDiscussingCandidate('${candidate.id}')"` : '';
    const styleAttr = customCardStyle ? `style="${customCardStyle}"` : '';

    return `
        <div class="candidate-card ${starredClass} ${isActiveDiscuss}"
             id="${candidate.id}"
             draggable="true"
             ondragstart="handleDragStart(event, '${candidate.id}')"
             ondragend="handleDragEnd(event, '${candidate.id}')"
             ondragover="handleDragOver(event)"
             ondragenter="handleDragEnter(event, this)"
             ondragleave="handleDragLeave(event, this)"
             ondrop="handleDrop(event, '${bandId || ''}', ${index})"
             ${clickAction}
             ${styleAttr}>
            ${avatar}
            <div class="candidate-details">
                <div class="candidate-name" title="${escapeHtml(candidate.name)}">${escapeHtml(candidate.name)}</div>
                <div class="candidate-counsellor" title="Counsellor: ${escapeHtml(candidate.counsellor)}">
                    Counsellor: ${escapeHtml(candidate.counsellor)}
                </div>
            </div>
            ${starBtn}
            ${unrankBtn}
        </div>
    `;
}

function renderLimitedBand(bandId) {
    const band = state.bands[bandId];
    const capacity = state.capacities[bandId];
    const container = document.getElementById(`slots-${bandId}`);
    let html = '';

    for (let i = 0; i < capacity; i++) {
        if (i < band.length) {
            html += renderCard(band[i], bandId, i);
        } else {
            html += `
                <div class="slot-box"
                     ondragover="handleDragOver(event)"
                     ondragenter="handleDragEnter(event, this)"
                     ondragleave="handleDragLeave(event, this)"
                     ondrop="handleDrop(event, '${bandId}', ${i})">
                    <span class="slot-rank-indicator">#${i + 1}</span>
                    Drop to Rank
                </div>
            `;
        }
    }
    container.innerHTML = html;

    // Render counters
    document.getElementById(`count-${bandId}`).innerText = `${band.length} / ${capacity}`;
}

function renderUnlimitedBand(bandId) {
    const band = state.bands[bandId];
    const container = document.getElementById(`slots-${bandId}`);
    let html = '';

    band.forEach((candidate, idx) => {
        html += renderCard(candidate, bandId, idx);
    });

    // Append trailing "Add to end" slot dropzone
    html += `
        <div class="plus-slot"
             ondragover="handleDragOver(event)"
             ondragenter="handleDragEnter(event, this)"
             ondragleave="handleDragLeave(event, this)"
             ondrop="handleDrop(event, '${bandId}', ${band.length})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Drop to Add (#${band.length + 1})
        </div>
    `;

    container.innerHTML = html;
    document.getElementById(`count-${bandId}`).innerText = `${band.length}`;
}

function matchesSearch(candidate, searchVal) {
    return candidate.name.toLowerCase().includes(searchVal) ||
        candidate.counsellor.toLowerCase().includes(searchVal) ||
        (!!candidate.comment && candidate.comment.toLowerCase().includes(searchVal));
}

function renderUnrankedList() {
    const container = document.getElementById('unranked-list');
    const searchVal = document.getElementById('search-input').value.trim().toLowerCase();

    const filtered = state.unranked.filter(c => matchesSearch(c, searchVal));

    if (filtered.length === 0) {
        if (allCandidates.length === 0) {
            container.innerHTML = `<div class="empty-state">No candidates were loaded. Add candidates to candidates.csv and re-run generate.ps1.</div>`;
        } else if (state.unranked.length === 0) {
            container.innerHTML = `<div class="empty-state">All candidates have been ranked! \u{1F389}</div>`;
        } else {
            container.innerHTML = `<div class="empty-state">No candidates match search criteria</div>`;
        }
        return;
    }

    let html = '';
    filtered.forEach(candidate => {
        html += renderCard(candidate, null, -1);
    });
    container.innerHTML = html;
}

function renderDiscussNext() {
    const container = document.getElementById('discuss-next-container');

    let currentCandidate = state.unranked.find(c => c.id === state.discussingCandidateId);
    if (!currentCandidate && state.unranked.length > 0) {
        currentCandidate = state.unranked[0];
        state.discussingCandidateId = currentCandidate.id;
    }

    if (!currentCandidate) {
        container.innerHTML = `
            <div class="discuss-next-title">
                <span></span>Discussion Complete
            </div>
            <div style="font-size: 12px; color: var(--text-secondary); text-align: center; padding: 12px 0; font-weight: 500;">
                All candidates are successfully calibrated on the ladder board!
            </div>
        `;
        return;
    }

    const avatar = getAvatarHtml(currentCandidate, 'discuss-' + currentCandidate.id);

    let actionButtonsHtml = '';
    bands.forEach(b => {
        const titleText = b.hasLimit ? `Rank 1st in ${b.name}` : `Add to ${b.name}`;
        actionButtonsHtml += `
            <button class="discuss-btn btn-promote-${b.id}" onclick="promoteDiscussing('${b.id}')" title="${escapeHtml(titleText)}">
                ${escapeHtml(b.shortName || b.name)}
            </button>
        `;
    });
    actionButtonsHtml += `<button class="discuss-btn discuss-skip-btn" onclick="skipDiscussingCandidate()">Skip / Discuss Next</button>`;

    container.innerHTML = `
        <div class="discuss-next-title">
            <span></span>Under Discussion
        </div>
        <div class="discuss-active-card">
            ${avatar}
            <div class="candidate-details" style="padding: 0; margin: 0; display: flex; flex-direction: column; align-items: center; width: 100%;">
                <div class="candidate-name" style="font-size: 18px; font-weight: 800; color: var(--text-primary); margin-bottom: 4px;">${escapeHtml(currentCandidate.name)}</div>
                <div class="candidate-counsellor" style="font-size: 13px; color: var(--text-secondary); margin-bottom: 4px;">Counsellor: <strong>${escapeHtml(currentCandidate.counsellor)}</strong></div>
                ${currentCandidate.email ? `<div class="candidate-email" style="font-size: 12px; color: var(--text-muted); font-family: monospace; word-break: break-all;">${escapeHtml(currentCandidate.email)}</div>` : ''}
                ${currentCandidate.comment ? `<div class="candidate-comment-box">${escapeHtml(currentCandidate.comment.replace(/^["']+|["']+$/g, ''))}</div>` : ''}
            </div>
        </div>
        <div class="discuss-active-actions">
            ${actionButtonsHtml}
        </div>
    `;

    // Also ensure active-discussion highlight is synced in the scrollable list
    document.querySelectorAll('.unranked-list-scroll .candidate-card').forEach(card => {
        if (card.id === currentCandidate.id) {
            card.classList.add('active-discussion');
        } else {
            card.classList.remove('active-discussion');
        }
    });
}

// ---------------------------------------------------------------------------------------------------------------
// Promotion Board
// ---------------------------------------------------------------------------------------------------------------

// Inserts a candidate into a list, ordered by their performance grade
function insertByGrade(list, candidate) {
    const grade = getPerformanceGrade(candidate);
    let insertIdx = list.findIndex(c => grade < getPerformanceGrade(c));
    if (insertIdx === -1) insertIdx = list.length;
    list.splice(insertIdx, 0, candidate);
}

// Star toggling and pool sync
function toggleStar(candidateId, event) {
    if (event) event.stopPropagation();

    const index = state.starredCandidateIds.indexOf(candidateId);
    const candidate = candidateById.get(candidateId);
    if (!candidate) return;

    if (index !== -1) {
        // Unstar (remove star)
        state.starredCandidateIds.splice(index, 1);

        // Remove from promotion buckets
        promoBuckets.forEach(b => {
            const list = state.promotionBands[b.id];
            const cIdx = list.findIndex(c => c.id === candidateId);
            if (cIdx !== -1) {
                list.splice(cIdx, 1);
            }
        });
    } else {
        // Star
        state.starredCandidateIds.push(candidateId);

        if (isTwoTierPromoMode()) {
            const expList = state.promotionBands['expected'];
            const potList = state.promotionBands['potential'];
            insertByGrade(expList.length < getPromoCapacity('expected') ? expList : potList, candidate);
        } else {
            // Place into the first bucket with capacity or the first uncapped bucket
            let targetBucket = promoBuckets.find(b => !b.hasLimit || state.promotionBands[b.id].length < getPromoCapacity(b.id));
            if (!targetBucket) {
                targetBucket = promoBuckets[promoBuckets.length - 1];
            }
            insertByGrade(state.promotionBands[targetBucket.id], candidate);
        }
    }

    cascadeOverflowPromotion();
    saveState();
    renderApp();
}

// Promotion view renderers
function renderPromotionLadder() {
    const twoTier = isTwoTierPromoMode();
    const showExpected = !twoTier || (getPromoCapacity('expected') > 0);

    promoBuckets.forEach(b => {
        const container = document.getElementById(`slots-promotion-${b.id}`);
        const countEl = document.getElementById(`count-promotion-${b.id}`);
        if (!container) return;

        const list = state.promotionBands[b.id];

        if (b.hasLimit) {
            const cap = getPromoCapacity(b.id);
            if (cap > 0) {
                let html = '';
                for (let i = 0; i < cap; i++) {
                    if (i < list.length) {
                        html += renderCard(list[i], `promotion-${b.id}`, i);
                    } else {
                        html += `
                            <div class="slot-box"
                                 style="border-color: ${b.colorBorder || '#fcd34d'}; background-color: ${b.colorLight || '#fffbeb'};"
                                 ondragover="handleDragOver(event)"
                                 ondragenter="handleDragEnter(event, this)"
                                 ondragleave="handleDragLeave(event, this)"
                                 ondrop="handleDrop(event, 'promotion-${b.id}', ${i})">
                                <span class="slot-rank-indicator" style="color: ${b.color || '#ca8a04'};">#${i + 1}</span>
                                Drop to Rank
                            </div>
                        `;
                    }
                }
                container.innerHTML = html;
                if (countEl) countEl.innerText = `${list.length} / ${cap}`;
            } else {
                container.innerHTML = '';
                if (countEl) countEl.innerText = `0 / 0`;
            }
        } else {
            let html = '';
            list.forEach((candidate, idx) => {
                html += renderCard(candidate, `promotion-${b.id}`, idx);
            });

            const isGoldenPot = (twoTier && b.id === 'potential' && !showExpected);
            const boxBorderColor = isGoldenPot ? '#fcd34d' : (b.colorBorder || '#cbd5e1');
            const boxBgColor = isGoldenPot ? '#fffbeb' : (b.colorLight || '#f8fafc');
            const textCol = isGoldenPot ? '#ca8a04' : (b.color || '#64748b');

            // Append trailing plus-slot dropzone
            html += `
                <div class="plus-slot"
                     style="border-color: ${boxBorderColor}; background-color: ${boxBgColor}; color: ${textCol};"
                     ondragover="handleDragOver(event)"
                     ondragenter="handleDragEnter(event, this)"
                     ondragleave="handleDragLeave(event, this)"
                     ondrop="handleDrop(event, 'promotion-${b.id}', ${list.length})">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: ${textCol};">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    Drop to Add (#${list.length + 1})
                </div>
            `;
            container.innerHTML = html;
            if (countEl) countEl.innerText = `${list.length}`;
        }
    });
}

function renderCandidatePool() {
    const container = document.getElementById('unranked-list');
    const searchVal = document.getElementById('search-input').value.trim().toLowerCase();

    // Get all candidates that are NOT starred, sorted alphabetically by name for easy searching
    const available = allCandidates.filter(c => !state.starredCandidateIds.includes(c.id)).sort(byName);
    const filtered = available.filter(c => matchesSearch(c, searchVal));

    if (filtered.length === 0) {
        if (available.length === 0) {
            container.innerHTML = `<div class="empty-state">All candidates are starred/promoted!</div>`;
        } else {
            container.innerHTML = `<div class="empty-state">No candidates match search criteria</div>`;
        }
        return;
    }

    let html = '';
    filtered.forEach(candidate => {
        html += renderCard(candidate, null, -1);
    });
    container.innerHTML = html;
}

const UNRANKED_GRADE = 999999;

// Helper to sort candidates based on performance band and rank
function getPerformanceGrade(candidate) {
    if (!candidate) return UNRANKED_GRADE;
    for (let bandIdx = 0; bandIdx < bands.length; bandIdx++) {
        const candIdx = state.bands[bands[bandIdx].id].findIndex(c => c.id === candidate.id);
        if (candIdx !== -1) {
            return bandIdx * 1000 + candIdx;
        }
    }
    return UNRANKED_GRADE;
}

// Promotion Board specific state adjusters
function changePromotionCapacity(bucketId, delta) {
    const bucket = promoBuckets.find(b => b.id === bucketId);
    if (!bucket || !bucket.hasLimit) return;

    const newVal = getPromoCapacity(bucketId) + delta;
    if (newVal < 0 || newVal > bucket.maxCapacity) return;

    state.promotionCapacities[bucketId] = newVal;

    cascadeOverflowPromotion();
    saveState();

    // Re-render skeletons to hide/show Expected row or update styles
    renderAll();
}

function cascadeOverflowPromotion(s = state) {
    const capacityOf = id => {
        const bucket = promoBuckets.find(b => b.id === id);
        return s.promotionCapacities[id] !== undefined ? s.promotionCapacities[id] : (bucket && bucket.hasLimit ? bucket.defaultCapacity : 0);
    };

    if (isTwoTierPromoMode()) {
        const expectedCap = capacityOf('expected');
        const expList = s.promotionBands['expected'];
        const potList = s.promotionBands['potential'];

        // 1. Downward cascade: Expected -> Potential
        while (expList.length > expectedCap) {
            const popped = expList.pop();
            potList.unshift(popped);
        }

        // 2. Upward cascade: Potential -> Expected
        while (expList.length < expectedCap && potList.length > 0) {
            const pulled = potList.shift();
            expList.push(pulled);
        }
    } else {
        // Downward sequential cascade for limited buckets
        for (let i = 0; i < promoBuckets.length - 1; i++) {
            const currentBucket = promoBuckets[i];
            const nextBucket = promoBuckets[i + 1];
            if (currentBucket.hasLimit) {
                const currentCap = capacityOf(currentBucket.id);
                const currentList = s.promotionBands[currentBucket.id];
                const nextList = s.promotionBands[nextBucket.id];
                while (currentList.length > currentCap) {
                    const popped = currentList.pop();
                    nextList.unshift(popped);
                }
            }
        }
    }
}

function moveCandidatePromotion(candidateId, targetBandId, targetIndex) {
    const promoBucketId = targetBandId.startsWith('promotion-') ? targetBandId.slice('promotion-'.length) : targetBandId;
    const targetList = state.promotionBands[promoBucketId];
    if (!targetList) return;

    let candidate = null;

    for (const b of promoBuckets) {
        const list = state.promotionBands[b.id];
        const idx = list.findIndex(c => c.id === candidateId);
        if (idx !== -1) {
            candidate = list.splice(idx, 1)[0];
            break;
        }
    }

    if (!candidate) {
        // Dragged from Candidate Pool (not starred yet)
        candidate = candidateById.get(candidateId);
        if (candidate && !state.starredCandidateIds.includes(candidateId)) {
            state.starredCandidateIds.push(candidateId);
        }
    }

    if (!candidate) return;

    let actualIndex = targetIndex;
    if (actualIndex > targetList.length || actualIndex === -1) {
        actualIndex = targetList.length;
    }
    targetList.splice(actualIndex, 0, candidate);

    cascadeOverflowPromotion();

    saveState();
    renderApp();
}

function unrankCandidatePromotion(candidateId) {
    for (const b of promoBuckets) {
        const list = state.promotionBands[b.id];
        const idx = list.findIndex(c => c.id === candidateId);
        if (idx !== -1) {
            list.splice(idx, 1);
            break;
        }
    }

    // Remove star
    const idx = state.starredCandidateIds.indexOf(candidateId);
    if (idx !== -1) {
        state.starredCandidateIds.splice(idx, 1);
    }

    cascadeOverflowPromotion();
    saveState();
    renderApp();
}

function autoFillPromotion() {
    const limitedWithSpace = promoBuckets.filter(b => b.hasLimit && getPromoCapacity(b.id) > state.promotionBands[b.id].length);
    if (limitedWithSpace.length === 0) return;

    // Only candidates already ranked on the Performance Board are eligible, best first
    const available = allCandidates
        .filter(c => !state.starredCandidateIds.includes(c.id) && getPerformanceGrade(c) !== UNRANKED_GRADE)
        .sort((a, b) => getPerformanceGrade(a) - getPerformanceGrade(b));
    if (available.length === 0) {
        alert('No ranked, unstarred candidates are available. Rank candidates on the Performance Board first.');
        return;
    }

    limitedWithSpace.forEach(b => {
        const cap = getPromoCapacity(b.id);
        const list = state.promotionBands[b.id];
        while (list.length < cap && available.length > 0) {
            const candidate = available.shift();
            state.starredCandidateIds.push(candidate.id);
            list.push(candidate);
        }
        list.sort((a, b) => getPerformanceGrade(a) - getPerformanceGrade(b));
    });

    cascadeOverflowPromotion();
    saveState();
    renderApp();
}

function clearPromotionLadder() {
    const hasAny = promoBuckets.some(b => state.promotionBands[b.id].length > 0);
    if (!hasAny && state.starredCandidateIds.length === 0) return;
    if (!confirm("Are you sure you want to clear the promotion ladders? Candidates will lose their starred promotion status.")) return;

    promoBuckets.forEach(b => {
        state.promotionBands[b.id] = [];
    });
    state.starredCandidateIds = [];

    saveState();
    renderApp();
}

// ---------------------------------------------------------------------------------------------------------------
// Sidebar statistics
// ---------------------------------------------------------------------------------------------------------------

function renderCounsellorBreakdown() {
    const container = document.getElementById('counsellor-breakdown');
    const counts = {};

    function getCounsellorBucket(counsellor) {
        if (!counts[counsellor]) {
            counts[counsellor] = {
                performance: {},
                unranked: 0,
                promo: {}
            };
            bands.forEach(b => {
                counts[counsellor].performance[b.id] = 0;
            });
            promoBuckets.forEach(b => {
                counts[counsellor].promo[b.id] = 0;
            });
        }
        return counts[counsellor];
    }

    state.unranked.forEach(c => {
        getCounsellorBucket(c.counsellor).unranked++;
    });
    bands.forEach(b => {
        state.bands[b.id].forEach(c => {
            getCounsellorBucket(c.counsellor).performance[b.id]++;
        });
    });

    promoBuckets.forEach(b => {
        state.promotionBands[b.id].forEach(c => {
            getCounsellorBucket(c.counsellor).promo[b.id]++;
        });
    });

    const sortedCounsellors = Object.keys(counts).sort((a, b) => a.localeCompare(b));

    if (sortedCounsellors.length === 0) {
        container.innerHTML = `<div class="empty-state" style="padding: 12px; border-radius: 8px;">No counsellor data</div>`;
        return;
    }

    let html = '';
    sortedCounsellors.forEach(counsellor => {
        const data = counts[counsellor];

        if (currentView === 'performance') {
            let bandPills = '';
            bands.forEach(b => {
                const count = data.performance[b.id];
                if (count > 0) {
                    bandPills += `<span class="counsellor-pill pill-${b.id}" title="${escapeHtml(b.name)}: ${count}">${count} ${escapeHtml(b.shortName || b.name)}</span> `;
                }
            });

            const remainingText = data.unranked > 0 ? `<div style="font-size: 10px; color: var(--text-muted); margin-top: 3px; font-weight: 500;">${data.unranked} remaining unranked</div>` : '';

            html += `
                <div class="counsellor-stat-item">
                    <div class="counsellor-name">${escapeHtml(counsellor)}</div>
                    <div class="counsellor-bands">
                        ${bandPills || '<span style="font-size:10px; color:var(--text-muted); font-weight: 500;">None ranked</span>'}
                    </div>
                    ${remainingText}
                </div>
            `;
        } else {
            let pills = '';
            if (isTwoTierPromoMode()) {
                const showExpected = getPromoCapacity('expected') > 0;
                const expCount = data.promo['expected'] || 0;
                const potCount = data.promo['potential'] || 0;
                if (expCount > 0 && showExpected) {
                    pills += `<span class="counsellor-pill" style="background-color: #ca8a04; color: #ffffff;" title="Expected Promotions: ${expCount}">${expCount} Expected</span> `;
                }
                if (potCount > 0) {
                    const potColor = showExpected ? '#94a3b8' : '#ca8a04';
                    const potLabel = showExpected ? 'Potential' : 'Promoted';
                    pills += `<span class="counsellor-pill" style="background-color: ${potColor}; color: #ffffff;" title="Potential Promotions: ${potCount}">${potCount} ${potLabel}</span> `;
                }
            } else {
                promoBuckets.forEach(b => {
                    const count = data.promo[b.id] || 0;
                    if (count > 0) {
                        pills += `<span class="counsellor-pill" style="background-color: ${b.color || '#64748b'}; color: #ffffff;" title="${escapeHtml(b.name)}: ${count}">${count} ${escapeHtml(b.shortName || b.name)}</span> `;
                    }
                });
            }

            html += `
                <div class="counsellor-stat-item">
                    <div class="counsellor-name">${escapeHtml(counsellor)}</div>
                    <div class="counsellor-bands">
                        ${pills || '<span style="font-size:10px; color:var(--text-muted); font-weight: 500;">None starred</span>'}
                    </div>
                </div>
            `;
        }
    });
    container.innerHTML = html;
}

// Header statistics
function renderHeaderStats() {
    const container = document.getElementById('header-stats');
    const total = allCandidates.length;

    if (currentView === 'performance') {
        const rankedCount = total - state.unranked.length;
        const pct = total > 0 ? Math.round((rankedCount / total) * 100) : 0;

        container.innerHTML = `
            <div class="stat-item">Appraisal Progress: <span class="stat-val">${rankedCount} / ${total} (${pct}%)</span></div>
            <div class="stat-item">Unranked Remaining: <span class="stat-val">${state.unranked.length}</span></div>
        `;
    } else {
        if (isTwoTierPromoMode()) {
            const expectedCount = state.promotionBands['expected'].length;
            const potentialCount = state.promotionBands['potential'].length;
            const expCap = getPromoCapacity('expected');
            const showExpected = (expCap > 0);

            if (showExpected) {
                container.innerHTML = `
                    <div class="stat-item">Expected: <span class="stat-val" style="background: #fef08a; border-color: #f59e0b; color: #ca8a04;">${expectedCount} / ${expCap}</span></div>
                    <div class="stat-item">Potential: <span class="stat-val" style="background: #f1f5f9; border-color: #cbd5e1; color: #475569;">${potentialCount}</span></div>
                `;
            } else {
                container.innerHTML = `
                    <div class="stat-item">Promoted: <span class="stat-val" style="background: #fef08a; border-color: #f59e0b; color: #ca8a04;">${potentialCount}</span></div>
                `;
            }
        } else {
            let html = '';
            promoBuckets.forEach(b => {
                const count = state.promotionBands[b.id].length;
                const valStr = b.hasLimit ? `${count} / ${getPromoCapacity(b.id)}` : `${count}`;
                html += `<div class="stat-item">${escapeHtml(b.shortName || b.name)}: <span class="stat-val" style="background: ${b.colorLight || '#f1f5f9'}; border-color: ${b.colorBorder || '#cbd5e1'}; color: ${b.color || '#475569'};">${valStr}</span></div>`;
            });
            container.innerHTML = html;
        }
    }
}

// HTML escaping helper (safe for element content and quoted attribute values)
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, "&amp;")
                      .replace(/</g, "&lt;")
                      .replace(/>/g, "&gt;")
                      .replace(/"/g, "&quot;")
                      .replace(/'/g, "&#039;");
}

// ---------------------------------------------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------------------------------------------

// Builds the plain-text export of the given view, with global 1-to-n indexing across all bands/rows
function buildExportText(view = currentView) {
    const title = CONFIG.title || 'LADDERATER';
    let text = '';
    let globalIdx = 1;

    const appendCandidates = (list, emptyText) => {
        if (list.length === 0) {
            text += `  ${emptyText}\n`;
            return;
        }
        list.forEach(c => {
            text += `  ${globalIdx}. ${c.name} (Counsellor: ${c.counsellor})\n`;
            globalIdx++;
        });
    };

    if (view === 'performance') {
        text += `${title} - Performance Board\n`;
        text += `===================================\n\n`;
        bands.forEach((b, idx) => {
            const heading = `${idx + 1}. ${b.name.toUpperCase()}`;
            text += `${heading}\n${'-'.repeat(heading.length)}\n`;
            appendCandidates(state.bands[b.id], '(No candidates ranked)');
            text += `\n`;
        });
        return text;
    }

    text += `${title} - Promotion Board\n`;
    text += `=================================\n\n`;

    let sections;
    if (isTwoTierPromoMode()) {
        sections = getPromoCapacity('expected') > 0
            ? [['EXPECTED PROMOTIONS', state.promotionBands['expected']], ['POTENTIAL PROMOTIONS', state.promotionBands['potential']]]
            : [['PROMOTIONS (UNCAPPED)', state.promotionBands['potential']]];
    } else {
        sections = promoBuckets.map(b => [b.name.toUpperCase(), state.promotionBands[b.id]]);
    }
    sections.forEach(([heading, list], idx) => {
        text += `${heading}\n${'-'.repeat(heading.length)}\n`;
        appendCandidates(list, '(No candidates allocated)');
        if (idx < sections.length - 1) {
            text += `\n`;
        }
    });
    return text;
}

function exportToClipboard() {
    copyTextToClipboard(buildExportText())
        .then(showExportFeedback)
        .catch(err => {
            console.error('Failed to copy text to clipboard: ', err);
            alert('Failed to copy ordered list to clipboard.');
        });
}

// Uses the async Clipboard API where available, falling back to execCommand for insecure contexts (e.g. http://)
function copyTextToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text).catch(() => legacyCopyText(text));
    }
    return legacyCopyText(text);
}

function legacyCopyText(text) {
    return new Promise((resolve, reject) => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.top = '-1000px';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        let copied = false;
        try {
            copied = document.execCommand('copy');
        } catch (e) {
            copied = false;
        }
        document.body.removeChild(textarea);
        if (copied) {
            resolve();
        } else {
            reject(new Error('Copy command was rejected by the browser'));
        }
    });
}

function showExportFeedback() {
    const btn = document.getElementById('btn-export-list');
    if (!btn) return;

    // Capture the original markup once, so repeated clicks can't leave the button stuck on "Copied!"
    if (exportButtonOriginalHtml === null) {
        exportButtonOriginalHtml = btn.innerHTML;
    }
    clearTimeout(exportFeedbackTimer);

    btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Copied!
    `;
    btn.style.color = '#166534';
    btn.style.backgroundColor = '#f0fdf4';
    btn.style.borderColor = '#bbf7d0';

    exportFeedbackTimer = setTimeout(() => {
        btn.innerHTML = exportButtonOriginalHtml;
        btn.style.color = '';
        btn.style.backgroundColor = '';
        btn.style.borderColor = '';
    }, 2000);
}
