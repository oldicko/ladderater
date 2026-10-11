/*
 * Ladderater web version: startup screen and data loading. Everything happens in the browser; no data is sent
 * anywhere. Loaded after app.js in dist/index.html only. Relies on globals defined by the web build:
 * INITIAL_CANDIDATES / CONFIG (start as null), SAMPLE_CSV, SAMPLE_CONFIG, STANDALONE_TEMPLATE, LadderaterData.
 */
(function () {
    'use strict';
    const DATASET_KEY = 'ladderater_web_dataset';
    const D = window.LadderaterData;

    function $(id) { return document.getElementById(id); }

    function readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file, 'utf-8');
        });
    }

    function showMessage(text, kind) {
        const el = $('startup-message');
        el.textContent = text;
        el.className = 'startup-message ' + (kind || '');
        el.hidden = !text;
    }

    function saveDataset(candidates, config) {
        try {
            window.localStorage.setItem(DATASET_KEY, JSON.stringify({ candidates, config }));
        } catch (e) {
            console.warn('Could not save the dataset in this browser', e);
        }
    }

    function loadDataset() {
        try {
            const raw = window.localStorage.getItem(DATASET_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || !Array.isArray(parsed.candidates)) return null;
            D.validateConfig(parsed.config);
            return parsed;
        } catch (e) {
            return null;
        }
    }

    function startBoard(candidates, config, savedBoard) {
        INITIAL_CANDIDATES = candidates;
        CONFIG = config;
        saveDataset(candidates, config);
        $('startup-screen').hidden = true;
        document.querySelector('.app-container').hidden = false;
        init();
        if (savedBoard) applySavedState(savedBoard);
        addWebButtons();
    }

    function startFromInputs() {
        try {
            const { candidates, warnings } = D.candidatesFromCsv($('startup-csv').value);
            if (candidates.length === 0) throw new D.DataError('Add at least one candidate (CSV with Name and Counsellor columns).');
            const { config, warnings: configWarnings } = D.validateConfig($('startup-config').value);
            const all = warnings.concat(configWarnings);
            if (all.length) console.warn('Ladderater warnings:\n' + all.join('\n'));
            startBoard(candidates, config, null);
        } catch (e) {
            showMessage(e.message, 'error');
        }
    }

    function importBoardText(text) {
        let snap;
        try { snap = JSON.parse(text); } catch (e) { throw new D.DataError('That file is not valid JSON.'); }
        if (!snap || snap.format !== 'ladderater-board' || !Array.isArray(snap.candidates)) {
            throw new D.DataError('That file is not a Ladderater board export.');
        }
        const { config } = D.validateConfig(snap.config);
        startBoard(snap.candidates, config, snap.board);
    }

    function downloadStandalone() {
        const html = STANDALONE_TEMPLATE
            .replace('{{CANDIDATES_JSON}}', () => D.scriptSafeJson(INITIAL_CANDIDATES))
            .replace('{{CONFIG_JSON}}', () => D.scriptSafeJson(CONFIG));
        downloadTextFile(`${exportFileBase()}.html`, html, 'text/html;charset=utf-8');
    }

    function changeData() {
        if (!confirm('Return to the start screen? Your rankings stay saved in this browser and come back if you load the same data again. Use "Save Board" first if you want a copy.')) return;
        try { window.localStorage.removeItem(DATASET_KEY); } catch (e) { /* ignore */ }
        window.location.reload();
    }

    function addWebButtons() {
        const menu = $('file-menu-items');
        if (!menu || $('btn-download-offline')) return;
        const make = (id, label, title, handler) => {
            const b = document.createElement('button');
            b.className = 'file-menu-item';
            b.id = id;
            b.textContent = label;
            b.title = title;
            b.addEventListener('click', () => { $('file-menu').open = false; handler(); });
            menu.appendChild(b);
        };
        make('btn-download-offline', 'Download offline HTML', 'Download this board as a single self-contained HTML file that works offline', downloadStandalone);
        make('btn-change-data', 'Change data…', 'Go back to the start screen to load different data', changeData);
    }

    function wireStartup() {
        $('startup-config').value = SAMPLE_CONFIG;
        $('startup-csv-file').addEventListener('change', async e => {
            const f = e.target.files[0];
            if (f) $('startup-csv').value = await readFile(f);
        });
        $('startup-config-file').addEventListener('change', async e => {
            const f = e.target.files[0];
            if (f) $('startup-config').value = await readFile(f);
        });
        $('startup-sample').addEventListener('click', () => {
            $('startup-csv').value = SAMPLE_CSV;
            $('startup-config').value = SAMPLE_CONFIG;
            showMessage('Sample data loaded (fictional people). Press "Start Board".', 'info');
        });
        $('startup-reset-config').addEventListener('click', () => { $('startup-config').value = SAMPLE_CONFIG; });
        $('startup-start').addEventListener('click', startFromInputs);
        $('startup-import-file').addEventListener('change', async e => {
            const f = e.target.files[0];
            if (!f) return;
            try { importBoardText(await readFile(f)); }
            catch (err) { showMessage(err.message, 'error'); }
            e.target.value = '';
        });
    }

    window.addEventListener('DOMContentLoaded', () => {
        wireStartup();
        const saved = loadDataset();
        if (saved) {
            startBoard(saved.candidates, saved.config, null);
        } else {
            $('startup-screen').hidden = false;
            document.querySelector('.app-container').hidden = true;
        }
    });

    // Exposed for tests
    window.LadderaterWeb = { importBoardText, downloadStandalone };
}());
