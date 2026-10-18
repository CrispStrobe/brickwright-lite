// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The Robot Lab's SPIKE firmware route runs the USER's program
 * (docs/ROBOT-LAB-SPIKE-EMULATION.md §2.6, §7.4): the Code tab's blocks, compiled by
 * the SPIKE arena's firmware-program compiler, are uploaded before lockstep and
 * STARTed/STOPped inside it — here against the in-process fake emulator
 * (bw-sim-renode-lockstep-fake.mjs: its program.packet / program.control.submit and
 * mailbox model the state service and the NuttX firmware's).
 *
 * Proven by what the fake received and what the physics did (no value below is one
 * the test set):
 *   - the order of operations: session.start → state.read → run → program.packet
 *     (BEGIN, CHUNK…, COMMIT) → lockstep.begin → steps → START → steps … → STOP → steps
 *     → lockstep.end → session.close; Reset while running STOPs before lockstep ends;
 *   - the robot stands until START, and drives the compiled program after it;
 *   - Run again after the program completed sends STOP then START (one mailbox request
 *     at a time, told apart by their operation); a refused START is reported, not hidden;
 *   - a program the ABI refuses starts no emulator;
 *   - the compiler's refusals name the block, in English and German, for every code it has;
 *     `move forward … seconds` compiles, `move forward … cm` and a two-motor
 *     `run … degrees` are refused as two-motor position moves.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {SimSession, catalogFrom, MODELS_BASE} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {openLockstepRoute, compileRouteProgram} from '../overlay/scratch-gui/src/lib/bw-sim/routes/renode-lockstep/route.js';
import {LOCKSTEP_OPS} from '../overlay/scratch-gui/src/lib/bw-sim/routes/renode-lockstep/contract.js';
import {compileFirmwareProgram, FirmwareProgramError} from '../overlay/scratch-gui/src/lib/spike-arena/firmware-program.js';
import {encodeInstructions, PROGRAM_OP} from '../overlay/scratch-gui/src/lib/spike-nuttx/upload-protocol.js';
import {FIRMWARE_TEXT, firmwareRefusalSentence} from '../overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-firmware-text.js';
import {FakeSpikeRenode} from './bw-sim-renode-lockstep-fake.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIM = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim');
const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(SIM, 'part-meta/parts.json'), 'utf8')));
const MODEL_TEXT = readFileSync(path.join(ROOT, 'overlay/scratch-gui', MODELS_BASE, 'driving-base.ldr'), 'latin1');
const COMPILER_SOURCE = readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/spike-arena/firmware-program.js'), 'utf8');
const DEG = 180 / Math.PI;

/** The VM's block tree for a pseudocode program (literal tuples -> shadow blocks), as the pane's vm holds it. */
const vmOf = body => {
    const creator = new SB3Creator();
    creator.parse(`DEVICE SPIKE\nWHEN flag clicked:\n${body}`);
    assert.deepEqual(creator.warnings, []);
    const targets = creator.project.targets.map(t => {
        const blocks = structuredClone(t.blocks);
        let serial = 0;
        for (const [id, block] of Object.entries(blocks)) {
            block.id = id;
            block.fields = Object.fromEntries(Object.entries(block.fields).map(([k, v]) => [k, {value: v[0]}]));
            block.inputs = Object.fromEntries(Object.entries(block.inputs).map(([k, v]) => {
                if (typeof v[1] === 'string') return [k, {block: v[1]}];
                const shadow = `literal-${serial++}`;
                blocks[shadow] = {id: shadow, opcode: 'text', shadow: true, fields: {TEXT: {value: v[1][1]}}};
                return [k, {block: shadow}];
            }));
        }
        return {isOriginal: true, blocks: {_blocks: blocks, getScripts: () => Object.keys(blocks).filter(id => blocks[id].topLevel)}};
    });
    return {runtime: {targets}};
};
const compiled = body => {
    const {program, error} = compileRouteProgram(vmOf(body));
    if (error) throw error;
    return program;
};

/** Operation names with consecutive repeats folded: [[op, count], …]. */
const folded = log => log.reduce((out, [op]) => {
    if (out.length && out.at(-1)[0] === op) out.at(-1)[1]++;
    else out.push([op, 1]);
    return out;
}, []);
const short = op => op.replace('renode.spike.', '');

/** The firmware route's scene for the shipped driving base, as the pane opens it. */
const openScene = async (program, fake = new FakeSpikeRenode()) => {
    const changes = [];
    const route = await openLockstepRoute({transport: fake, program, onProgramChange: c => changes.push(c.stateName)});
    let hub = null;
    const {session} = await SimSession.fromText(MODEL_TEXT, {hubState: null, catalog: CATALOG,
        createHub: def => (hub = route.createHub(def))});
    assert.ok(session && hub, 'the scene opened on the route');
    const byPort = new Map(session.mechanism.actuators.map(a => [a.port, a.joint]));
    const angle0 = new Map([...byPort].map(([port, joint]) => [port, session.core.jointState(joint).angle]));
    const wheels = () => Object.fromEntries([...byPort].map(([port, joint]) => [port, (session.core.jointState(joint).angle - angle0.get(port)) * DEG]));
    const steps = async (n, until = () => false) => {
        for (let k = 0; k < n && !until(); k++) {
            session.tick(5);
            await session.idle();
        }
    };
    return {fake, route, session, hub, wheels, steps, changes};
};

const DRIVE = '  start tank 27 27\n  wait 0.3 seconds\n  stop movement\n';

test('the route uploads before lockstep, STARTs on Run, STOPs on Pause, and STOPs before lockstep ends', async () => {
    const program = compiled(DRIVE);
    const {fake, route, session, wheels, steps, hub} = await openScene(program);
    const control = route.program;
    assert.equal(control.stateName, 'ready', 'the firmware holds the uploaded program');
    assert.deepEqual(fake.firmware.program, program.instructions, 'the firmware holds exactly the compiled instructions');
    // Before Run: lockstep runs, the program does not; the robot stands.
    await steps(20);
    assert.equal(fake.programState, 'ready');
    assert.ok(hub.read.drives.every(d => d.meanDrive === 0), 'the firmware drives nothing before Run');
    // (The base settles on its wheels a few hundredths of a degree; it does not drive.)
    assert.ok(Object.values(wheels()).every(a => Math.abs(a) < 0.5), `the robot stands before Run (${JSON.stringify(wheels())})`);
    // Run.
    await control.start();
    await steps(400, () => fake.programState === 'complete');
    assert.equal(fake.programState, 'complete', 'the program ran to its end');
    assert.equal(control.stateName, 'complete', 'and the route read that from the step snapshots');
    const w = wheels();
    assert.ok(w.B > 50 && w.A < -50 && Math.abs(w.A + w.B) < 0.05 * w.B, `the robot drove forward (${JSON.stringify(w)})`);
    // Run again, then Pause mid-drive.
    await control.start();
    await steps(100, () => fake.programState === 'running');
    assert.equal(fake.programState, 'running', 'Run again restarts the completed program');
    await steps(10);
    await control.stop();
    await steps(100, () => control.idle && fake.programState === 'stopped');
    assert.equal(fake.programState, 'stopped', 'Pause stopped it');
    await steps(5);
    assert.ok(hub.read.drives.every(d => d.meanDrive === 0 && d.brakingTicks === d.ticks), 'the firmware brakes what it owned');
    // Run again from STOPPED: START alone (a STOP is the last control), then Reset while it runs.
    await control.start();
    await steps(100, () => fake.programState === 'running');
    session.dispose();
    await new Promise(resolve => setTimeout(resolve, 0));
    await route.driver.end();
    assert.deepEqual(control.sent.map(c => c.op), [PROGRAM_OP.START, PROGRAM_OP.STOP, PROGRAM_OP.START, PROGRAM_OP.STOP,
        PROGRAM_OP.START, PROGRAM_OP.STOP], 'START; STOP+START (Run again); STOP (Pause); START; STOP (Reset)');

    const ops = folded(fake.log);
    const packets = 2 + Math.ceil(encodeInstructions(program).length / 10);
    assert.deepEqual(ops.slice(0, 5).map(([op, n]) => [short(op), n]),
        [['session.start', 1], ['state.read', 1], ['run', 1], ['program.packet', packets], ['lockstep.begin', 1]],
        'session, target check, guest running, upload (BEGIN, CHUNK…, COMMIT), then lockstep');
    const packetOps = fake.log.filter(([op]) => op === LOCKSTEP_OPS.programPacket).map(([, args]) => args.bytes[2]);
    assert.deepEqual(packetOps, [0, ...Array(packets - 2).fill(1), 2], 'BEGIN, CHUNK×n, COMMIT — no START packet');
    const tail = ops.slice(5).map(([op]) => short(op));
    assert.deepEqual(tail, ['lockstep.step', 'program.control.submit', 'lockstep.step', 'program.control.submit', 'lockstep.step',
        'program.control.submit', 'lockstep.step', 'program.control.submit', 'lockstep.step', 'program.control.submit', 'lockstep.step',
        'program.control.submit', 'lockstep.end', 'session.close'], 'every control inside lockstep; the last STOP before lockstep.end');
    const controls = fake.log.filter(([op]) => op === LOCKSTEP_OPS.programControl).map(([, args]) => args.bytes[2]);
    assert.deepEqual(controls, control.sent.map(c => c.op));
});

test('a refused START is reported by the route, never a silent stand-still', async () => {
    const {fake, route, steps} = await openScene(compiled(DRIVE));
    // The firmware's program id no longer matches (as after another client's upload): START refused.
    fake.firmware.programId = 99;
    await route.program.start();
    await steps(10, () => route.program.failed);
    assert.ok(route.program.failed, 'the refusal reached the route');
    assert.equal(route.program.failed.code, 'control-refused');
    assert.match(route.program.failed.message, /refused START \(-22\)/);
    await route.driver.end();
});

test('a program the firmware ABI refuses starts no emulator', async () => {
    const fake = new FakeSpikeRenode();
    await assert.rejects(openLockstepRoute({transport: fake, program: {version: 1, instructions: [[1, 0, 5000, 0], [0, 0, 0, 0]]}}),
        /firmware ABI bounds/);
    assert.deepEqual(fake.log, [], 'nothing was sent');
    // No program at all (the blocks did not compile): the route opens, nothing is uploaded.
    const open = await openLockstepRoute({transport: fake});
    assert.equal(open.program, null);
    assert.ok(!fake.log.some(([op]) => op === LOCKSTEP_OPS.programPacket));
    await open.driver.end();
});

test('pseudocode `move forward … seconds` compiles (DIRECTION is the menu word, not ±1)', () => {
    assert.deepEqual(compiled('  set movement speed 30\n  move forward 1.5 seconds\n').instructions,
        [[1, 0, -333, 0], [1, 1, 333, 0], [2, 1500, 0, 0], [1, 0, 0, 0], [1, 1, 0, 0], [0, 0, 0, 0]]);
    assert.deepEqual(compiled('  set movement speed 30\n  move backward 1 seconds\n').instructions,
        [[1, 0, 333, 0], [1, 1, -333, 0], [2, 1000, 0, 0], [1, 0, 0, 0], [1, 1, 0, 0], [0, 0, 0, 0]]);
    // The same drive as `start tank` + `wait` + `stop movement`.
    assert.deepEqual(compiled('  set movement speed 27\n  move forward 2 seconds\n').instructions,
        compiled('  start tank 27 27\n  wait 2 seconds\n  stop movement\n').instructions);
    const vm = vmOf('  move forward 1 seconds\n');
    Object.values(vm.runtime.targets[0].blocks._blocks).find(b => b.opcode === 'spikeprime_moveForward').fields.DIRECTION.value = 'sideways';
    assert.throws(() => compileFirmwareProgram(vm), e => e.code === 'direction' && e.block === 'move sideways 1 seconds');
});

test('a two-motor position move is refused, naming the block', () => {
    for (const [body, block, unit] of [['  move forward 10 cm\n', 'move forward 10 cm', 'cm'],
        ['  move forward 360 degrees\n', 'move forward 360 degrees', 'degrees'],
        ['  move backward 2 rotations\n', 'move backward 2 rotations', 'rotations']]) {
        const {program, error} = compileRouteProgram(vmOf(body));
        assert.equal(program, null);
        assert.ok(error instanceof FirmwareProgramError);
        assert.equal(error.code, 'two-motor-position');
        assert.equal(error.block, block);
        assert.equal(error.params.unit, unit);
        assert.equal(error.opcode, 'spikeprime_moveForward');
        assert.ok(error.blockId, 'the block id, to find it in the workspace');
    }
    // "run motor AB 360 degrees" exists only as blocks (the dialect names one port).
    const vm = vmOf('  set motor speed A 50\n  set motor speed B 50\n  run motor A forward 360 degrees\n');
    Object.values(vm.runtime.targets[0].blocks._blocks).find(b => b.opcode === 'spikeprime_motorRunFor').fields.PORT.value = 'AB';
    assert.throws(() => compileFirmwareProgram(vm), e => e.code === 'two-motor-position' && e.block === 'run motor AB forward 360 degrees');
});

test('every refusal the compiler has is a sentence in English and German that names the block', () => {
    const codes = new Set([...COMPILER_SOURCE.matchAll(/(?:refuse|FirmwareProgramError)\('([a-z-]+)'/g)].map(m => m[1]));
    assert.ok(codes.size >= 15, `found the compiler's codes (${[...codes].join(', ')})`);
    for (const locale of ['en', 'de']) {
        for (const code of codes) assert.ok(FIRMWARE_TEXT[locale].reasons[code], `${locale}: no sentence for '${code}'`);
        assert.deepEqual(Object.keys(FIRMWARE_TEXT[locale].reasons).sort(), Object.keys(FIRMWARE_TEXT.en.reasons).sort());
    }
    const {error} = compileRouteProgram(vmOf('  move forward 10 cm\n'));
    assert.match(firmwareRefusalSentence('en', error), /“move forward 10 cm”: the firmware cannot turn two motors together by centimetres/);
    assert.match(firmwareRefusalSentence('de', error), /„move forward 10 cm“: Die Firmware kann zwei Motoren nicht gemeinsam um Zentimeter drehen/);
    const say = compileRouteProgram(vmOf('  say "hello"\n')).error;
    assert.equal(say.code, 'unsupported-block');
    assert.match(firmwareRefusalSentence('en', say), /no form for the block “looks_say”/);
    assert.match(firmwareRefusalSentence('de', say), /Für den Block „looks_say“ hat die Firmware keine Form/);
    const sensor = compileRouteProgram(vmOf('  start tank 20 20\n  wait until spike distance C in mm < 250\n')).error;
    assert.equal(sensor.code, 'sensor-port');
    assert.match(firmwareRefusalSentence('en', sensor), /“wait until spike distance C in mm < 250”: the firmware reads the distance sensor on port D only/);
    assert.match(firmwareRefusalSentence('de', sensor), /Abstandssensor nur an Anschluss D/);
    // A compiler error without a code (the topology check) still says what it is.
    assert.match(firmwareRefusalSentence('de', new Error('Unknown topology')), /Unknown topology/);
});
