/**
 * MakeCode for LEGO EV3 -> DEVICE EV3 pseudocode -> ev3comprehensive blocks
 * -> MakeCode EV3 again (task B4). One test per mapped mechanism, each on
 * the blocks the dialect actually makes (the vendored sb3-creator's
 * ev3Dialect.js) and on the TypeScript the export writes back.
 *
 * Lite has no EV3 runtime to run the blocks on (docs/LEGO-ARCHITECTURE.md),
 * so there is no side-by-side run here: the behavioural proof available is
 * that pxt-ev3's own compiler takes the re-export (the last test, and the
 * census in scripts/makecode-census.mjs over every pxt-ev3 docs program).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import util from 'node:util';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB = path.join(ROOT, 'overlay/scratch-gui/src/lib');
const imp = rel => import(pathToFileURL(path.join(LIB, rel)).href);
const {ev3ToPseudocode, EV3_THRESHOLDS} = await imp('bw-makecode/ev3-translate.js');
const {exportToMakeCodeEv3} = await imp('bw-makecode/export-ev3.js');
const {importProjectFiles, inferTarget} = await imp('bw-makecode/index.js');
const {PXT_GLUE_JS} = await imp('bw-makecode/pxt-runtime.js');
const {default: SB3Creator} = await imp('sb3-creator.js');

/** MakeCode TS -> {code, unsupported, blocks, ops, ts (re-export), exportUnsupported}. */
function roundTrip (ts) {
    const imported = ev3ToPseudocode(ts);
    const creator = new SB3Creator();
    const project = creator.parse(imported.code);
    const warnings = creator.warnings.filter(w => !/Empty body/.test(w));
    assert.deepEqual(warnings, [], `the dialect did not read every line:\n${imported.code}`);
    const blocks = Object.values(project.targets[0].blocks);
    const ex = exportToMakeCodeEv3(project);
    return {...imported, blocks, project, ops: blocks.map(b => b.opcode), ts: ex.ts, exportUnsupported: ex.unsupported};
}
const block = (r, op) => r.blocks.find(b => b.opcode === `ev3comprehensive_${op}`);
const menu = (r, b, name) => r.project.targets[0].blocks[b.inputs[name][1]].fields;
const lines = code => code.split('\n').map(l => l.trim()).filter(Boolean);

test('motors: run by port, with each length unit, and a pair as one port', () => {
    const r = roundTrip(`motors.largeA.run(50)
motors.largeB.run(-30, 2, MoveUnit.Rotations)
motors.largeC.run(40, 90, MoveUnit.Degrees)
motors.largeD.run(20, 1.5, MoveUnit.Seconds)
motors.largeBC.run(60, 500)
`);
    assert.deepEqual(lines(r.code).filter(l => l.startsWith('run motor')), [
        'run motor A at 50 %', 'run motor B at (0 - 30) % for 2 rotations', 'run motor C at 40 % for 90 degrees',
        'run motor D at 20 % for 1.5 seconds', 'run motor BC at 60 % for 0.5 seconds']);
    assert.deepEqual(menu(r, block(r, 'motorRunRotations'), 'PORT'), {motorPorts: ['B', null]});
    assert.deepEqual(menu(r, block(r, 'motorRunTime'), 'PORT').motorPorts[0], 'D');
    assert.equal(r.blocks.filter(b => b.opcode === 'ev3comprehensive_motorRunTime').length, 2);
    assert.match(r.ts, /motors\.largeB\.run\(\(0 - 30\), 2, MoveUnit\.Rotations\)/);
    assert.match(r.ts, /motors\.largeBC\.run\(60, 0\.5, MoveUnit\.Seconds\)/);
    assert.deepEqual(r.unsupported, []);
});

test('motors: stop follows the last setBrake on that port, and a medium motor is named', () => {
    const r = roundTrip(`motors.largeA.stop()
motors.largeA.setBrake(true)
motors.largeA.stop()
motors.mediumD.run(30)
motors.stopAll()
`);
    assert.deepEqual(lines(r.code).filter(l => /^stop motor/.test(l)), ['stop motor A coast', 'stop motor A brake', 'stop motor ABCD coast']);
    assert.ok(r.unsupported.some(u => /^motors\.mediumD — driven like a large motor/.test(u)));
    assert.ok(r.unsupported.some(u => /^motors\.largeA\.setBrake\(\)/.test(u)), 'setBrake has no block and is named');
    // Back: the brake is set only where it changes, and all four is stopAll.
    assert.deepEqual(lines(r.ts).filter(l => /stop|Brake/.test(l)),
        ['motors.largeA.stop()', 'motors.largeA.setBrake(true)', 'motors.largeA.stop()', 'motors.stopAll()']);
});

test('pairs: tank and steer with a length are the extension\'s B+C drive blocks', () => {
    const r = roundTrip(`motors.largeBC.tank(50, 30, 2, MoveUnit.Seconds)
motors.largeBC.steer(-20, 40, 3, MoveUnit.Rotations)
`);
    assert.ok(block(r, 'tankDrive') && block(r, 'steerDrive'));
    assert.deepEqual(block(r, 'steerDrive').fields.UNIT, ['rotations', null]);
    assert.match(r.ts, /motors\.largeBC\.tank\(50, 30, 2, MoveUnit\.Seconds\)/);
    assert.match(r.ts, /motors\.largeBC\.steer\(\(0 - 20\), 40, 3, MoveUnit\.Rotations\)/);
    // Another pair with a length: the extension's pair is B+C only.
    const other = ev3ToPseudocode('motors.largeAD.tank(50, 50, 1, MoveUnit.Rotations)');
    assert.ok(other.unsupported.some(u => /drives B\+C only, not AD/.test(u)));
});

test('pairs: tank and steer that run on are two motor runs, at pxt-ev3\'s own wheel speeds', () => {
    const r = roundTrip(`motors.largeBC.tank(50, -50)
motors.largeBC.steer(25, 80)
motors.largeBC.steer(-150, 40)
`);
    assert.deepEqual(lines(r.code).filter(l => l.startsWith('run motor')), [
        'run motor B at 50 %', 'run motor C at (0 - 50) %',
        // turn +25: the follower (C) at 80 * (100 - 25) / 100
        'run motor B at 80 %', 'run motor C at 60 %',
        // turn -150: the leader (B) slows past zero into reverse, as the firmware's step sync does
        'run motor B at -20 %', 'run motor C at 40 %']);
    assert.ok(r.unsupported.some(u => /steer\(\) without a length — two motor runs/.test(u)));
});

test('sensors: each reading is its port\'s block', () => {
    const r = roundTrip(`let a = sensors.touch1.isPressed() ? 1 : 0
let b = sensors.color3.light(LightIntensityMode.Reflected)
let c = sensors.color3.ambientLight()
let d = sensors.color3.color()
let e = sensors.ultrasonic4.distance()
let f = sensors.gyro2.angle()
let g = sensors.gyro2.rate()
let h = sensors.infrared4.proximity()
let i = motors.largeA.angle()
let j = brick.batteryLevel()
let k = control.timer1.millis()
`);
    const want = {touchSensor: '1', colorSensor: '3', ultrasonicSensor: '4', gyroSensor: '2', irProximity: '4'};
    for (const [op, port] of Object.entries(want)) {
        assert.equal(menu(r, block(r, op), 'PORT').sensorPorts[0], port, op);
    }
    assert.deepEqual(r.blocks.filter(b => b.opcode === 'ev3comprehensive_colorSensor').map(b => b.fields.MODE[0]).sort(),
        ['ambient', 'color', 'reflected']);
    assert.deepEqual(r.blocks.filter(b => b.opcode === 'ev3comprehensive_gyroSensor').map(b => b.fields.MODE[0]).sort(), ['angle', 'rate']);
    assert.ok(block(r, 'motorPosition') && block(r, 'batteryLevel') && block(r, 'timerValue'));
    for (const call of ['sensors.touch1.isPressed()', 'sensors.color3.light(LightIntensityMode.Ambient)', 'sensors.color3.color()',
        'sensors.ultrasonic4.distance()', 'sensors.gyro2.rate()', 'sensors.infrared4.proximity()', 'motors.largeA.angle()',
        'brick.batteryLevel()', 'control.timer1.millis()']) assert.ok(r.ts.includes(call), `${call} not in\n${r.ts}`);
    assert.deepEqual(r.unsupported, []);
});

test('handlers: a touch press, a button release and a colour are polled on their reading', () => {
    const r = roundTrip(`sensors.touch1.onEvent(ButtonEvent.Pressed, function () {
    music.playTone(440, 100)
})
brick.buttonEnter.onEvent(ButtonEvent.Released, function () {
    brick.setStatusLight(StatusLight.Green)
})
sensors.color3.onColorDetected(ColorSensorColor.Red, function () {
    motors.stopAll()
})
`);
    const code = lines(r.code);
    const at = s => code.indexOf(s);
    // Pressed: the body at the press, then the release is waited out.
    assert.ok(at('IF ev3 touch 1 pressed THEN:') >= 0 && at('wait until not (ev3 touch 1 pressed)') > at('play brick tone 440 hz for 100 ms'));
    // Released: the release is waited for BEFORE the body.
    assert.ok(at('wait until not (ev3 button enter pressed)') < at('set brick light green'));
    // A colour by EV3 colour number (Red = 5).
    assert.ok(at('IF (ev3 color 3 color) = 5 THEN:') >= 0);
    assert.equal(r.ops.filter(o => o === 'control_forever').length, 3);
    assert.match(r.ts, /if \(sensors\.touch1\.isPressed\(\)\)/);
    assert.match(r.ts, /brick\.buttonEnter\.isPressed\(\)/);
});

test('handlers and waits use pxt-ev3\'s default thresholds', () => {
    assert.deepEqual(EV3_THRESHOLDS, {color: {low: 20, high: 80}, ultrasonic: {low: 10, high: 100}, infrared: {low: 10, high: 90}});
    const r = ev3ToPseudocode(`sensors.color3.pauseUntilLightDetected(LightIntensityMode.Reflected, Light.Dark)
sensors.color3.pauseUntilLightDetected(LightIntensityMode.Ambient, Light.Bright)
sensors.ultrasonic4.pauseUntil(UltrasonicSensorEvent.ObjectNear)
sensors.infrared4.pauseUntil(InfraredSensorEvent.ObjectNear)
sensors.touch1.pauseUntil(ButtonEvent.Bumped)
`);
    assert.deepEqual(lines(r.code).filter(l => l.startsWith('wait')), [
        'wait until not ((ev3 color 3 reflected) > 20)',
        'wait until not ((ev3 color 3 ambient) < 80)',
        'wait until not ((ev3 distance 4 cm) > 10)',
        'wait until not ((ev3 infrared 4 proximity) > 10)',
        'wait until ev3 touch 1 pressed', 'wait until not (ev3 touch 1 pressed)']);
    // Movement is a change between readings: named, not approximated.
    const moved = ev3ToPseudocode('sensors.ultrasonic4.onEvent(UltrasonicSensorEvent.ObjectDetected, function () { })');
    assert.ok(moved.unsupported.some(u => /ObjectDetected\) — movement is a change between readings/.test(u)));
});

test('screen: a text line is pxt-ev3\'s pixel row, and comes back as that line', () => {
    const r = roundTrip(`brick.showString("Hello", 1)
brick.showString("World", 3)
brick.showNumber(42, 2)
brick.showValue("dist", sensors.ultrasonic4.distance(), 4)
brick.clearScreen()
`);
    assert.deepEqual(lines(r.code).filter(l => l.startsWith('show brick text')), [
        'show brick text "Hello" at 4 4', 'show brick text "World" at 4 24', 'show brick text 42 at 4 14',
        'show brick text ("dist" join (": " join (ev3 distance 4 cm))) at 4 34']);
    const texts = r.blocks.filter(b => b.opcode === 'ev3comprehensive_screenText');
    assert.deepEqual(texts.map(b => b.inputs.Y[1][1]), ['4', '24', '14', '34']);
    assert.deepEqual(lines(r.ts).filter(l => l.startsWith('brick.')), [
        'brick.showString("Hello", 1)', 'brick.showString("World", 3)', 'brick.showNumber(42, 2)',
        'brick.showValue("dist", sensors.ultrasonic4.distance(), 4)', 'brick.clearScreen()']);
});

test('the status light, tones and volume; flashing and sound files are named', () => {
    const r = roundTrip(`brick.setStatusLight(StatusLight.Red)
brick.setStatusLight(StatusLight.OrangeFlash)
music.playTone(Note.C4, music.beat(BeatFraction.Half))
music.setVolume(20)
music.playSoundEffect(sounds.animalsCatPurr)
brick.showImage(images.expressionsBigSmile)
`);
    assert.deepEqual(r.blocks.filter(b => b.opcode === 'ev3comprehensive_setLED').map(b => b.fields.COLOR[0]), ['RED', 'ORANGE']);
    assert.ok(lines(r.code).includes('play brick tone 262 hz for 250 ms'));
    assert.ok(block(r, 'setVolume'));
    for (const named of [/StatusLight\.OrangeFlash\) — the extension's light is steady/, /^music\.beat\(\)/,
        /^music\.playSoundEffect\(\)/, /^brick\.showImage\(\)/]) {
        assert.ok(r.unsupported.some(u => named.test(u)), `${named} not named: ${r.unsupported.join(' | ')}`);
    }
    assert.match(r.ts, /brick\.setStatusLight\(StatusLight\.Red\)/);
    assert.match(r.ts, /music\.playTone\(262, 250\)/);
});

test('scripts: forever loops and parallel starts run beside the main code, and come back so', () => {
    const r = roundTrip(`let n = 0
forever(function () {
    n += 1
})
control.runInParallel(function () {
    motors.largeA.run(50)
    pause(1000)
})
`);
    assert.equal(r.ops.filter(o => o === 'event_whenflagclicked').length, 3);
    const ts = lines(r.ts);
    assert.ok(ts.includes('forever(function () {'));
    assert.ok(ts.includes('control.runInParallel(function () {'), r.ts);
    assert.ok(ts.indexOf('pause(1000)') > ts.indexOf('control.runInParallel(function () {'));
});

test('do ... while runs its body once, then tests (ts-import)', () => {
    const r = ev3ToPseudocode(`let i = 0
do {
    i += 1
} while (i < 3)
`);
    assert.ok(!r.unsupported.some(u => /Unknown statement/.test(u)), r.unsupported.join(' | '));
    const code = lines(r.code);
    // The body comes before the first test of the condition.
    assert.ok(code.indexOf('change i by 1') < code.findIndex(l => /i < 3/.test(l)), r.code);
});

test('the import door: an EV3 project becomes EV3 pseudocode', () => {
    assert.equal(inferTarget({'main.ts': 'motors.largeBC.tank(50, 50)'}), 'ev3');
    assert.equal(inferTarget({}, 'https://makecode.mindstorms.com/#pub:x ev3'), 'ev3');
    const r = importProjectFiles({'main.ts': 'sensors.touch1.pauseUntil(ButtonEvent.Pressed)\nmotors.largeA.run(50)\n'}, {target: 'ev3', name: 'demo'});
    assert.equal(r.lang, 'pseudocode');
    assert.equal(r.note, 'ev3');
    assert.match(r.code, /^DEVICE EV3/);
});

test('round trip: importing the re-export gives the same program', () => {
    const ts = `let speed = 30
sensors.touch1.onEvent(ButtonEvent.Pressed, function () {
    speed += 10
})
forever(function () {
    if (sensors.ultrasonic4.distance() < 20) {
        motors.largeBC.tank(0 - speed, speed, 1, MoveUnit.Rotations)
    } else {
        motors.largeB.run(speed)
        motors.largeC.run(speed)
    }
    brick.showValue("speed", speed, 1)
})
`;
    const first = roundTrip(ts);
    const second = roundTrip(first.ts);
    // The first pass turns the handler into its polled loop, and says so in a
    // comment; past that the program is the same, and from then on a fixed point.
    const statements = code => lines(code).filter(l => !l.startsWith('#'));
    assert.deepEqual(statements(second.code), statements(first.code));
    const third = roundTrip(second.ts);
    assert.equal(third.code, second.code);
    assert.equal(third.ts, second.ts);
});

// ── pxt-ev3's own compiler takes the re-export ─────────────────────────────
const STATIC = path.join(ROOT, 'packages/scratch-gui/static/makecode');
const synced = fs.existsSync(path.join(STATIC, 'ev3', 'pxtworker.js'));
const skip = synced ? false : 'MakeCode runtime not synced (npm run sync:makecode) — pxt compilers absent';
let sandbox = null;
async function compileEv3 (ts) {
    if (!sandbox) {
        const dir = path.join(STATIC, 'ev3');
        const quiet = () => {};
        sandbox = {setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate,
            TextEncoder: util.TextEncoder, TextDecoder: util.TextDecoder, Buffer,
            console: {log: quiet, debug: quiet, info: quiet, warn: quiet, error: quiet},
            pxtTargetBundle: JSON.parse(fs.readFileSync(path.join(dir, 'target.json'), 'utf8'))};
        sandbox.global = sandbox;
        sandbox.self = sandbox;
        sandbox.eval = src => vm.runInContext(src, sandbox, {filename: 'eval'});
        vm.createContext(sandbox, {codeGeneration: {strings: false, wasm: false}});
        vm.runInContext(fs.readFileSync(path.join(dir, 'pxtworker.js'), 'utf8'), sandbox, {filename: 'pxtworker.js'});
        vm.runInContext(PXT_GLUE_JS, sandbox, {filename: 'pxt-glue.js'});
    }
    const files = {'pxt.json': JSON.stringify({name: 't', dependencies: {ev3: '*'}, files: ['main.ts']}), 'main.ts': ts};
    return JSON.parse(JSON.stringify(await sandbox.bwMakeCode.compile(files, {})));
}

test('pxt-ev3 compiles every mechanism\'s re-export, offline', {skip}, async () => {
    const program = `let speed = 30
motors.largeA.setBrake(true)
motors.largeA.run(50, 2, MoveUnit.Rotations)
motors.largeA.stop()
motors.largeBC.steer(10, 40, 1, MoveUnit.Seconds)
motors.stopAll()
sensors.touch1.onEvent(ButtonEvent.Pressed, function () {
    speed += 10
})
brick.buttonEnter.onEvent(ButtonEvent.Released, function () {
    brick.setStatusLight(StatusLight.Green)
})
control.runInParallel(function () {
    sensors.color3.pauseUntilLightDetected(LightIntensityMode.Reflected, Light.Dark)
    music.playTone(Note.C4, music.beat(BeatFraction.Half))
})
forever(function () {
    brick.showValue("dist", sensors.ultrasonic4.distance(), 1)
    brick.showString("hi", 2)
    if (sensors.color3.color() == ColorSensorColor.Red) {
        control.timer1.reset()
    }
    if (false) {
        pause(1)
    }
    pause(100)
})
`;
    const original = await compileEv3(program);
    assert.equal(original.success, true, 'the fixture is itself a pxt-ev3 program');
    const r = roundTrip(program);
    const back = await compileEv3(r.ts);
    assert.equal(back.success, true, `${JSON.stringify(back.diagnostics.slice(0, 2))}\n${r.ts}`);
    assert.deepEqual([...original.netAttempts, ...back.netAttempts], []);
});
