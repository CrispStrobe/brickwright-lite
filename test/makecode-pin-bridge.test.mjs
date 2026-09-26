/**
 * The MakeCode pin bridge names pins the way the circuit's board part names its
 * pads — or it drives nothing.
 *
 * makecode-sim-pane.jsx drivePins/sampleInputs pass the host page's pin names
 * straight to runtime.circuitBoard.setPin/readPin, and bw-board resolves those
 * by the placed board part's TERMINAL name. The Calliope mini and Circuit
 * Playground Express parts (bw-circuit-ui #44, bw-board #44) name their pads
 * p0-p3 / 3v / gnd and a0-a7 / 3v3 / gnd / vout. So every GPIO pad of each part
 * must be a name the host page can send.
 *
 * Measured before this test existed: the Calliope's names come from its
 * DigitalPin enum (p0-p3 among them — they match); the Circuit Playground has
 * no DigitalPin enum, so config.json carried no names and the host page bridged
 * NO pins for it: a CPX program's pins.A1.digitalWrite never reached the
 * circuit. The host page now reads the CPX names from the running simulator's
 * pxsim.CPlayPinName; the function doing it is lifted out of host.html and run
 * here, first against a stub with the real key set, then (when the MakeCode
 * runtime is synced) against the real sim.js's CPlayPinName block.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = fs.readFileSync(path.join(ROOT, 'scripts/makecode/host.html'), 'utf8');
const STATIC = path.join(ROOT, 'packages/scratch-gui/static/makecode');
const PARTS = path.join(ROOT, 'node_modules/bw-circuit-ui/src/parts-data');

/** simPinNames, exactly as host.html defines it. */
function hostSimPinNames () {
    const begin = HOST.indexOf('// bw-pin-names:begin');
    const end = HOST.indexOf('// bw-pin-names:end');
    assert.ok(begin >= 0 && end > begin, 'host.html lost its bw-pin-names markers');
    assert.equal(HOST.indexOf('// bw-pin-names:begin', begin + 1), -1, 'one bw-pin-names block, not two');
    const sb = {};
    vm.runInNewContext(`${HOST.slice(begin, end)}\nthis.simPinNames = simPinNames;`, sb);
    return sb.simPinNames;
}

/** A part's GPIO pads: its terminals less the power pads bw-board stamps. */
const POWER = /^(3v|3v3(_\d+)?|5v|vout|vin|gnd\d*)$/;
function gpioPads (kind) {
    const part = JSON.parse(fs.readFileSync(path.join(PARTS, `${kind}.json`), 'utf8'));
    const names = part.terminals.map(t => (typeof t === 'string' ? t : t.name));
    return names.filter(n => !POWER.test(n));
}

/**
 * The CPX sim's CPlayPinName keys, in declaration order (pxt-adafruit 1.6.8
 * built/sim.js), filled the way its init() fills them: ids from the program's
 * config, TX/RX aliasing A7/A6 and LED aliasing D13 as on the board, and -1
 * for a key the config does not name.
 */
const CPLAY_KEYS = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9',
    'D4', 'D5', 'D6', 'D7', 'D8', 'D13', 'IR_IN', 'IR_OUT', 'LED', 'TX', 'RX'];
function cpxConfigId (key) {
    const alias = {TX: 'A7', RX: 'A6', LED: 'D13'}[key];
    if (alias) return cpxConfigId(alias);
    if (key === 'D6') return -1;                   // a key the config leaves unset
    return 100 + CPLAY_KEYS.indexOf(key);
}

test('the new parts name the pads the bridge must reach (bw-circuit-ui at the pin)', () => {
    assert.deepEqual(gpioPads('calliopemini'), ['p0', 'p1', 'p2', 'p3']);
    assert.deepEqual(gpioPads('circuit_playground_express'), ['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7']);
});

test('a target with static pin names keeps them (the micro:bit/Calliope path is unchanged)', () => {
    const simPinNames = hostSimPinNames();
    const cal = {100: 'p1', 112: 'p0', 101: 'p2', 116: 'p3', 103: 'c4'};
    const cplay = {CPlayPinName: {A0: 5}};
    assert.deepEqual({...simPinNames(cal, cplay)}, cal, 'static names win over anything the sim carries');
    assert.deepEqual({...simPinNames({}, undefined)}, {}, 'no names and no sim: nothing bridged');
    assert.deepEqual({...simPinNames({}, {})}, {}, 'the EV3: no enum, no CPlayPinName');
});

test('Circuit Playground: every GPIO pad of the part is a name the host page sends', () => {
    const simPinNames = hostSimPinNames();
    const CPlayPinName = Object.fromEntries(CPLAY_KEYS.map(k => [k, cpxConfigId(k)]));
    const names = simPinNames({}, {CPlayPinName});
    const sent = new Set(Object.values(names));
    for (const pad of gpioPads('circuit_playground_express')) {
        assert.ok(sent.has(pad), `CPX pad ${pad} is never named by the bridge (sent: ${[...sent].join(' ')})`);
    }
    assert.equal(names[cpxConfigId('A7')], 'a7', 'TX aliases A7 and must not rename it');
    assert.equal(names[cpxConfigId('A6')], 'a6', 'RX aliases A6 and must not rename it');
    assert.ok(!sent.has('d6'), 'a key the config leaves at -1 is not bridged');
});

const cpxSim = path.join(STATIC, 'adafruit/sim/sim.js');
const calConfig = path.join(STATIC, 'calliopemini/sim/config.json');
const synced = fs.existsSync(cpxSim) && fs.existsSync(calConfig);
const skip = synced ? false : 'MakeCode runtime not synced (npm run sync:makecode) — the real CPX sim.js and Calliope config.json are absent';

test('against the synced runtime: the real CPlayPinName and the real Calliope names reach the pads', {skip}, () => {
    const simPinNames = hostSimPinNames();
    const src = fs.readFileSync(cpxSim, 'utf8');
    // The CPlayPinName namespace block, cut by its own opening and closing
    // statements (both exact literals, each asserted to occur once).
    const OPEN = 'var CPlayPinName;';
    const CLOSE = '})(CPlayPinName = pxsim.CPlayPinName || (pxsim.CPlayPinName = {}));';
    const from = src.indexOf(OPEN);
    const to = src.indexOf(CLOSE, from);
    assert.ok(from >= 0 && to > from, 'pxt-adafruit sim.js no longer declares CPlayPinName the way the host page reads it');
    assert.equal(src.indexOf(OPEN, from + 1), -1, 'one CPlayPinName declaration');
    const m = [src.slice(from, to + CLOSE.length)];
    const pxsim = {
        getConfigKey: k => (CPLAY_KEYS.includes(k.slice(4)) ? k : null),
        getConfig: k => cpxConfigId(k.slice(4))
    };
    vm.runInNewContext(`${m[0]}\nCPlayPinName.init();`, {pxsim});
    assert.deepEqual(Object.keys(pxsim.CPlayPinName).filter(k => k !== 'init'), CPLAY_KEYS, 'the stub above must carry the real key set');
    const sent = new Set(Object.values(simPinNames({}, pxsim)));
    for (const pad of gpioPads('circuit_playground_express')) assert.ok(sent.has(pad), `CPX pad ${pad}`);

    const calNames = JSON.parse(fs.readFileSync(calConfig, 'utf8')).pinNames;
    const calSent = new Set(Object.values(simPinNames(calNames, undefined)));
    for (const pad of gpioPads('calliopemini')) assert.ok(calSent.has(pad), `Calliope pad ${pad} is never named by the bridge`);
});
