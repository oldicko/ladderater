'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, BANDS, people } = require('./helpers');

const perfConfig = { bands: BANDS, enablePromotions: false };

test('dropping into a full capped band pushes its last candidate down to the next band', () => {
    const app = loadApp(perfConfig, people(4));
    app.place('Person A', 'top');
    app.place('Person B', 'top');
    app.place('Person C', 'top', 0);
    assert.deepEqual(app.names('bands.top'), ['Person C', 'Person A']);
    assert.deepEqual(app.names('bands.strong'), ['Person B']);
});

test('overflow cascades through several capped bands into the first uncapped band', () => {
    const app = loadApp(perfConfig, people(6));
    ['Person A', 'Person B'].forEach(n => app.place(n, 'top'));
    ['Person C', 'Person D'].forEach(n => app.place(n, 'strong'));
    app.place('Person E', 'top', 0);
    assert.deepEqual(app.names('bands.top'), ['Person E', 'Person A']);
    assert.deepEqual(app.names('bands.strong'), ['Person B', 'Person C']);
    assert.deepEqual(app.names('bands.core'), ['Person D']);
    assert.deepEqual(app.names('bands.needs'), []);
});

test('uncapped bands never overflow', () => {
    const app = loadApp(perfConfig, people(6));
    people(6).forEach(p => app.place(p.Name, 'core'));
    assert.equal(app.names('bands.core').length, 6);
    assert.equal(app.names('unranked').length, 0);
});

test('reducing slots cascades the excess down, keeping strict order', () => {
    const app = loadApp(perfConfig, people(4));
    ['Person A', 'Person B'].forEach(n => app.place(n, 'top'));
    app.run("(state.capacities.top = 1, cascadeOverflow())");
    assert.deepEqual(app.names('bands.top'), ['Person A']);
    assert.deepEqual(app.names('bands.strong'), ['Person B']);
});

test('moving a candidate within the board never duplicates them', () => {
    const app = loadApp(perfConfig, people(3));
    app.place('Person A', 'top');
    app.place('Person A', 'core');
    app.place('Person A', 'strong');
    const all = app.run('Object.values(state.bands).flat().concat(state.unranked).map(c => c.name)');
    assert.equal(all.length, 3);
    assert.equal(new Set(all).size, 3);
    assert.deepEqual(app.names('bands.strong'), ['Person A']);
});

test('two-tier promotions: Expected overflows to Potential and pulls back up when space frees', () => {
    const app = loadApp({ bands: BANDS, enablePromotions: true, defaultExpectedSpaces: 1, maxExpectedSpaces: 5 }, people(3));
    app.star('Person A');
    app.star('Person B');
    assert.deepEqual(app.names('promotionBands.expected'), ['Person A']);
    assert.deepEqual(app.names('promotionBands.potential'), ['Person B']);
    app.star('Person A'); // unstar
    assert.deepEqual(app.names('promotionBands.expected'), ['Person B']);
    assert.deepEqual(app.names('promotionBands.potential'), []);
});

test('multi-bucket promotions cascade downwards only', () => {
    const buckets = [
        { id: 'now', name: 'Now', hasLimit: true, defaultCapacity: 1, maxCapacity: 3 },
        { id: 'soon', name: 'Soon', hasLimit: true, defaultCapacity: 1, maxCapacity: 3 },
        { id: 'later', name: 'Later', hasLimit: false }
    ];
    const app = loadApp({ bands: BANDS, enablePromotions: true, promotionBuckets: buckets }, people(4));
    ['Person A', 'Person B', 'Person C'].forEach(app.star);
    assert.deepEqual(app.names('promotionBands.now'), ['Person A']);
    assert.deepEqual(app.names('promotionBands.soon'), ['Person B']);
    assert.deepEqual(app.names('promotionBands.later'), ['Person C']);
    app.star('Person A'); // unstar: no upward pull in multi-bucket mode
    assert.deepEqual(app.names('promotionBands.now'), []);
    assert.deepEqual(app.names('promotionBands.soon'), ['Person B']);
});

test('CSV export lists every candidate with band and rank', () => {
    const app = loadApp(perfConfig, [{ Name: 'Zoë, "Z"', Counsellor: 'C' }, { Name: 'Amy', Counsellor: 'C' }]);
    app.place('Zoë, "Z"', 'top');
    const csv = app.run('buildExportCsv()').trim().split('\r\n');
    assert.equal(csv[0], 'Name,Counsellor,Email,Performance Rank,Performance Band,Promotion Rank,Promotion Bucket');
    assert.equal(csv[1], '"Zoë, ""Z""",C,,1,Top,,');
    assert.equal(csv[2], 'Amy,C,,,Unranked,,');
});
