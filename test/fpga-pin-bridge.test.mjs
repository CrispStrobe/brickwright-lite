/**
 * The pin bridge — TN2b. Every claim has a case that trips it and one that
 * must not, matching the standard the DRC tests in bw-circuit-ui set.
 *
 * The board part is the REAL one, read from the pinned bw-circuit-ui package
 * rather than a fixture, so a pin move that changes the Tang Nano's pinout
 * reddens these tests instead of leaving them agreeing with a stale copy.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {parseCst, splitBit, emitCst} from '../overlay/scratch-gui/src/lib/bw-fpga/cst.js';
import {bindPorts, bridge, pinIndex, constraintsFromBindings} from '../overlay/scratch-gui/src/lib/bw-fpga/port-bridge.js';
import {modelToCst} from '../overlay/scratch-gui/src/lib/bw-fpga/gate-builder.js';

const require = createRequire(import.meta.url);
const PART = require('bw-circuit-ui/parts-data/tang_nano_20k.json');

const codes = list => list.map(x => x.code).sort();

test('the part under test really is the shipped Tang Nano', () => {
    assert.equal(PART.kind, 'tang_nano_20k');
    assert.equal(pinIndex(PART).size, 34,
        'the bridge must see exactly the 34 free IOs the datasheet names; '
        + 'power and ground carry no _fpgaPin');
});

test('IO_LOC and IO_PORT are parsed, comments and blank lines are not', () => {
    const {constraints, problems} = parseCst(`
        // a comment
        IO_LOC "led" 15;
        IO_PORT "led" IO_TYPE=LVCMOS33 DRIVE=8;

        # another comment
        IO_LOC "btn" 88;
    `);
    assert.deepEqual(problems, []);
    assert.equal(constraints.get('led').pins[0], 15);
    assert.equal(constraints.get('led').attrs.IO_TYPE, 'LVCMOS33');
    assert.equal(constraints.get('btn').pins[0], 88);
});

test('a bus port keeps its base and index', () => {
    assert.deepEqual(splitBit('led[3]'), {base: 'led', index: 3});
    assert.deepEqual(splitBit('clk'), {base: 'clk', index: null});
});

test('a port with attributes but no placement is a NAMED problem, not a skip', () => {
    const {problems} = parseCst('IO_PORT "orphan" IO_TYPE=LVCMOS33;');
    assert.deepEqual(codes(problems), ['port-not-placed']);
});

test('a header pin binds to the terminal the board part actually exposes', () => {
    const {constraints} = parseCst('IO_LOC "sig" 73;');
    const {bindings, refusals} = bindPorts(constraints, PART);
    assert.deepEqual(refusals, []);
    assert.equal(bindings.length, 1);
    assert.equal(bindings[0].pin, 73);
    assert.equal(bindings[0].terminal, 'p73',
        'terminal names are FPGA pin numbers, which is what a .cst uses');
});

test('a valid FPGA pin that is NOT on a header is refused by name', () => {
    // 33-40 are the HDMI pairs, 4 is the 27 MHz clock, 69/70 the UART. All real
    // pins; none of them reach a breadboard. This is the bridge's whole point.
    for (const pin of [33, 40, 4, 69, 59]) {
        const {constraints} = parseCst(`IO_LOC "sig" ${pin};`);
        const {bindings, refusals} = bindPorts(constraints, PART);
        assert.deepEqual(bindings, [], `pin ${pin} must not bind`);
        assert.deepEqual(codes(refusals), ['pin-not-on-header'], `pin ${pin}`);
        assert.match(refusals[0].reason, /not brought out to a header/);
    }
});

test('two ports on one pin is refused, not last-one-wins', () => {
    const {constraints} = parseCst('IO_LOC "a" 73;\nIO_LOC "b" 73;');
    const {bindings, refusals} = bindPorts(constraints, PART);
    assert.equal(bindings.length, 1, 'the first placement stands');
    assert.deepEqual(codes(refusals), ['pin-claimed-twice']);
    assert.match(refusals[0].reason, /short on real silicon/);
});

test('a pin that also drives onboard hardware binds, but warns', () => {
    // Pin 15 is LED0. Driving it from the breadboard also moves the board's own
    // LED, and a user who does not know that will misread their own circuit.
    const {constraints} = parseCst('IO_LOC "sig" 15;');
    const {bindings, refusals, warnings} = bindPorts(constraints, PART);
    assert.deepEqual(refusals, []);
    assert.equal(bindings.length, 1, 'it is usable, so it must still bind');
    assert.deepEqual(codes(warnings), ['shares-onboard-hardware']);
    assert.match(warnings[0].reason, /onboard hardware/);
});

test('a header pin with no onboard role binds silently', () => {
    const {warnings} = bindPorts(parseCst('IO_LOC "sig" 86;').constraints, PART);
    assert.deepEqual(warnings, [],
        'pin 86 has no onboard function; warning about it would train users to ignore warnings');
});

test('generated AND and 4x4 RAM use unique reachable header pins except the onboard clock', () => {
    const andModel = {nodes: [
        {id: 'a', kind: 'in', name: 'a'}, {id: 'b', kind: 'in', name: 'b'},
        {id: 'g', kind: 'gate', type: 'and'}, {id: 'y', kind: 'out', name: 'y'}
    ]};
    const ramModel = {nodes: [
        {id: 'clk', kind: 'in', name: 'clk'}, {id: 'a', kind: 'in', name: 'addr', width: 2},
        {id: 'd', kind: 'in', name: 'din', width: 4}, {id: 'we', kind: 'in', name: 'we'},
        {id: 'ram', kind: 'memory', dataWidth: 4, addrWidth: 2},
        {id: 'o', kind: 'out', name: 'q', width: 4}
    ]};
    const fullCapacityModel = {nodes: [
        {id: 'i', kind: 'in', name: 'inputs', width: 8},
        {id: 'o', kind: 'out', name: 'outputs', width: 7}
    ]};
    for (const [name, model] of [
        ['AND', andModel], ['4x4 RAM', ramModel], ['full allocator capacity', fullCapacityModel]
    ]) {
        const generated = modelToCst(model);
        assert.deepEqual(generated.problems, [], `${name} has enough generated pins`);
        const {constraints} = parseCst(generated.cst);
        const placed = [...constraints.values()].flatMap(c => c.pins);
        assert.equal(new Set(placed).size, placed.length, `${name} never assigns one pin twice`);
        const result = bindPorts(constraints, PART);
        const expectedRefusals = name === '4x4 RAM' ? [{port: 'clk', pin: 4}] : [];
        assert.deepEqual(result.refusals.map(({port, pin}) => ({port, pin})), expectedRefusals,
            `${name} only permits the intentional onboard clock outside the headers`);
        assert.ok(result.bindings.every(binding => pinIndex(PART).has(binding.pin)),
            `${name} nonclock I/O all reaches the pinned board schema`);
    }
});

test('an IO_TYPE the banks cannot provide warns and still binds', () => {
    const {constraints} = parseCst('IO_LOC "sig" 73;\nIO_PORT "sig" IO_TYPE=LVCMOS18;');
    const {bindings, warnings} = bindPorts(constraints, PART);
    assert.equal(bindings.length, 1);
    assert.deepEqual(codes(warnings), ['io-standard-mismatch']);
    assert.match(warnings[0].reason, /3\.3|LVCMOS33/);
});

test('constraints and design must agree, in both directions', () => {
    const {constraints} = parseCst('IO_LOC "led" 15;\nIO_LOC "ghost" 73;');
    const ports = {led: {direction: 'output'}, lonely: {direction: 'input'}};
    const {bindings, refusals} = bridge({constraints, part: PART, netlistPorts: ports});
    assert.equal(bindings.length, 1);
    assert.equal(bindings[0].direction, 'output', 'the direction comes from the design');
    assert.deepEqual(codes(refusals), ['port-not-in-design', 'port-unplaced']);
});

test('a bus binds bit by bit, in pin order', () => {
    const {constraints} = parseCst('IO_LOC "led[0]" 73;\nIO_LOC "led[1]" 74;');
    const {bindings, refusals} = bindPorts(constraints, PART);
    assert.deepEqual(refusals, []);
    assert.deepEqual(bindings.map(b => [b.base, b.index, b.terminal]),
        [['led', 0, 'p73'], ['led', 1, 'p74']]);
});

// ── Emitting constraints back out ────────────────────────────────

test('emitted constraints parse back to the same meaning', () => {
    // The property is MEANING-equality, not byte-equality: comments, order and
    // whitespace are deliberately not preserved, and asserting bytes would let
    // the meaning drift while the test stayed green.
    const source = `
        // a comment that will not survive, and should not
        IO_PORT "led" DRIVE=8 IO_TYPE=LVCMOS33;
        IO_LOC  "led" 73;
        IO_LOC  "q[1]" 74;
        IO_LOC  "q[0]" 86;
    `;
    const first = parseCst(source);
    assert.deepEqual(first.problems, []);
    const round = parseCst(emitCst(first.constraints));
    assert.deepEqual(round.problems, []);
    assert.deepEqual(
        [...round.constraints.entries()].map(([k, v]) => [k, v.pins, v.attrs || null]).sort(),
        [...first.constraints.entries()].map(([k, v]) => [k, v.pins, v.attrs || null]).sort());
});

test('emitted constraints are ordered by pin, because that is how they are read', () => {
    const {constraints} = parseCst('IO_LOC "c" 86;\nIO_LOC "a" 73;\nIO_LOC "b" 74;');
    const pins = emitCst(constraints).split('\n')
        .filter(l => l.startsWith('IO_LOC'))
        .map(l => Number(/\s(\d+);/.exec(l)[1]));
    assert.deepEqual(pins, [73, 74, 86]);
});

test('a port with attributes but no placement is not emitted at all', () => {
    // It cannot be placed, so writing it would hand the Gowin toolchain a
    // constraint file that is wrong in a new way rather than incomplete.
    const {constraints} = parseCst('IO_PORT "orphan" IO_TYPE=LVCMOS33;\nIO_LOC "real" 73;');
    const out = emitCst(constraints);
    assert.ok(!out.includes('orphan'), 'an unplaced port must not reach the output');
    assert.ok(out.includes('"real" 73'));
});

test('a header is emitted as comments, and comments do not become constraints', () => {
    const {constraints} = parseCst('IO_LOC "led" 73;');
    const out = emitCst(constraints, {header: 'generated by Brickwright\ndo not hand-edit'});
    assert.match(out, /^\/\/ generated by Brickwright\n\/\/ do not hand-edit\n/);
    assert.deepEqual(parseCst(out).problems, [], 'the header must parse back cleanly');
    assert.equal(parseCst(out).constraints.size, 1);
});

test('nothing placed emits nothing, not an empty-looking file', () => {
    assert.equal(emitCst(new Map()), '');
});

test('IO_PORT before IO_LOC is legal, and is not a duplicate', () => {
    // Gowin's own examples declare attributes before placing, and an earlier
    // version of the parser called that a duplicate placement. The emit/parse
    // round-trip is what surfaced it.
    const {constraints, problems} = parseCst('IO_PORT "led" IO_TYPE=LVCMOS33;\nIO_LOC "led" 73;');
    assert.deepEqual(problems, []);
    assert.deepEqual(constraints.get('led').pins, [73]);
    assert.equal(constraints.get('led').attrs.IO_TYPE, 'LVCMOS33');
});

test('two IO_LOC lines for one port IS a duplicate', () => {
    const {problems} = parseCst('IO_LOC "led" 73;\nIO_LOC "led" 74;');
    assert.deepEqual(problems.map(p => p.code), ['duplicate-port']);
});

test('a multi-pin placement survives the trip back out', () => {
    // Bindings are PER PIN, so `IO_LOC "pair" 73,74;` makes two of them with the
    // same port. Rebuilding constraints by keying a Map on the port keeps only
    // the last pin, and the .cst that leaves for real silicon is quietly wrong
    // by one pin. That is what this regrouping exists to prevent.
    const {constraints} = parseCst('IO_LOC "pair" 73,74;\nIO_PORT "pair" IO_TYPE=LVCMOS33;');
    const {bindings, refusals} = bindPorts(constraints, PART);
    assert.deepEqual(refusals, []);
    assert.equal(bindings.length, 2, 'one binding per pin');

    const regrouped = constraintsFromBindings(bindings, constraints);
    assert.equal(regrouped.size, 1, 'one constraint per port');
    assert.deepEqual(regrouped.get('pair').pins, [73, 74], 'both pins must survive');

    const out = emitCst(regrouped);
    assert.match(out, /IO_LOC\s+"pair" 73,74;/);
    assert.deepEqual(parseCst(out).constraints.get('pair').pins, [73, 74]);
    assert.equal(parseCst(out).constraints.get('pair').attrs.IO_TYPE, 'LVCMOS33');
});
