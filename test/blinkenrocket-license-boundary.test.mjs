import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const example = path.join(root, 'overlay/scratch-gui/examples/blinkenrocket-pendant');
const read = name => readFileSync(path.join(example, name), 'utf8');

const connected = (circuit, a, at, b, bt) => circuit.wires.some(wire =>
    (wire.from === a && wire.fromTerminal === at && wire.to === b && wire.toTerminal === bt) ||
    (wire.from === b && wire.fromTerminal === bt && wire.to === a && wire.toTerminal === at));

test('Blinkenrocket example models the real package, EEPROM and audio input', () => {
    const circuit = JSON.parse(read('circuit.json'));
    const parts = new Map(circuit.parts.map(part => [part.id, part]));

    assert.equal(parts.get('attiny881')?.kind, 'attiny88_qfn32');
    assert.equal(parts.get('eeprom')?.kind, 'at24c64');
    assert.equal(parts.get('modemIn')?.kind, 'vsource');
    assert.equal(parts.get('modemIn')?.params?.wave, 'pcm');
    assert.equal(parts.has('bb1'), false, 'a QFN/TQFP device must not be seated in a DIP breadboard');
    assert.deepEqual(circuit.holeWires, []);

    assert.ok(connected(circuit, 'modemIn', 'pos', 'attiny881', 'pa0'));
    assert.ok(connected(circuit, 'attiny881', 'pc4', 'eeprom', 'sda'));
    assert.ok(connected(circuit, 'attiny881', 'pc5', 'eeprom', 'scl'));
    for (const terminal of ['a0', 'a1', 'a2', 'wp', 'gnd']) {
        assert.ok(connected(circuit, 'gnd1', 'gnd', 'eeprom', terminal),
            `EEPROM ${terminal} is strapped low`);
    }
});

test('Blinkenrocket GPL firmware stays external and the shipped program states its licence', () => {
    const forbidden = /\.(?:hex|elf|eep|bin|o|a|c|cc|cpp|h)$/i;
    const artefacts = readdirSync(example, {recursive: true})
        .map(String).filter(name => forbidden.test(name));
    assert.deepEqual(artefacts, [], `firmware/source artefacts in example: ${artefacts.join(', ')}`);
    assert.match(read('program.bw'), /^# SPDX-License-Identifier: BSD-3-Clause\n/);
    assert.match(read('PROVENANCE.md'), /does \*\*not\*\* contain or bundle the GPL-licensed Blinkenrocket/);
    assert.match(read('PROVENANCE.md'), /not as a formally supervised “clean-room” rewrite/);
});

test('debugger feeds the permissive modem encoder into the circuit instead of embedding firmware', () => {
    const runner = readFileSync(path.join(root,
        'overlay/scratch-gui/src/lib/bw-debug/debug-runner.js'), 'utf8');
    const panel = readFileSync(path.join(root,
        'overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx'), 'utf8');
    assert.match(runner, /'bw-board\/blinkenrocket-modem\.js'/);
    assert.match(runner, /runner\.sendBlinkenrocket = async/);
    assert.match(runner, /setPartParam\('modemIn', 'start', start\)/);
    assert.match(panel, /data-testid="bw-blinkenrocket-modem"/);
    assert.doesNotMatch(runner, /blinkenrocket[^'"\n]*\.(?:hex|elf|bin)/i);
});
