// The Actual-V9 producer and reader each carry FINITE_V10_PINS and a table of
// Circuit UI identity witnesses (size + sha256 of selected installed files).
// Pin moves have twice re-stamped FINITE_V10_PINS without re-measuring the
// witnesses, and the stale table was only discovered when a one-shot hosted
// event refused node_modules/bw-circuit-ui/LANES.md. This gate fails on the
// pin move itself: the witnesses must equal the bytes npm installed for the
// current canonical Circuit UI pin.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = file => fs.readFileSync(root + file, 'utf8');
const SOURCES = ['scripts/run-i80386-hdd-gui-actual.py', 'scripts/read-i80386-hdd-gui-originals.py'];

const pinsOf = text => {
    const match = /^FINITE_V10_PINS = \{([^}]*)\}/m.exec(text);
    assert.ok(match, 'FINITE_V10_PINS declaration');
    return Object.fromEntries([...match[1].matchAll(/'([^']+)':'([0-9a-f]{40})'/g)].map(m => [m[1], m[2]]));
};
const witnessesOf = text => {
    const start = text.indexOf('FINITE_V10_CUI_WITNESSES = {');
    assert.ok(start >= 0, 'FINITE_V10_CUI_WITNESSES declaration');
    const block = text.slice(start, text.indexOf('}\n', start));
    const rows = [...block.matchAll(/'(node_modules\/bw-circuit-ui\/[^']+)':\((\d+), ?'([0-9a-f]{64})'\)/g)];
    assert.ok(rows.length > 0, 'nonempty witness table');
    return rows.map(m => ({path: m[1], bytes: Number(m[2]), sha256: m[3]}));
};

test('V10 Circuit UI pin equals the canonical vendor pin in producer and reader', () => {
    const canonical = JSON.parse(read('vendor-pins.json'))['bw-circuit-ui'];
    for (const file of SOURCES) assert.equal(pinsOf(read(file))['bw-circuit-ui'], canonical, file);
});

test('V10 Circuit UI witnesses equal the installed bytes of the current pin', () => {
    const installed = JSON.parse(read('node_modules/bw-circuit-ui/package.json'));
    assert.ok(installed.name, 'bw-circuit-ui is installed');
    const tables = SOURCES.map(file => witnessesOf(read(file)));
    assert.deepEqual(tables[0], tables[1], 'producer and reader witness tables are identical');
    for (const {path, bytes, sha256} of tables[0]) {
        const raw = fs.readFileSync(root + path);
        assert.deepEqual({bytes: raw.length, sha256: createHash('sha256').update(raw).digest('hex')},
            {bytes, sha256}, path + ' is stale against the current Circuit UI pin; re-measure FINITE_V10_CUI_WITNESSES');
    }
});
