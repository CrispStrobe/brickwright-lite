/**
 * Tier 2.1 — declared pins must equal wired pins.
 *
 * docs/VERIFICATION-AUTOMATION.md: "Every `PIN x = P2.1 OUTPUT` in program.bw
 * must be wired in circuit.json; every affordance part (button, pot, switch)
 * must be read or driven by the program, or carry an explicit decorative
 * marker." It needs no per-example authoring, so it scales to the whole corpus.
 *
 * WHAT "WIRED" MEANS, and why this asks the engine.
 * A pad is wired when the engine puts its terminal in a resolved net that has
 * at least two distinct real terminals. It is NOT a walk over `wires`.
 * sb3-creator's test/rail-short.test.mjs documents why a hand-rolled union-find
 * reported 802 shorts in 2,040 files: endpoints come in two dialects MIXED
 * WITHIN ONE FILE — flat {from:'ID', fromTerminal:'t'} and nested
 * {to:{board,hole}} — so keying on part/terminal collapses every breadboard
 * hole into one node. Breadboard topology is real, and it lives in the engine.
 *
 * WHAT "WIRED" MEANS FOR deviceOnly EXAMPLES.
 * A micro:bit or A2 faceplate program is a self-contained board: its pads are
 * on the PCB and there is no circuit to wire them into. Those examples carry no
 * circuit file, so this gate does not ask whether their pads are wired. It
 * asserts the equivalence instead — no circuit IFF deviceOnly — which is what
 * turns "an intro promising a 128x64 OLED for an example with no circuit at
 * all" into a caught defect rather than a silent omission.
 *
 * WHICH ENGINE THIS TESTS.
 * The one lite VENDORS (overlay/scratch-gui/src/lib/{bw-circuit-ui,bw-board}),
 * which is the engine lite ships to users, so a defect here is a defect users
 * get. It needs no sibling checkout and therefore cannot skip in CI. The cost,
 * flagged by bw-audit from the stc12 conformance gap: a vendored-against-
 * vendored comparison cannot see the vendored copy going stale. That is not
 * this gate's job — provenance lives in vendor-pins.json (bw-circuit-ui pinned
 * at 8e666ca) and is gated by test/vendor-manifest-contract.test.mjs. Said out
 * loud so "runs unconditionally" is not mistaken for "compares against
 * upstream".
 *
 * RATCHETS MAY ONLY SHRINK. Fixing an entry deletes it in the same commit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const cui = path.join(root, 'overlay/scratch-gui/src/lib/bw-circuit-ui');
const bwb = path.join(root, 'overlay/scratch-gui/src/lib/bw-board');
const EXAMPLES = path.join(root, 'overlay/scratch-gui/examples');

/** Parts that provide program-addressable pads. Not only the MCU: eater6502
 *  reaches PB0-PB7 through a W65C22 VIA, and keying on MCU kinds alone
 *  reported eight false unwired pins on a correctly wired bench. */
const PAD_PROVIDERS = new Set(['mcu', 'stc_mcu', 'stc15_mcu', 'arduino_uno', 'arduino_nano',
    'arduino_mega', 'pi_pico', 'attiny85', 'attiny88', 'w65c22', 'microbit']);

/** A core may ADDRESS a pad under a name the board does not use for the
 *  terminal. The w65c22 case above needed only the part, because there the
 *  names already matched: the program says PB0 and the VIA's terminal is pb0.
 *  The Z80 goes one step further -- the program says OUT0 and the '374's
 *  terminal is q0 -- so the name has to be resolved too, or eight correctly
 *  wired LEDs read as eight unwired pins.
 *
 *  TWO LIMITS, measured by mutating this alias rather than assumed:
 *    - Aiming it at the '374's D inputs instead of its Q outputs does NOT go
 *      red, and that is correct: the D pins sit on the Z80 data bus and so are
 *      genuinely wired. "Is this pin wired to something" is true either way.
 *      That OUT0 is the Q side is proved where it can be -- sb3-creator's
 *      machine-roms gate reads the emitted __sfr address and the extracted
 *      latch port and requires them equal, then boots the image and watches
 *      the eight LEDs walk. This gate is not the place for it.
 *    - Aiming it at the wrong CHIP does go red, which is what the per-part
 *      lookup below buys.
 *
 *  Deliberately NOT extended to the 74HC244 input side: that chip is two
 *  4-bit halves (1a0-1a3, 2a0-2a3) and which half IN0 means is a wiring
 *  convention this gate has not measured. An unmeasured alias would turn a
 *  real miss into a silent pass, so IN pins stay unresolved and get flagged. */
const PAD_ALIASES = [
    {part: '74hc374', from: /^out([0-7])$/, to: m => `q${m[1]}`},
];

/** Every terminal name a declared pad could legitimately be wired as. */
const padResolves = (row, pad) => {
    if (row.wired.has(pad)) return true;
    for (const a of PAD_ALIASES) {
        const m = pad.match(a.from);
        if (!m) continue;
        // The aliased terminal must be wired ON THAT PART, not merely present
        // somewhere in the circuit under the same name.
        if (row.wiredOn?.get(a.part)?.has(a.to(m))) return true;
    }
    return false;
};
const INFRA = new Set(['breadboard', 'breadboard_full', 'breadboard_half', 'breadboard_mini', 'meter']);

/** Interactive or observable parts a learner expects to do something. */
const AFFORDANCE = new Set(['button', 'potentiometer', 'switch', 'slide_switch', 'dip_switch',
    'dip_switch_spst', 'dip_switch_dpst', 'keypad_4x4', 'tilt_switch', 'tilt_sensor', 'ldr',
    'led', 'rgb_led', 'buzzer', 'piezo', 'bargraph', 'seven_segment', 'servo', 'dc_motor',
    'relay', 'neopixel', 'ssd1306', 'char_lcd_i2c', 'max7219']);

/** Power and ground legs are not pads a program reads or drives. Counting them
 *  made every LED whose cathode meets the MCU's GND pin look "on a pad" — 96
 *  false positives that collapsed to 4 once rails were excluded. */
const isRail = (t) => /^(gnd\d*|gnd_\d+|vcc|vdd|vss|v\+|v-|5v|3v3|vin|vbus|vsys|aref|avcc|agnd|rst|reset|xtal\d*)$/i.test(t);

/** Pads that are wired on the PCB and correctly absent from the circuit. */
const ON_PCB_PADS = new Map([
    ['pico01-blink:gp25', 'the Pico\'s onboard LED is on the PCB. bw-board\'s board.js '
        + 'synthesises its net for a seated pi_pico whether or not gp25 is wired.'],
]);

/**
 * Declared pins wired to nothing. RATCHET — may only shrink.
 *
 * The 13 arduino-sk-* entries are one class: the circuit is a bare board plus
 * power, with the components the program declares simply absent.
 *
 * These are NOT waiting on bw-bundle's repair, and recording them that way
 * would have been wrong. Checked with bw-bundle directly: its fix changes a
 * pin's MODE (OUTPUT to PWM/TONE) and the actuation verb, and wires nothing —
 * arduino-sk-p05-servo-mood still has no servo in its circuit afterwards. The
 * defect here survives that change; only the mode string moves, and this gate
 * keys on the pad, not the mode.
 */
const KNOWN_UNWIRED = new Map([
    ['arduino-sk-p03-love-o-meter', 'led1@D2 led2@D3 led3@D4 — circuit is uno+pot+power, no LEDs'],
    ['arduino-sk-p04-color-mixing', 'sensorG@A1 sensorB@A2 ledR@D3 ledG@D5 ledB@D6'],
    ['arduino-sk-p05-servo-mood', 'servo@D9 — no servo part'],
    ['arduino-sk-p06-light-theremin', 'speaker@D8 — no speaker part'],
    ['arduino-sk-p07-keyboard', 'btn1@D2 btn2@D3 btn3@D4 btn4@D5 speaker@D8'],
    ['arduino-sk-p08-hourglass', 'led2@D2..led7@D7 tilt@D8'],
    ['arduino-sk-p09-motorized-pinwheel', 'btn@D2 motor@D9'],
    ['arduino-sk-p10-zoetrope', 'pot@A0 btnFwd@D2 btnRev@D3 motorEnable@D9 motorDir1@D4 motorDir2@D5'],
    ['arduino-sk-p11-crystal-ball', 'tilt@D6 — no tilt switch part'],
    ['arduino-sk-p12-knock-lock', 'piezo@A0 btn@D2 ledR@D3 ledY@D4 ledG@D5 servo@D9'],
    ['arduino-sk-p13-touch-lamp', 'touch@D2 led@D3'],
    ['arduino-sk-p14-serial-pot', 'pot@A0 — circuit is uno+power only, no potentiometer'],
    ['arduino-sk-p15-hacking-buttons', 'opto@D2 — no optocoupler part'],
    ['eater6502-full-build', 'led0@PA0..led4@PA4 unwired, while PA5/PA6/PA7 are wired to the '
        + 'hd44780 rs/rw/e and declared as led5/led6/led7. A pin-purpose conflict, not an '
        + 'omission. Lesson-named (machines-memory-maps, wave 7) per bw-lessons.'],
]);

/** Affordance wired to a pad the program never declares. RATCHET — may only shrink. */
const KNOWN_UNREAD = new Map([
    ['arduino-02-blink-without-delay:btn1', 'button on d2, fully wired, no program reads it — '
        + 'a control that looks live and is not. Lesson-named (debug-timing-bugs, wave 5).'],
    ['61-console-pong:s1', 'button on p3.0, not declared'],
    ['61-console-pong:s4', 'button on p3.7, not declared'],
    ['61-console-pong:s5', 'button on p3.6, not declared'],
]);

/** Affordance with no wires at all. RATCHET — may only shrink. */
const KNOWN_UNCONNECTED = new Map([
    ['eater6502-full-build:bargraph', 'bargraph carries zero wires while the program declares '
        + 'eight LEDs on PA0-PA7. Same defect as the unwired entry above, seen from the part side.'],
]);

const declaredPins = (src) => [...src.matchAll(/^\s*PIN\s+([A-Za-z0-9_]+)\s*=\s*([A-Za-z0-9._]+)\s+([A-Z]+)/gm)]
    .map((m) => ({name: m[1], pad: m[2], mode: m[3]}));

let ENGINE = null;
async function engine () {
    if (ENGINE) return ENGINE;
    for (const p of [path.join(cui, 'model/circuit.js'), path.join(bwb, 'board.js')]) {
        assert.ok(existsSync(p), `vendored engine missing at ${p} — this gate compares against `
            + 'the engine lite ships; without it there is nothing to compare and it must fail, not skip');
    }
    const {setEngine} = await import(path.join(cui, 'engine.js'));
    const {BoardImpl} = await import(path.join(bwb, 'board.js'));
    const {inferNetlist, checkWiring} = await import(path.join(bwb, 'infer-netlist.js'));
    const {hasDevice, getDevice} = await import(path.join(bwb, 'devices.js'));
    // Before any board is built: an unpopulated device registry resolves almost
    // nothing and reads as "the whole corpus is unwired" (bw-lessons, and the
    // 44-circuit blast radius of 2026-08-20).
    (await import(path.join(bwb, 'register-all.js'))).registerAllDevices();
    setEngine({BoardImpl, inferNetlist, checkWiring, hasDevice, getDevice});
    const {registerSidecar} = await import(path.join(cui, 'model/parts-registry.js'));
    for (const f of readdirSync(path.join(cui, 'parts-data'))) {
        if (!f.endsWith('.json')) continue;
        try {
            const sc = JSON.parse(readFileSync(path.join(cui, 'parts-data', f), 'utf8'));
            if (sc.kind) registerSidecar(sc);
        } catch { /* the sidecar repo has its own gate */ }
    }
    ENGINE = await import(path.join(cui, 'model/circuit.js'));
    return ENGINE;
}

/** Everything the corpus walk derives, computed once. */
async function survey () {
    const {Circuit, resetIds} = await engine();
    const index = JSON.parse(readFileSync(path.join(EXAMPLES, 'index.json'), 'utf8'));
    const rows = [];
    for (const e of index) {
        const progRel = e.files?.program;
        const circRel = e.files?.circuit;
        const progPath = progRel && path.join(EXAMPLES, progRel);
        const pins = progPath && existsSync(progPath)
            ? declaredPins(readFileSync(progPath, 'utf8')) : [];
        const deviceOnly = e.deviceOnly === true || e.authored === 'microbit' || e.authored === 'spike';
        const row = {id: e.id, pins, deviceOnly, hasCircuit: !!(circRel && existsSync(path.join(EXAMPLES, circRel)))};
        rows.push(row);
        if (!row.hasCircuit) continue;
        let c;
        try {
            resetIds();
            const raw = JSON.parse(readFileSync(path.join(EXAMPLES, circRel), 'utf8'));
            c = Circuit.fromJSON(raw.circuit || raw);
        } catch (err) { row.loadError = err.message.slice(0, 80); continue; }
        const byId = new Map(c.parts.map((p) => [p.id, p]));
        const wired = new Set();        // every terminal in a multi-terminal net
        // ...and the same, kept per PART KIND. `wired` is a flat set of names,
        // so it cannot tell the '374's q0 from the Z80's d0; an alias checked
        // against it passes while pointing at the wrong silicon (measured: an
        // alias aimed at the latch's D inputs instead of its Q outputs stayed
        // green). Alias resolution uses this instead.
        const wiredOn = new Map();      // part kind -> terminals wired on it
        const padsOf = new Map();       // part id -> signal pads it shares a net with
        const anyWire = new Set();
        for (const net of (c.resolvedNets || [])) {
            const real = net.terminals.filter((t) => typeof t.part === 'string'
                && !t.part.startsWith('@bb:') && !INFRA.has(byId.get(t.part)?.kind));
            const uniq = [...new Set(real.map((t) => `${t.part}.${String(t.terminal).toLowerCase()}`))];
            if (uniq.length < 2) continue;
            const pads = new Set(real.filter((t) => PAD_PROVIDERS.has(byId.get(t.part)?.kind))
                .map((t) => String(t.terminal).toLowerCase()).filter((t) => !isRail(t)));
            for (const t of real) {
                const term = String(t.terminal).toLowerCase();
                wired.add(term);
                const kind = byId.get(t.part)?.kind;
                if (kind) {
                    if (!wiredOn.has(kind)) wiredOn.set(kind, new Set());
                    wiredOn.get(kind).add(term);
                }
                anyWire.add(t.part);
                if (!padsOf.has(t.part)) padsOf.set(t.part, new Set());
                for (const p of pads) padsOf.get(t.part).add(p);
            }
        }
        row.wired = wired;
        row.wiredOn = wiredOn;
        row.parts = c.parts;
        row.padsOf = padsOf;
        row.anyWire = anyWire;
        row.declaredPads = new Set(pins.map((p) => p.pad.toLowerCase()));
    }
    return rows;
}

const ROWS = await survey();

/**
 * bw-audit's rule, learned from a mutation that silently changed nothing: assert
 * the instrument's own yield BEFORE trusting any verdict it produces. A detector
 * that matches nothing makes every downstream assertion pass vacuously and looks
 * exactly like success.
 */
test('INSTRUMENT: the corpus walk actually derived something', () => {
    const withPins = ROWS.filter((r) => r.pins.length);
    const withCircuit = ROWS.filter((r) => r.hasCircuit);
    const resolved = ROWS.filter((r) => r.wired && r.wired.size > 0);
    const failed = ROWS.filter((r) => r.loadError);
    console.log(`\nTier 2.1 survey: ${ROWS.length} index entries, ${withPins.length} declare pins, `
        + `${withCircuit.length} have a circuit, ${resolved.length} resolved a non-empty netlist`);
    for (const r of failed.slice(0, 10)) console.log(`  load failed: ${r.id} — ${r.loadError}`);
    assert.equal(failed.length, 0, `${failed.length} circuit(s) failed to load`);

    // Thresholds are PROPORTIONS of counts taken in this same run, not fixed
    // numbers. bw-audit's ">= 25 opcodes" was right at 28 and would have gone
    // on passing if the emitter grew to 200 while the deriver found 30. A
    // constant floor stops tracking the corpus the moment the corpus moves.
    const entries = JSON.parse(readFileSync(path.join(EXAMPLES, 'index.json'), 'utf8')).length;
    assert.equal(ROWS.length, entries,
        `walked ${ROWS.length} of ${entries} index entries — the walk is dropping examples`);

    // Every circuit that loaded must resolve a non-empty netlist. An
    // unpopulated device registry resolves almost nothing and looks exactly
    // like "the whole corpus is unwired".
    const unresolved = withCircuit.filter((r) => !r.wired || r.wired.size === 0);
    assert.ok(unresolved.length <= 1,
        `${unresolved.length} circuit(s) resolved an EMPTY netlist: `
        + `${unresolved.slice(0, 5).map((r) => r.id).join(', ')} — a registry that never `
        + 'populated produces exactly this');

    // TERMINAL DEGRADATION IS SILENT, and a non-empty-netlist check cannot see
    // it. Measured 2026-08-23: with NEITHER the sidecar registry nor
    // registerAllDevices, a keypad_4x4 resolves to ["a","b"] — still forming
    // nets, still "resolved", every pad wrong. And each registration MASKS the
    // other's absence, so removing either one alone leaves this gate green;
    // only removing both degrades. That is why this asserts real pin counts
    // rather than trusting either bootstrap step to have run.
    const MULTI_PIN = new Set(['keypad_4x4', 'ssd1306', 'char_lcd_i2c', 'hd44780', 'max7219',
        'seven_segment', 'mcu', 'stc_mcu', 'stc15_mcu', 'arduino_uno', 'arduino_nano',
        'arduino_mega', 'pi_pico', 'w65c22', 'attiny88']);
    const degraded = [];
    for (const r of ROWS) {
        for (const p of (r.parts || [])) {
            // Exactly the default pair, not merely a short list: generated
            // benches legitimately TRIM an MCU to the pins they use, e.g.
            // ["P2.1","P2.2"], and flagging those made this fire on a healthy
            // corpus. Degradation has a signature — the literal a/b fallback.
            const t = (p.terminals || []).map((x) => String(x).toLowerCase());
            if (MULTI_PIN.has(p.kind) && t.length === 2 && t[0] === 'a' && t[1] === 'b') {
                degraded.push(`${r.id}:${p.id}(${p.kind})=${JSON.stringify(p.terminals)}`);
            }
        }
    }
    assert.deepEqual(degraded.slice(0, 10), [],
        `${degraded.length} multi-pin part(s) resolved to two or fewer terminals — the default `
        + '["a","b"] fallback. Neither the sidecar registry nor bw-board devices supplied '
        + 'real pins, and every pad this gate checks would be wrong');

    // Declared pins are the gate's whole input; if the extractor stops matching
    // the dialect, every check below passes over nothing.
    assert.ok(withPins.length / ROWS.length >= 0.25,
        `only ${withPins.length}/${ROWS.length} examples declare pins — below a quarter, `
        + 'suspect the PIN extractor rather than the corpus');
    assert.ok(withCircuit.length / ROWS.length >= 0.5,
        `only ${withCircuit.length}/${ROWS.length} examples resolved a circuit path`);
});

test('an example with no circuit is a deviceOnly board, not a missing circuit', () => {
    const offenders = ROWS.filter((r) => !r.hasCircuit && !r.deviceOnly)
        .map((r) => `${r.id}: declares ${r.pins.length} pin(s) and has no circuit, and is not deviceOnly`);
    assert.deepEqual(offenders, [], `${offenders.length} example(s) promise hardware with no circuit to wire it into`);
});

test('every declared pin is wired to something', () => {
    const found = [];
    for (const r of ROWS) {
        if (!r.hasCircuit || !r.wired) continue;
        const missing = r.pins.filter((p) => {
            const pad = p.pad.toLowerCase();
            return !padResolves(r, pad) && !ON_PCB_PADS.has(`${r.id}:${pad}`);
        });
        if (missing.length) found.push({id: r.id, detail: missing.map((p) => `${p.name}@${p.pad}`).join(' ')});
    }
    const unexpected = found.filter((f) => !KNOWN_UNWIRED.has(f.id));
    const fixed = [...KNOWN_UNWIRED.keys()].filter((id) => !found.some((f) => f.id === id));
    console.log(`declared-but-unwired: ${found.length} example(s), ${KNOWN_UNWIRED.size} ratcheted`);
    for (const f of unexpected) console.log(`  NEW  ${f.id}: ${f.detail}`);
    assert.deepEqual(unexpected.map((f) => f.id), [],
        `${unexpected.length} example(s) declare a pin wired to nothing`);
    assert.deepEqual(fixed, [], `ratchet entr(ies) no longer reproduce — delete them: ${fixed.join(', ')}`);
});

test('every affordance part is wired to something', () => {
    const found = [];
    for (const r of ROWS) {
        if (!r.hasCircuit || !r.parts) continue;
        for (const p of r.parts) {
            if (!AFFORDANCE.has(p.kind)) continue;
            if (p.decorative || p.params?.decorative) continue;
            if (!r.anyWire.has(p.id)) found.push(`${r.id}:${p.id}`);
        }
    }
    const unexpected = found.filter((k) => !KNOWN_UNCONNECTED.has(k));
    const fixed = [...KNOWN_UNCONNECTED.keys()].filter((k) => !found.includes(k));
    for (const f of unexpected) console.log(`  NEW unconnected affordance: ${f}`);
    assert.deepEqual(unexpected, [], `${unexpected.length} affordance part(s) carry no wires at all`);
    assert.deepEqual(fixed, [], `ratchet entr(ies) no longer reproduce — delete them: ${fixed.join(', ')}`);
});

test('every affordance on a pad is read or driven by the program', () => {
    const found = [];
    for (const r of ROWS) {
        if (!r.hasCircuit || !r.parts || !r.declaredPads.size) continue;
        for (const p of r.parts) {
            if (!AFFORDANCE.has(p.kind)) continue;
            if (p.decorative || p.params?.decorative) continue;
            const pads = r.padsOf.get(p.id);
            // No pad at all means driven indirectly — through a 74HC595 or a
            // transistor — and not decidable from declarations. Counting those
            // produced 96 false positives.
            if (!pads || pads.size === 0) continue;
            if (![...pads].some((t) => r.declaredPads.has(t))) {
                found.push({key: `${r.id}:${p.id}`, detail: `${p.kind} on [${[...pads].join(',')}]`});
            }
        }
    }
    const unexpected = found.filter((f) => !KNOWN_UNREAD.has(f.key));
    const fixed = [...KNOWN_UNREAD.keys()].filter((k) => !found.some((f) => f.key === k));
    console.log(`affordance-not-read: ${found.length}, ${KNOWN_UNREAD.size} ratcheted`);
    for (const f of unexpected) console.log(`  NEW  ${f.key}: ${f.detail}`);
    assert.deepEqual(unexpected.map((f) => f.key), [],
        `${unexpected.length} affordance(s) sit on a pad no program reads`);
    assert.deepEqual(fixed, [], `ratchet entr(ies) no longer reproduce — delete them: ${fixed.join(', ')}`);
});

/**
 * A declared name implies a part kind. `PIN ldr = A0 ANALOG` wired to a
 * potentiometer is the light-theremin defect: electrically the bench "works",
 * because a pot and an LDR are both a resistance to the ADC, so only the
 * lesson is wrong. A wired/unwired check cannot see it — A0 IS wired.
 *
 * Conservative by construction: it fires only when the name clearly implies a
 * kind AND some affordance of a DIFFERENT kind sits on that pad AND no part of
 * the implied kind does. A pad with nothing recognisable on it says nothing.
 */
const NAME_IMPLIES = [
    [/^(ldr|photocell|photoresistor|lightsensor)/i, new Set(['ldr'])],
    [/^(pot|poti|potentiometer|knob)/i, new Set(['potentiometer'])],
    [/^(btn|button|key|push)/i, new Set(['button', 'keypad_4x4'])],
    [/^(speaker|buzzer|piezo|sounder|tone)/i, new Set(['buzzer', 'piezo'])],
    [/^(servo)/i, new Set(['servo'])],
    [/^(motor|fan)/i, new Set(['dc_motor', 'gearmotor'])],
    [/^(tilt)/i, new Set(['tilt_switch', 'tilt_sensor'])],
    [/^(relay)/i, new Set(['relay'])],
];

/**
 * Declared names standing in for a part the circuit does not have. RATCHET.
 *
 * All three are one root cause, and it is a GENERATOR choice, not three
 * authoring slips: bench synthesis maps an ANALOG pin to a potentiometer
 * whatever the pin is called, so the part arrives literally named `POT_ldr`.
 * An `ldr` kind exists in the catalog (src/parts-data/ldr.json), so this is a
 * substitution, not a limitation. Fixing it upstream clears all three at once;
 * fix the synthesis rather than the three benches.
 *
 * Why nothing caught it before: a pot and an LDR are both a resistance to the
 * ADC, so the bench reads a plausible number and only the teaching is wrong.
 * Both intros promise "a light-dependent resistor (LDR)" and tell the learner
 * to cover it with their hand.
 */
const KNOWN_KIND_MISMATCH = new Map([
    ['arduino-sk-p06-light-theremin:ldr', 'declares an LDR on A0; a potentiometer is wired there instead'],
    ['03-night-light:ldr', 'declares an LDR on P1.3; circuit carries POT_ldr, a potentiometer'],
    ['16-ldr-bargraph:ldr', 'declares an LDR on P1.7; circuit carries POT_ldr, a potentiometer'],
]);

test('a declared name matches the kind of part on its pad', () => {
    const found = [];
    for (const r of ROWS) {
        if (!r.hasCircuit || !r.parts || !r.padsOf) continue;
        // pad -> affordance kinds sitting on it
        const kindsOnPad = new Map();
        for (const p of r.parts) {
            if (!AFFORDANCE.has(p.kind)) continue;
            for (const pad of (r.padsOf.get(p.id) || [])) {
                if (!kindsOnPad.has(pad)) kindsOnPad.set(pad, new Set());
                kindsOnPad.get(pad).add(p.kind);
            }
        }
        for (const pin of r.pins) {
            const rule = NAME_IMPLIES.find(([re]) => re.test(pin.name));
            if (!rule) continue;
            const onPad = kindsOnPad.get(pin.pad.toLowerCase());
            if (!onPad || onPad.size === 0) continue;          // nothing recognisable there
            if ([...onPad].some((k) => rule[1].has(k))) continue; // the right kind is present
            found.push({key: `${r.id}:${pin.name}`,
                detail: `${pin.name}@${pin.pad} implies ${[...rule[1]].join('/')}, found ${[...onPad].join('/')}`});
        }
    }
    const unexpected = found.filter((f) => !KNOWN_KIND_MISMATCH.has(f.key));
    const fixed = [...KNOWN_KIND_MISMATCH.keys()].filter((k) => !found.some((f) => f.key === k));
    console.log(`name-vs-kind mismatches: ${found.length}, ${KNOWN_KIND_MISMATCH.size} ratcheted`);
    for (const f of found) console.log(`  ${KNOWN_KIND_MISMATCH.has(f.key) ? 'known' : 'NEW  '} ${f.key}: ${f.detail}`);
    assert.deepEqual(unexpected.map((f) => f.key), [],
        `${unexpected.length} declared name(s) do not match the part on their pad`);
    assert.deepEqual(fixed, [], `ratchet entr(ies) no longer reproduce — delete them: ${fixed.join(', ')}`);
});

// ── Canaries: re-introduce each defect, assert the detector fires ──
test('CANARY: an unwired declared pin is detected', () => {
    const wired = new Set(['d13', 'gnd', 'vcc']);
    const pins = [{name: 'led', pad: 'D13'}, {name: 'btn', pad: 'D2'}];
    const missing = pins.filter((p) => !wired.has(p.pad.toLowerCase()));
    assert.deepEqual(missing.map((p) => p.pad), ['D2'], 'the wired/unwired split must fire on D2 and spare D13');
});

test('CANARY: rails are excluded, and excluding them is what makes the pad test meaningful', () => {
    assert.ok(isRail('gnd') && isRail('GND2') && isRail('vcc') && isRail('5v') && isRail('gnd_1'),
        'rail names must be recognised');
    assert.ok(!isRail('d2') && !isRail('p1.0') && !isRail('gp25') && !isRail('pa0'),
        'signal pads must NOT be treated as rails — that would empty the pad set and pass vacuously');
});

test('CANARY: the ratchets are live, not decorative', () => {
    // Every ratchet key must name a real example, or the ratchet is silently
    // excusing nothing while looking like it excuses something.
    const ids = new Set(ROWS.map((r) => r.id));
    const stale = [...KNOWN_UNWIRED.keys()].filter((id) => !ids.has(id));
    assert.deepEqual(stale, [], `ratchet names example(s) that do not exist: ${stale.join(', ')}`);
    for (const k of [...KNOWN_UNREAD.keys(), ...KNOWN_UNCONNECTED.keys()]) {
        assert.ok(ids.has(k.split(':')[0]), `ratchet key ${k} names a missing example`);
    }
    assert.ok(KNOWN_UNWIRED.size > 0 && KNOWN_UNREAD.size > 0, 'ratchets must not be empty while defects stand');
});
