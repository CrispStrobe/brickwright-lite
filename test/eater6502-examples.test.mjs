import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const examples = resolve(here, '../overlay/scratch-gui/examples');

test('eater6502-bench circuit extracts without contention', async () => {
    const circuitPath = resolve(examples, 'eater6502-bench/circuit.json');
    assert.ok(existsSync(circuitPath), 'circuit.json missing');
    const circuit = JSON.parse(readFileSync(circuitPath, 'utf8'));
    const { extract6502Machine } = await import(
        '../overlay/scratch-gui/src/lib/bw-board/m6502-extract.js'
    );
    const r = extract6502Machine(circuit);
    assert.ok(r.ok, `expected ok, got reasons: ${r.reasons.join('; ')}`);
    assert.ok(r.regions.some(reg => reg.kind === 'ram'), 'expected RAM region');
    assert.ok(r.regions.some(reg => reg.kind === 'rom'), 'expected ROM region');
});

test('eater6502-bench has intro.md with address-decode teaches tag', () => {
    const intro = readFileSync(resolve(examples, 'eater6502-bench/intro.md'), 'utf8');
    assert.ok(intro.includes('address-decode'), 'teaches missing address-decode');
    assert.ok(intro.includes('What you see'), 'missing What you see section');
    const introDE = readFileSync(resolve(examples, 'eater6502-bench/intro.de.md'), 'utf8');
    assert.ok(introDE.includes('address-decode'), 'DE teaches missing address-decode');
    assert.ok(introDE.includes('Was du siehst'), 'DE missing Was du siehst section');
});

test('eater6502-contention-bug circuit produces a contention error', async () => {
    const circuitPath = resolve(examples, 'eater6502-contention-bug/circuit.json');
    assert.ok(existsSync(circuitPath), 'circuit.json missing');
    const circuit = JSON.parse(readFileSync(circuitPath, 'utf8'));
    const { extract6502Machine } = await import(
        '../overlay/scratch-gui/src/lib/bw-board/m6502-extract.js'
    );
    const r = extract6502Machine(circuit);
    assert.equal(r.ok, false, 'expected the contention bug to be caught');
    const joined = r.reasons.join(';');
    assert.ok(/bus contention/.test(joined), `expected "bus contention" in reasons: ${joined}`);
    assert.ok(/\$[0-9a-fA-F]{4}/.test(joined), 'expected a hex address in the contention reason');
});

test('eater6502-contention-bug has intro.md with bus-contention teaches tag', () => {
    const intro = readFileSync(resolve(examples, 'eater6502-contention-bug/intro.md'), 'utf8');
    assert.ok(intro.includes('bus-contention'), 'teaches missing bus-contention');
    assert.ok(intro.includes('What you see'), 'missing What you see section');
    const introDE = readFileSync(resolve(examples, 'eater6502-contention-bug/intro.de.md'), 'utf8');
    assert.ok(introDE.includes('bus-contention'), 'DE teaches missing bus-contention');
    assert.ok(introDE.includes('Was du siehst'), 'DE missing Was du siehst section');
});
