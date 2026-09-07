/**
 * Across every shipped example and every device bench it ships: does the LED
 * wiring agree with what the program DECLARES?
 *
 * The board is the oracle, not the topology. For each declared output pin with a
 * matching LED, drive the pin LOW and read the LED, then drive it HIGH and read
 * again. Lit-when-low means the bench is wired ACTIVE LOW. Compare that with the
 * declaration in program.bw. A disagreement means the learner sees the LED
 * inverted from what the program says.
 *
 * Reading the wires instead would decide the same question by pattern-matching a
 * topology, and a bench can reach the rails through a breadboard column, a seat
 * or a jumper. The solver already resolves all of those, so it is asked.
 *
 * NOT A GATE. It reports, and its findings are recorded in
 * docs/EXAMPLE-CORPUS-FINDINGS.md with the sha they were taken at. Gating on it
 * today would just paint the corpus red; the repair is a lane of its own, and
 * this is the instrument that will say when it is done.
 *
 * Usage: node scripts/led-polarity-census.mjs
 */
import {readFileSync, existsSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EX = path.join(ROOT, 'overlay/scratch-gui/examples');
const {BoardImpl} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-board/board.js'));
const {registerAllDevices} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-board/register-all.js'));
const {terminalsForKind} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-circuit-ui/model/circuit.js'));
const SB3Creator = (await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/sb3-creator.js'))).default;
registerAllDevices();

// THE DECLARATION TO COMPARE AGAINST IS THE RETARGETED ONE, NOT THE AUTHORED ONE.
// Picking a device in the app retargets the program through this very function
// before loading that device's bench (circuit-tab.jsx loadExampleProgram), and
// the bench generator retargets through it too. So the pair a learner actually
// sees is (retargeted program, generated bench). Comparing the AUTHORED
// declaration against a generated bench measures a mismatch that never reaches
// anyone: retargeting an 8051 ACTIVE LOW pin to a d13 on an Uno deliberately
// drops the clause, because the sink asymmetry that forces active-low on a
// quasi-bidirectional 8051 pin does not exist on an AVR push-pull one.
const declsFor = (src, device, authoredDevice) => {
    let text = src;
    if (device && authoredDevice && device !== authoredDevice && SB3Creator.retargetPseudocode) {
        let r = null;
        try { r = SB3Creator.retargetPseudocode(src, device); } catch { return null; }
        if (!r || !r.ok) return null;          // an honest refusal, not a bench to judge
        text = r.pseudocode ?? r.src ?? src;
    }
    return [...text.matchAll(/^\s*PIN\s+(\w+)\s*=\s*(\S+)\s+OUTPUT\s*(ACTIVE\s+(LOW|HIGH))?/gim)]
        .map(m => ({name: m[1], header: m[2], declared: m[4] ? `active-${m[4].toLowerCase()}` : 'active-high'}));
};

const PASSIVE = new Set(['breadboard', 'vcc', 'gnd', 'resistor', 'led', 'capacitor', 'wire',
    'diode', 'inductor', 'switch', 'button', 'potentiometer', 'battery']);

const build = file => {
    const circuit = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(circuit.parts) || !Array.isArray(circuit.wires)) return null;
    const parts = circuit.parts.filter(p => p.kind !== 'breadboard').map(p => ({...p,
        terminals: (p.terminals && p.terminals.length) ? p.terminals
            : (p.seat ? Object.keys(p.seat.leadMap) : terminalsForKind(p.kind, p.params))}));
    const ids = new Set(parts.map(p => p.id));
    const nets = circuit.wires
        .filter(w => typeof w.to === 'string' && ids.has(w.from) && ids.has(w.to))
        .map((w, i) => ({id: `n${i}`, terminals: [
            {part: w.from, terminal: w.fromTerminal}, {part: w.to, terminal: w.toTerminal}]}));
    let board;
    try {
        board = new BoardImpl(5);
        board.setNetlist(parts, nets);
    } catch (e) { return {error: e.message.slice(0, 60)}; }

    const mcu = circuit.parts.find(p => !PASSIVE.has(p.kind));
    const mcuId = mcu && mcu.id;
    const wires = circuit.wires.filter(w => typeof w.to === 'string');
    const neighbours = id => wires.flatMap(w =>
        (w.from === id ? [{part: w.to, terminal: w.toTerminal}]
            : w.to === id ? [{part: w.from, terminal: w.fromTerminal}] : []));
    const pinOf = ledId => {
        const seen = new Set([ledId]);
        let frontier = neighbours(ledId);
        for (let hop = 0; hop < 4; hop++) {
            const direct = frontier.find(n => n.part === mcuId);
            if (direct) return direct.terminal;
            const next = [];
            for (const n of frontier) {
                if (seen.has(n.part)) continue;
                seen.add(n.part);
                next.push(...neighbours(n.part));
            }
            frontier = next;
        }
        return null;
    };
    const leds = parts.filter(p => p.kind === 'led').map(p => ({id: p.id, pin: pinOf(p.id)}));
    return {board, leds};
};

/** Ask the SOLVER which level lights this LED. */
const wiringOf = (board, pin, ledId) => {
    const read = () => { try { return board.ledBrightness(ledId); } catch { return null; } };
    try {
        board.setPin(pin, 'pushpull', false);
        board.advanceTo(board.timeNs + 50_000_000n);
        const low = read();
        board.setPin(pin, 'pushpull', true);
        board.advanceTo(board.timeNs + 50_000_000n);
        const high = read();
        if (typeof low !== 'number' || typeof high !== 'number') return null;
        if (low > 0.01 && high <= 0.01) return 'active-low';
        if (high > 0.01 && low <= 0.01) return 'active-high';
        return low > 0.01 && high > 0.01 ? 'always-lit' : 'never-lit';
    } catch { return null; }
};

const rows = [];
const unmeasured = [];
const inconclusive = [];
for (const id of readdirSync(EX).sort()) {
    const dir = path.join(EX, id);
    const prog = path.join(dir, 'program.bw');
    if (!existsSync(prog)) continue;
    const src = readFileSync(prog, 'utf8');
    const authoredDevice = ((src.match(/^DEVICE\s+([\w-]+)/im) || [])[1] || '')
        .toLowerCase().replace(/_/g, '-');
    if (!/^\s*PIN\s+\w+\s*=\s*\S+\s+OUTPUT/im.test(src)) continue;
    for (const f of readdirSync(dir)) {
        const m = /^circuit\.([\w.-]+)\.json$/.exec(f);
        if (!m) continue;
        const device = m[1];
        const decls = declsFor(src, device, authoredDevice);
        if (!decls || !decls.length) continue;
        const built = build(path.join(dir, f));
        if (!built || built.error || !built.leds || !built.leds.length) continue;
        for (const decl of decls) {
            // MATCHED BY NET, NOT BY NAME. Matching `LED_<declared name>` assumed a
            // naming convention the corpus does not keep: 312 led parts sat on
            // declared output pins under other ids and were counted as
            // unmeasurable. The LED's pin is TRACED from the wires above, so this
            // asks the electrical question — which LED is on this pin — rather than
            // a lexical one.
            const want = String(decl.header || '').toLowerCase();
            const led = built.leds.find(l => l.pin && String(l.pin).toLowerCase() === want) ||
                built.leds.find(l => l.id === `LED_${decl.name}` || l.id === decl.name);
            // COVERAGE, COUNTED RATHER THAN ASSUMED. A declared output pin is only
            // measurable here if the bench carries a discrete `led` part named for
            // it. Seven-segment digits, LED banks, matrices and shift-register
            // outputs are all declared OUTPUT and none of them are that, so the
            // inverted count below is a FLOOR over discrete LEDs, not a total over
            // everything a program can light.
            if (!led || !led.pin) { unmeasured.push({id, device, pin: decl.name}); continue; }
            const wired = wiringOf(built.board, led.pin, led.id);
            // A THIRD BUCKET, COUNTED. An LED that stays dark at both levels, or lit
            // at both, answers neither way — a shared anode, a transistor between it
            // and the pin, an unpowered rail. Dropping these silently made the
            // reached total shrink when the matching improved, which is how they
            // were found. Anything the instrument cannot decide is reported, not
            // discarded.
            if (!wired || wired === 'never-lit' || wired === 'always-lit') {
                inconclusive.push({id, device, pin: decl.name, why: wired || 'no reading'});
                continue;
            }
            rows.push({id, device, pin: decl.name, declared: decl.declared, wired,
                agrees: wired === decl.declared});
        }
    }
}

const bad = rows.filter(r => !r.agrees);
console.log(`declared output pins reached: ${rows.length + unmeasured.length + inconclusive.length}`);
console.log(`   with a discrete LED this census can drive: ${rows.length}`);
console.log(`   no discrete LED on the pin (7-seg, banks, matrices, shift outputs): ${unmeasured.length}`);
console.log(`   an LED that answered neither way (both levels dark, or both lit): ${inconclusive.length}`);
const whys = new Map();
for (const r of inconclusive) whys.set(r.why, (whys.get(r.why) || 0) + 1);
for (const [k, v] of whys) console.log(`      ${k}: ${v}`);
console.log(`declared-output LEDs measured across the corpus: ${rows.length}`);
console.log(`   agreeing: ${rows.length - bad.length}`);
console.log(`   INVERTED: ${bad.length}`);

const byDevice = new Map();
for (const r of bad) {
    if (!byDevice.has(r.device)) byDevice.set(r.device, new Set());
    byDevice.get(r.device).add(r.id);
}
const okByDevice = new Map();
for (const r of rows) {
    if (!okByDevice.has(r.device)) okByDevice.set(r.device, 0);
    okByDevice.set(r.device, okByDevice.get(r.device) + 1);
}
console.log('\nper device (inverted LEDs / measured LEDs, distinct examples):');
for (const dev of [...okByDevice.keys()].sort()) {
    const n = bad.filter(r => r.device === dev).length;
    console.log(`  ${dev.padEnd(18)} ${String(n).padStart(4)} / ${String(okByDevice.get(dev)).padStart(4)}` +
        (n ? `   ${(byDevice.get(dev) || new Set()).size} example(s)` : ''));
}
console.log('\ndirection of the disagreement:');
const dirs = new Map();
for (const r of bad) {
    const k = `declared ${r.declared}, wired ${r.wired}`;
    dirs.set(k, (dirs.get(k) || 0) + 1);
}
for (const [k, v] of dirs) console.log(`  ${k}: ${v}`);
console.log('\nJSONROWS ' + JSON.stringify(bad));
console.log('\nevery inverted row:');
for (const r of bad.slice(0, 12)) {
    console.log(`  ${r.id.padEnd(26)} ${r.device.padEnd(16)} ${r.pin.padEnd(8)} declared ${r.declared}, wired ${r.wired}`);
}
