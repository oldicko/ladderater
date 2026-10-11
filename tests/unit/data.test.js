'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../../src/lib/data.js');

test('parseCsv handles quotes, embedded commas/newlines, CRLF and BOM', () => {
    const rows = D.parseCsv('\uFEFFa,b\r\n"x, y","he said ""hi""\nthere"\r\n\r\n');
    assert.deepEqual(rows, [['a', 'b'], ['x, y', 'he said "hi"\nthere']]);
});

test('candidatesFromCsv requires Name and Counsellor and skips blank names', () => {
    assert.throws(() => D.candidatesFromCsv('Name,Email\nA,a@x'), /Counsellor/);
    const { candidates, warnings } = D.candidatesFromCsv('name,counsellor,Comment\nAmy,Bo,Great\n,Bo,\nAmy,Bo,again');
    assert.equal(candidates.length, 2);
    assert.deepEqual(candidates[0], { Name: 'Amy', Counsellor: 'Bo', Email: null, Comment: 'Great', Photo: null });
    assert.equal(warnings.length, 2);
});

test('validateConfig accepts the shipped config and rejects bad ids', () => {
    const text = fs.readFileSync(path.join(__dirname, '../../config.json'), 'utf8');
    assert.ok(D.validateConfig(text).config.bands.length > 0);
    assert.throws(() => D.validateConfig('{'), /valid JSON/);
    assert.throws(() => D.validateConfig({ bands: [] }), /non-empty/);
    assert.throws(() => D.validateConfig({ bands: [{ id: 'a b', name: 'x' }] }), /invalid id/);
    assert.throws(() => D.validateConfig({ bands: [{ id: 'a' }, { id: 'a' }] }), /Duplicate/);
    assert.throws(() => D.validateConfig({ bands: [{ id: 'a', hasLimit: true }] }), /defaultCapacity/);
});

test('scriptSafeJson cannot close a script tag', () => {
    assert.ok(!D.scriptSafeJson({ x: '</script><script>alert(1)</script>' }).includes('<'));
});
