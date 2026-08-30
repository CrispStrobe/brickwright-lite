/**
 * The setEngine injection surface: everything bw-circuit-ui reads must be
 * something circuit-tab.jsx actually hands it.
 *
 * bw-circuit-ui is engine-agnostic by construction — it holds no reference to
 * bw-board and reads every engine capability off the object the host injects
 * with `setEngine`. Each capability has a fallback for the host that does not
 * supply it, which is what makes the whole class of defect INVISIBLE: an
 * omitted key is never an error, it is a quieter product.
 *
 * The class has now cost four separate defects.
 *   - `getDevice` omitted → Aurora-65's PS/2 and SimpleVGA parts collapsed to
 *     generic MCUs in the browser while the isolated tests stayed green.
 *   - the machine extractors omitted → every deployed "Build Machine" answered
 *     "no retro CPU found" with the W65C02 seated in plain sight.
 *   - `getDevice` omitted from bw-board's own census script → it blamed
 *     `disp-bargraph`'s bench for a pin table the bench had right all along
 *     (bw-board LABWIRED-BRIDGE.md §5).
 *   - `getMaxCurrent` / `PORT_LIMITS` omitted → drc.js fell back to
 *     `getMaxCurrent: () => null`, so rule 8 could not sum chip current and
 *     every part in the deployed app was an "honest unknown" (fab-sbx's find,
 *     fixed 2026-08-30).
 *
 * Every one of those was found by a human noticing a product behaving quietly.
 * This test is the machine that notices instead: it reads the surface
 * bw-circuit-ui CONSUMES straight out of its own source and requires
 * circuit-tab's `setEngine` call to cover it, so the next capability someone
 * adds to the library cannot ship unwired.
 *
 * The second half proves the DRC consequence by running it both ways.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const cui = path.join(root, 'overlay/scratch-gui/src/lib/bw-circuit-ui');
const bwb = path.join(root, 'overlay/scratch-gui/src/lib/bw-board');
const circuitTab = path.join(root, 'overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx');

/**
 * Capabilities bw-circuit-ui reads that lite deliberately does not inject.
 * Each needs a REASON, and the reason must be that the fallback is honest —
 * it refuses in words or degrades visibly — not merely that it does not throw.
 */
const ALLOWED_ABSENT = {
    // sweep-session.js: `if (typeof engine.createSweepWorker === 'function')`,
    // else it runs the sweep inline on the main thread. Lite has no sweep
    // worker bundle; the inline path is the same solver and the panel says so.
    createSweepWorker: 'optional worker factory — sweep-session falls back to the inline solver',
};

/** Read the object literal circuit-tab passes to setEngine. */
function injectedKeys () {
    const src = readFileSync(circuitTab, 'utf8');
    const at = src.indexOf('setEngine({');
    assert.ok(at > 0, 'circuit-tab.jsx no longer calls setEngine({...}) — update this test');
    // Walk braces from the opening one so nested objects/comments do not end it early.
    const open = src.indexOf('{', at);
    let depth = 0, end = -1;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    assert.ok(end > open, 'could not find the end of the setEngine object literal');
    const literal = src.slice(open + 1, end);
    // Strip comments before harvesting keys: the block is heavily commented and
    // a word like `getMaxCurrent:` inside a comment must not count as wired.
    const code = literal.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const keys = new Set();
    for (const m of code.matchAll(/(^|[,{])\s*([A-Za-z_$][\w$]*)\s*(?=[,:}])/g)) keys.add(m[2]);
    return keys;
}

/** Every `engine.X` / `eng.X` property bw-circuit-ui reads off getEngine(). */
function consumedKeys () {
    const files = [];
    (function walk (dir) {
        for (const name of readdirSync(dir)) {
            const p = path.join(dir, name);
            if (statSync(p).isDirectory()) walk(p);
            else if (/\.(js|jsx)$/.test(name)) files.push(p);
        }
    })(cui);
    const keys = new Map(); // key -> files that read it
    // EVERY file, not only the ones that call getEngine(): SweepPanel obtains
    // the engine and PASSES it down, so sweep-protocol / sweep-runner /
    // sweep-session read `engine.runDcSweep` and friends off a parameter. A
    // getEngine()-only filter silently missed the entire sweep surface — which
    // is exactly this test's own failure mode, and was caught by mutating
    // `runDcSweep` out of the injection and watching this test stay green.
    for (const f of files) {
        // Comments are stripped first, in both halves of this test. `hasDevice`
        // appears in circuit.js only inside a comment explaining that the engine
        // never exported it; counting prose as a read would demand an injection
        // for a capability that does not exist.
        const code = readFileSync(f, 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
        // `const {A, B} = getEngine()` and `engine.A` / `eng.A` / `engine?.A`.
        for (const m of code.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=\s*getEngine\s*\(\s*\)/g)) {
            for (const raw of m[1].split(',')) {
                const k = raw.split(':')[0].trim();
                if (/^[A-Za-z_$][\w$]*$/.test(k)) keys.set(k, (keys.get(k) || []).concat(path.basename(f)));
            }
        }
        for (const m of code.matchAll(/\b(?:engine|eng)\??\.([A-Za-z_$][\w$]*)\b/g)) {
            keys.set(m[1], (keys.get(m[1]) || []).concat(path.basename(f)));
        }
    }
    // `js` is `engine.js` in an import specifier, not a capability.
    keys.delete('js');
    return keys;
}

test('circuit-tab injects every engine capability bw-circuit-ui reads', () => {
    const injected = injectedKeys();
    const consumed = consumedKeys();
    // The scanner must actually find things, or "everything is injected" is
    // the agreement of two empty sets.
    assert.ok(consumed.size >= 8,
        `only ${consumed.size} engine capabilities found — the scanner stopped working`);
    assert.ok(injected.size >= 8,
        `only ${injected.size} keys parsed out of the setEngine call — the parser stopped working`);

    const missing = [];
    for (const [key, files] of consumed) {
        if (injected.has(key)) continue;
        if (key in ALLOWED_ABSENT) continue;
        missing.push(`${key} (read by ${[...new Set(files)].join(', ')})`);
    }
    assert.deepEqual(missing, [],
        'bw-circuit-ui reads engine capabilities circuit-tab.jsx never injects. Each of '
        + 'these silently takes a fallback in the DEPLOYED app while isolated tests that '
        + 'inject them stay green. Wire them, or add them to ALLOWED_ABSENT with the '
        + 'reason the fallback is honest:\n  ' + missing.join('\n  '));
});

test('the two current-rating capabilities are wired, and to the real engine', () => {
    // Named explicitly as well as covered by the sweep above: this pair is the
    // one that was missing, and a regression here must fail by NAME rather than
    // inside a list.
    const injected = injectedKeys();
    for (const key of ['getMaxCurrent', 'PORT_LIMITS']) {
        assert.ok(injected.has(key),
            `circuit-tab's setEngine call omits ${key}; drc.js rule 8 then cannot sum chip current`);
    }
    // …and the vendored engine must actually export them, or the injection
    // hands over two undefineds and drc.js takes the fallback anyway.
    const index = readFileSync(path.join(bwb, 'index.js'), 'utf8');
    assert.match(index, /\bgetMaxCurrent\b/);
    assert.match(index, /\bPORT_LIMITS\b/);
    const src = readFileSync(circuitTab, 'utf8');
    assert.match(src, /getMaxCurrent:\s*engine\.getMaxCurrent/);
    assert.match(src, /PORT_LIMITS:\s*engine\.PORT_LIMITS/);
});

test('with the ratings injected the DRC sums chip current; without, it cannot', async () => {
    // Run rule 8 both ways over one deliberately-overloaded bench and read the
    // verdicts. This is the assertion that would have caught the defect: the
    // shape of the bug is that the fallback is silent, so nothing but a
    // side-by-side run distinguishes it from a healthy DRC.
    const {setEngine} = await import(path.join(cui, 'engine.js'));
    const {BoardImpl} = await import(path.join(bwb, 'board.js'));
    const {inferNetlist, checkWiring} = await import(path.join(bwb, 'infer-netlist.js'));
    const {hasDevice, getDevice} = await import(path.join(bwb, 'devices.js'));
    const {getMaxCurrent, PORT_LIMITS} = await import(path.join(bwb, 'current-ratings.js'));
    (await import(path.join(bwb, 'register-all.js'))).registerAllDevices();
    const {runDrc} = await import(path.join(cui, 'model/drc.js'));

    // 25 IR receivers on one chip: 25 x 5 mA = 125 mA, past the 120 mA total.
    // Deliberately built from a KIND-RATED part with no measured current, so
    // the whole verdict rests on getMaxCurrent and on nothing else — an LED's
    // current is read off the solver and would be summed either way.
    const parts = [{id: 'mcu1', kind: 'mcu', params: {}, terminals: ['P1.0']}];
    for (let i = 0; i < 25; i++) {
        parts.push({id: `ir${i}`, kind: 'ir_receiver', params: {}, terminals: ['out', 'vcc', 'gnd']});
    }
    const circuit = {parts, wires: [], breadboards: new Map()};
    const board = {powered: true, ledCurrents: new Map()};

    const base = {BoardImpl, inferNetlist, checkWiring, hasDevice, getDevice};

    setEngine({...base});
    const without = runDrc(circuit, board).filter(w => w.rule === 'aggregate-current');

    setEngine({...base, getMaxCurrent, PORT_LIMITS});
    const withRatings = runDrc(circuit, board).filter(w => w.rule === 'aggregate-current');

    assert.equal(without.length, 0,
        'with the fallback the sum is 0 mA and rule 8 stays silent — that is the defect, '
        + `not a pass; got: ${JSON.stringify(without)}`);
    assert.equal(withRatings.length, 1,
        `injected ratings must sum 25 x 5 mA = 125 mA past the 120 mA limit; got `
        + JSON.stringify(withRatings));
    assert.equal(withRatings[0].severity, 'danger');
    assert.match(withRatings[0].explanation, /125 mA/);
    assert.match(withRatings[0].explanation, /120 mA limit/);
    // Fully rated: no "cannot be rated" hedge. That clause is UNAVOIDABLE under
    // the fallback (every kind resolves to null), so its ABSENCE in a rendered
    // warning is a browser-visible fingerprint of the injection being live.
    assert.doesNotMatch(withRatings[0].explanation, /cannot be rated/);

    // The hand check on the number the rule printed.
    assert.equal(getMaxCurrent('ir_receiver'), 0.005);
    assert.equal(PORT_LIMITS.perChip.sink, 0.120);
    assert.equal((25 * getMaxCurrent('ir_receiver') * 1000).toFixed(0), '125');
});
