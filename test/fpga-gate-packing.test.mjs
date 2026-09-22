// Gates are bought in PACKAGES, and the board should say so.
//
// A 74HC86 is a QUAD XOR: four gates in one 14-pin part. Realising each gate as
// its own whole chip made a 4-bit adder twenty packages when it is really five,
// which meant the parts list the Circuit tab generates — a correct list of what
// was on the board — described a board nobody would build.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {boot} from '../scripts/lesson-bench.mjs';
import {buildLogicIcCircuit, IC_CIRCUITS} from '../overlay/scratch-gui/src/lib/bw-fpga/logic-ic-circuit.js';
import {icGatePins, gatesPerPackage, gateToLogicIc, LOGIC_IC_GATES} from '../overlay/scratch-gui/src/lib/bw-fpga/logic-ic.js';
// Direct path, not the bare specifier: the package's export map rewrites
// bw-circuit-ui/src/* to src/src/*. lesson-bench.mjs reaches it the same way.
import {generateBom, bomToCsv} from '../node_modules/bw-circuit-ui/src/model/bom.js';

const {Circuit} = await boot();

// ── The slot pins are real pins, not invented ones ─────────────────────────

test('every gate slot lands on pins the part actually has', () => {
    // The whole packing idea rests on 2a/2b/2y existing. Check it against the
    // vendor's own sidecar rather than trusting the naming convention.
    for (const type of LOGIC_IC_GATES) {
        const spec = gateToLogicIc(type);
        const side = JSON.parse(readFileSync(
            new URL(`../node_modules/bw-circuit-ui/src/parts-data/${spec.chip}.json`, import.meta.url), 'utf8'));
        const terminals = new Set(side.terminals.map(t => t.name.toLowerCase()));
        for (let slot = 1; slot <= gatesPerPackage(type); slot++) {
            const pins = icGatePins(type, slot);
            for (const pin of [...pins.inputs, pins.output]) {
                assert.ok(terminals.has(pin), `${spec.label} has no pin ${pin} (gate ${slot})`);
            }
        }
    }
});

test('asking for a gate the package does not have is refused', () => {
    assert.throws(() => icGatePins('xor', 5), /4 gates/, 'a quad has no gate 5');
    assert.throws(() => icGatePins('not', 7), /6 gates/, 'a hex has no gate 7');
    assert.throws(() => icGatePins('and', 0), /no gate 0/);
});

test('the quad/hex counts match what the sidecars model', () => {
    for (const type of LOGIC_IC_GATES) {
        const spec = gateToLogicIc(type);
        const side = JSON.parse(readFileSync(
            new URL(`../node_modules/bw-circuit-ui/src/parts-data/${spec.chip}.json`, import.meta.url), 'utf8'));
        const slots = new Set();
        for (const t of side.terminals) {
            const m = /^(\d)y$/i.exec(t.name);
            if (m) slots.add(m[1]);
        }
        assert.equal(gatesPerPackage(type), slots.size,
            `${spec.label}: declared ${gatesPerPackage(type)} gates, sidecar models ${slots.size}`);
    }
});

// ── Packing does what it says ──────────────────────────────────────────────

test('gates of the same type share a package until it is full', () => {
    const c = new Circuit(5.0);
    // Nine XOR gates: four, four, one — three packages, and only the last spare.
    const gates = [];
    for (let i = 0; i < 9; i++) gates.push({type: 'xor', in: ['a', 'b'], out: `y${i}`});
    const built = buildLogicIcCircuit(c, {id: 'nine', inputs: ['a', 'b'], gates, outputs: ['y0']});
    assert.equal(built.packages.length, 3, 'nine quad gates need three packages');
    assert.deepEqual(built.packages.map(p => p.used), [4, 4, 1], 'filled in order');
});

test('different gate types never share a package', () => {
    const c = new Circuit(5.0);
    const built = buildLogicIcCircuit(c, IC_CIRCUITS.half_adder);
    assert.equal(built.packages.length, 2, 'an XOR and an AND cannot be the same part');
    assert.deepEqual(built.packages.map(p => p.kind).sort(), ['74hc08', '74hc86']);
});

test('packages are named U1, U2, … like a schematic', () => {
    const c = new Circuit(5.0);
    const built = buildLogicIcCircuit(c, IC_CIRCUITS.ripple_adder_4);
    assert.deepEqual(built.packages.map(p => p.ref), ['U1', 'U2', 'U3', 'U4', 'U5']);
    for (const pk of built.packages) {
        assert.equal(c.parts.find(p => p.id === pk.id).declName, pk.ref, 'and the part carries it');
    }
});

test('each gate records which package and slot it landed in', () => {
    const c = new Circuit(5.0);
    const built = buildLogicIcCircuit(c, IC_CIRCUITS.full_adder);
    for (const g of built.chips) {
        assert.ok(g.ref, `${g.out} must say which package it is in`);
        assert.ok(g.slot >= 1, `${g.out} must say which gate of it`);
    }
    // No two gates may claim the same slot of the same package.
    const seats = built.chips.map(g => `${g.ref}:${g.slot}`);
    assert.equal(new Set(seats).size, seats.length, 'two gates share a seat');
});

// ── The parts list is now something you could order ────────────────────────

test('the 4-bit adder bills as 5 chips, not 20', () => {
    const c = new Circuit(5.0);
    buildLogicIcCircuit(c, IC_CIRCUITS.ripple_adder_4);
    const bom = generateBom(c.parts);
    const line = label => (bom.find(l => l.label === label) || {}).qty || 0;
    assert.equal(line('74HC86 Quad XOR'), 2, 'eight XOR gates = two quads');
    assert.equal(line('74HC08 Quad AND'), 2, 'eight AND gates = two quads');
    assert.equal(line('74HC32 Quad OR'), 1, 'four OR gates = one quad');
    const chips = bom.filter(l => /^74HC/.test(l.label)).reduce((n, l) => n + l.qty, 0);
    assert.equal(chips, 5, 'five logic chips in total');
});

test('the CSV export is real CSV a supplier could take', () => {
    const c = new Circuit(5.0);
    buildLogicIcCircuit(c, IC_CIRCUITS.ripple_adder_4);
    const csv = bomToCsv(generateBom(c.parts));
    const lines = csv.split('\n');
    assert.equal(lines[0], 'Qty,Part,Value', 'a header row');
    assert.match(csv, /^2,"74HC86 Quad XOR"/m, 'quantities against real part numbers');
    assert.match(csv, /"Resistor 330Ω"/, 'and values where a part has one');
    for (const l of lines.slice(1)) {
        assert.match(l, /^\d+,"/, `every row starts with a quantity: ${l}`);
    }
});

test('the parts list panel offers that CSV', () => {
    const tab = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx', import.meta.url), 'utf8');
    assert.match(tab, /data-testid="bw-bom-csv"/, 'there is a CSV block');
    assert.match(tab, /ui\.bomToCsv\(/, 'using the vendor exporter, not a second one');
    assert.match(tab, /onFocus=\{e => e\.target\.select\(\)\}/, 'and it is selectable in one click');
});

test('a list of five outputs reads as a list, not "a and b and c and d and e"', () => {
    // Seen in a browser drive of the 4-bit adder, which has five outputs.
    const tab = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/fpga-tab.jsx', import.meta.url), 'utf8');
    assert.match(tab, /names\.slice\(0, -1\)\.join\(', '\)/, 'commas between all but the last');
    assert.match(tab, /\} and \$\{names\[names\.length - 1\]\}/, 'and "and" before the last');
});

test('the FPGA tab reports PACKAGES bought, not gates placed', () => {
    const tab = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/fpga-tab.jsx', import.meta.url), 'utf8');
    assert.match(tab, /built\.packages\.length/, 'it counts packages');
    assert.match(tab, /\$\{n\}× \$\{label\}/, 'as a bill like "2× 74HC86 Quad XOR"');
    assert.match(tab, /Parts list/, 'and points at the full list');
});
