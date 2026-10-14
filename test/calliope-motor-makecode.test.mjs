/**
 * The Calliope mini car of the radio-pair tutorial, through every form we keep
 * a program in: MakeCode TypeScript -> our text -> blocks -> MakeCode
 * TypeScript -> the pinned MakeCode compiler for the Calliope.
 *
 * `motors.dualMotorPower` used to be refused on import as hardware the
 * micro:bit does not have. That stays true for a micro:bit project; a Calliope
 * project keeps its motors and its own DEVICE line.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import util from 'node:util';

import {SOURCE, REPO} from './helpers/bw-integrated.mjs';
import {projectToMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/export.js';
import {microbitToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/microbit-translate.js';
import {PXT_GLUE_JS} from '../overlay/scratch-gui/src/lib/bw-makecode/pxt-runtime.js';

const COMPILER = path.join(SOURCE, 'src', 'lib', 'sb3-creator.js');
const canCompile = fs.existsSync(COMPILER);
const SB3Creator = canCompile ? (await import(COMPILER)).default : null;
const needsCompiler = canCompile ? false : 'packages/scratch-gui not integrated — run `npm run integrate` first';

const CAR = `radio.setGroup(1)
radio.setTransmitPower(7)
radio.onReceivedNumber(function (receivedNumber) {
    if (receivedNumber == 0) {
        motors.dualMotorPower(Motor.A, 50)
    }
    if (receivedNumber == 1) {
        motors.dualMotorPower(Motor.A, 0)
    }
    if (receivedNumber == 2) {
        motors.dualMotorPower(Motor.AB, 30)
    }
})
`;

test('a Calliope project imports its motors as words under its own DEVICE line', () => {
    const {code, unsupported} = microbitToPseudocode(CAR, {board: 'calliopemini', name: 'car'});
    assert.deepEqual(unsupported, []);
    assert.match(code, /^DEVICE CALLIOPEMINI$/m);
    assert.equal((code.match(/^\s+calliope motor A power 50 %$/gm) || []).length, 1);
    assert.equal((code.match(/^\s+calliope motor A power 0 %$/gm) || []).length, 1);
    // Motor.AB is both motors: two words, in order.
    assert.match(code, /calliope motor A power 30 %\n\s+calliope motor B power 30 %/);
});

test('a micro:bit project still has no motor: named, not translated', () => {
    const {code} = microbitToPseudocode(CAR, {name: 'car'});
    assert.match(code, /^DEVICE MICROBIT$/m);
    assert.doesNotMatch(code, /^\s+calliope motor/m);
    assert.match(code, /motors\.dualMotorPower\(\) — the Calliope on-board motor driver/);
});

test('the words become blocks and go back out as the MakeCode call', {skip: needsCompiler}, () => {
    const {code} = microbitToPseudocode(CAR, {board: 'calliopemini', name: 'car'});
    const project = new SB3Creator().parse(code);
    const motors = project.targets.flatMap(t => Object.values(t.blocks)).filter(b => b.opcode === 'microbitplus_motorpower');
    assert.deepEqual(motors.map(b => b.fields.MOTOR[0]), ['A', 'A', 'A', 'B']);
    const {ts, unsupported} = projectToMakeCodeTs(project);
    assert.deepEqual(unsupported, []);
    assert.equal((ts.match(/motors\.dualMotorPower\(Motor\.A, 50\)/g) || []).length, 1);
    assert.match(ts, /motors\.dualMotorPower\(Motor\.A, 30\)\s+motors\.dualMotorPower\(Motor\.B, 30\)/);
    assert.match(ts, /radio\.onReceivedNumber\(function \(receivedNumber\)/);
});

const STATIC = path.join(REPO, 'packages/scratch-gui/static/makecode');
const synced = fs.existsSync(path.join(STATIC, 'calliopemini', 'pxtworker.js'));
test('MakeCode\'s own compiler builds that export for the Calliope, offline', {skip: needsCompiler ||
    (synced ? false : 'MakeCode runtime not synced (npm run sync:makecode) — pxt compiler absent')}, async () => {
    const {code} = microbitToPseudocode(CAR, {board: 'calliopemini', name: 'car'});
    const {ts} = projectToMakeCodeTs(new SB3Creator().parse(code));
    const dir = path.join(STATIC, 'calliopemini');
    const quiet = () => {};
    const sb = {setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate,
        TextEncoder: util.TextEncoder, TextDecoder: util.TextDecoder, Buffer,
        console: {log: quiet, debug: quiet, info: quiet, warn: quiet, error: quiet},
        pxtTargetBundle: JSON.parse(fs.readFileSync(path.join(dir, 'target.json'), 'utf8'))};
    sb.global = sb;
    sb.self = sb;
    sb.eval = src => vm.runInContext(src, sb, {filename: 'eval'});
    vm.createContext(sb, {codeGeneration: {strings: false, wasm: false}});
    vm.runInContext(fs.readFileSync(path.join(dir, 'pxtworker.js'), 'utf8'), sb, {filename: 'pxtworker.js'});
    vm.runInContext(PXT_GLUE_JS, sb, {filename: 'pxt-glue.js'});
    const files = {'pxt.json': JSON.stringify({name: 'car', dependencies: {core: '*', radio: '*'}, files: ['main.ts']}), 'main.ts': ts};
    const getBaseHex = async sha => {
        const p = path.join(dir, 'hexcache', `${sha}.hex`);
        return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    };
    const r = JSON.parse(JSON.stringify(await sb.bwMakeCode.compile(files, {native: true, getBaseHex})));
    assert.equal(r.success, true, JSON.stringify((r.diagnostics || []).slice(0, 3)));
    assert.match(r.outfiles['binary.hex'], /^:/);
    assert.deepEqual(r.netAttempts, []);
});
