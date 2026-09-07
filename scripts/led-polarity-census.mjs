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
registerAllDevices();

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
for (const id of readdirSync(EX).sort()) {
    const dir = path.join(EX, id);
    const prog = path.join(dir, 'program.bw');
    if (!existsSync(prog)) continue;
    const src = readFileSync(prog, 'utf8');
    // PIN <name> = <pin> OUTPUT [ACTIVE LOW|ACTIVE HIGH]
    const decls = [...src.matchAll(/^\s*PIN\s+(\w+)\s*=\s*(\S+)\s+OUTPUT\s*(ACTIVE\s+(LOW|HIGH))?/gim)]
        .map(m => ({name: m[1], declared: m[4] ? `active-${m[4].toLowerCase()}` : 'active-high'}));
    if (!decls.length) continue;
    for (const f of readdirSync(dir)) {
        const m = /^circuit\.([\w.-]+)\.json$/.exec(f);
        if (!m) continue;
        const device = m[1];
        const built = build(path.join(dir, f));
        if (!built || built.error || !built.leds || !built.leds.length) continue;
        for (const decl of decls) {
            const led = built.leds.find(l => l.id === `LED_${decl.name}` || l.id === decl.name);
            if (!led || !led.pin) continue;
            const wired = wiringOf(built.board, led.pin, led.id);
            if (!wired || wired === 'never-lit' || wired === 'always-lit') continue;
            rows.push({id, device, pin: decl.name, declared: decl.declared, wired,
                agrees: wired === decl.declared});
        }
    }
}

const bad = rows.filter(r => !r.agrees);
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
console.log('\nfirst 12 inverted rows:');
for (const r of bad.slice(0, 12)) {
    console.log(`  ${r.id.padEnd(26)} ${r.device.padEnd(16)} ${r.pin.padEnd(8)} declared ${r.declared}, wired ${r.wired}`);
}
