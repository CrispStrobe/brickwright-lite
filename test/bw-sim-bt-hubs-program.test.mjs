// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The EV3 and NXT in the Robot Lab, run for real (docs/ROBOT-LAB-EV3-NXT.md; plan P4/P5): programs
 * in the REAL extensions' blocks, the real Scratch VM, the VM's own Scratch Link socket served by
 * the BT-classic registry, the Lab's bricks behind the VirtualHub boundary, the Jolt physics
 * (test/helpers/bt-hub-vm.mjs). Nothing here commands a motor or reads a sensor itself.
 *
 *   NXT bumper bot (legonxt, the shipped example's blocks): both drive motors turn 360 ± 2° on a
 *     SETOUTPUTSTATE with a tacho limit, then the robot drives until the touch sensor's bumper
 *     meets the wall, and stops there.
 *   NXT motor reporters (legonxt): TachoLimit, TachoCount, BlockTachoCount and RotationCount read from
 *     their GETOUTPUTSTATE fields after three moves and a position reset.
 *   EV3 wall stopper (the stock Scratch `ev3` extension): drives at the wall and stops before it
 *     on the ultrasonic sensor's distance.
 *   EV3 wall stopper (DEVICE EV3, the shipped example → ev3comprehensive): the same scenario through
 *     the pseudocode's extension — known open: that extension sends nothing over Scratch Link
 *     (docs/ROBOT-LAB-EV3-NXT.md "Known open").
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {existsSync, readFileSync} from 'node:fs';
import {REPO, INTEGRATED} from './helpers/bw-integrated.mjs';

const GUI = path.join(REPO, 'overlay', 'scratch-gui');
const {MODELS, MODELS_BASE, PROGRAMS_BASE} = await import(path.join(GUI, 'src/lib/bw-sim/sim-session.js'));
const {WALL} = await import(path.join(GUI, 'src/lib/bw-sim/world/mats.js'));

const entry = file => MODELS.find(m => m.file === file);
const text = file => readFileSync(path.join(GUI, MODELS_BASE, file), 'utf8');
const program = name => readFileSync(path.join(GUI, PROGRAMS_BASE, name), 'utf8');

const missing = path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js');
if (!existsSync(missing)) {
    test('the EV3/NXT program runs: their inputs are present', () => {
        assert.fail(`missing ${path.relative(REPO, missing)} — run \`cd packages/scratch-gui && npm install --ignore-scripts --legacy-peer-deps\``);
    });
} else {
    const {runOnBtHub, projectOfBlocks} = await import('./helpers/bt-hub-vm.mjs');
    const {blocksBuilder} = await import('./helpers/scratch-blocks-builder.mjs');

    test('the NXT example\'s blocks go onto the editing sprite as the pane puts them there (vmBlocksOf + shareBlocksToTarget)', async () => {
        const {VM, FakeClock} = await import('./helpers/spike-arena-vm.mjs');
        const {vmBlocksOf} = await import(path.join(GUI, 'src/lib/bw-sim/blocks-example.js'));
        const example = JSON.parse(program('nxt-bumper-bot.blocks.json'));
        // Under the harness's clock: whatever timer the VM sets goes with it when it is uninstalled.
        const clock = new FakeClock(1.7e12);
        clock.install();
        const vm = new VM();
        let saved;
        try {
            await vm.loadProject(JSON.stringify(projectOfBlocks({extensions: [], blocks: {}})));
            const sprite = vm.runtime.targets.find(target => !target.isStage);
            await vm.shareBlocksToTarget(vmBlocksOf(example.blocks), sprite.id);
            saved = JSON.parse(vm.toJSON()).targets.find(target => !target.isStage).blocks;
        } finally {
            vm.quit();
            clock.uninstall();
        }
        // Number shadows are saved inline (sb3 primitives): compare the blocks that are blocks.
        const opcodes = blocks => Object.values(blocks).filter(b => b && b.opcode && !/^math_/.test(b.opcode)).map(b => b.opcode).sort();
        assert.deepEqual(opcodes(saved), opcodes(example.blocks), 'every block arrived');
        // The script reads the same once saved again: hat, setup, two 360° moves, wait, two motors on, wait for the bumper, two stops.
        const top = Object.values(saved).find(b => b.topLevel);
        const order = [];
        for (let b = top; b; b = saved[b.next]) order.push(b.opcode.replace(/^legonxt_/, ''));
        assert.deepEqual(order, ['event_whenflagclicked', 'setupTouchSensorNXT', 'motorRunDegrees', 'motorRunDegrees', 'control_wait',
            'motorOn', 'motorOn', 'control_wait_until', 'motorStop', 'motorStop']);
    });

    test('NXT bumper bot: legonxt turns B and C 360 ± 2°, then drives until the bumper meets the wall and stops', async t => {
        const nxt = entry('nxt-bumper-bot.ldr');
        assert.equal(nxt.example, 'nxt-bumper-bot.blocks.json');
        const blocks = JSON.parse(program(nxt.example));
        const plateau = {};
        const plateauCount = {};
        let pressedAt = null;
        const {track, hub, connectError} = await runOnBtHub({project: projectOfBlocks(blocks)}, {
            modelText: text(nxt.file), mat: nxt.mat, profile: 'nxt', extensionId: 'legonxt', timeLimitMs: 12000,
            stopWhen: (point, all, hub) => {
                // The 360° moves are the commands with a tacho limit; their result is the TachoCount the
                // brick reports (counted from power-on — the firmware never restarts it for a move,
                // docs/NXT-PROTOCOL-FACTS.md "Outputs" — and each port's first move starts at 0) once
                // the moves are over and before the next command (power 60, no limit) arrives.
                for (const port of ['B', 'C']) {
                    const o = hub.s.outputs['ABC'.indexOf(port)];
                    if (o.tachoLimit === 360 && o.runState === 0) {
                        plateau[port] = (o.angleDeg - o.moveStartDeg);
                        plateauCount[port] = hub.getOutputState('ABC'.indexOf(port)).tachoCount;
                    }
                }
                if (pressedAt === null && hub.getInputValues(0).scaled === 1) pressedAt = point.t;
                // Done: the bumper pressed, and a second later.
                return pressedAt !== null && point.t > pressedAt + 1000;
            }
        });
        assert.equal(connectError, null, 'legonxt connected to the Virtual NXT over Scratch Link');
        for (const port of ['B', 'C']) {
            assert.ok(plateau[port] !== undefined, `${port} ran a 360° move`);
            t.diagnostic(`${port}: ${plateau[port].toFixed(2)}° turned by the 360° move (TachoCount ${plateauCount[port]})`);
            assert.ok(Math.abs(plateauCount[port] - 360) <= 2, `${port}: TachoCount ${plateauCount[port]}`);
            assert.ok(Math.abs(plateau[port] - 360) <= 2, `${port} turned ${plateau[port].toFixed(2)}°`);
        }
        assert.ok(pressedAt !== null, 'the bumper was pressed');
        // Stopped on the touch: the motors stand still for the last half second, the robot at the wall.
        const last = track.at(-1);
        const before = track.find(p => p.t >= last.t - 500);
        for (const port of ['B', 'C']) assert.ok(Math.abs(last.motors[port] - before.motors[port]) < 3, `${port} stopped`);
        t.diagnostic(`bumper pressed at ${(pressedAt / 1000).toFixed(2)} s; robot at x = ${last.position[0].toFixed(3)} m, wall face ${WALL.faceX} m`);
        assert.ok(last.position[0] < WALL.faceX, 'in front of the wall');
        assert.equal(hub.getInputValues(0).scaled, 1, 'still pressed against it');
    });

    /**
     * legonxt's motor reporters read GETOUTPUTSTATE (NXT BDK Appendix 2: 9–12 TachoLimit, 13–16
     * TachoCount, 17–20 BlockTachoCount, 21–24 RotationCount, after 0x02 0x06 status port power mode
     * regulation turn-ratio run-state). Three moves on B with RESETMOTORPOSITION (absolute) between the
     * first two make the three counters differ — 90 (the last move), 630 (all of them), 270 (since the
     * reset) — so a reporter reading the wrong field, or RotationCount at 23–26 as CrispStrobe/extensions
     * did before 1cf214d (on its bridge path), cannot pass.
     */
    test('NXT motor reporters: legonxt reads TachoCount, BlockTachoCount and RotationCount from the Virtual NXT', async t => {
        const nxt = entry('nxt-bumper-bot.ldr');
        const b = blocksBuilder();
        const port = () => ['legonxt_menu_MOTOR_PORT', 'MOTOR_PORT', 'B'];
        const move = degrees => b.block('legonxt_motorRunDegrees', {menus: {PORT: port()}, values: {POWER: 50, DEGREES: degrees}});
        const settle = () => b.block('control_wait', {values: {DURATION: {value: 1.5, op: 'math_positive_number'}}});
        const READS = {tacho: 'legonxt_getMotorTachoCount', block: 'legonxt_getMotorBlockTachoCount',
            rotation: 'legonxt_getMotorRotationCount', position: 'legonxt_getMotorPosition', limit: 'legonxt_getMotorTachoLimit'};
        const variables = {};
        const sets = Object.entries(READS).map(([name, opcode]) => {
            const id = `var-${name}`;
            variables[id] = [name, 0];
            const reporter = b.block(opcode, {menus: {PORT: port()}});
            const set = b.block('data_setvariableto', {fields: {}, blocksIn: {VALUE: reporter}});
            b.blocks[set].fields.VARIABLE = [name, id];
            b.blocks[set].inputs.VALUE = [3, reporter, [10, '']];
            return set;
        });
        b.stack(b.block('event_whenflagclicked', {top: true}), move(360), settle(),
            b.block('legonxt_resetMotorPosition', {menus: {PORT: port()}}), move(180), settle(), move(90), settle(), ...sets);
        const project = projectOfBlocks({extensions: ['legonxt'], blocks: b.blocks});
        project.targets[1].variables = variables;
        let state = null;
        const {vm, connectError} = await runOnBtHub({project}, {
            modelText: text(nxt.file), mat: nxt.mat, profile: 'nxt', extensionId: 'legonxt', timeLimitMs: 8000,
            // The brick's counters when the script has ended (the reads are its last blocks).
            stopWhen: (point, all, hub) => {
                if (point.t < 1000 || point.running) return false;
                state = hub.getOutputState(1);
                return true;
            }
        });
        assert.equal(connectError, null, 'legonxt connected to the Virtual NXT over Scratch Link');
        assert.ok(state, 'the script ended');
        const sprite = vm.runtime.targets.find(target => !target.isStage);
        const read = Object.fromEntries(Object.keys(READS).map(name => [name, Number(sprite.variables[`var-${name}`].value)]));
        t.diagnostic(`reporters ${JSON.stringify(read)}; brick ${JSON.stringify(state)}`);
        // The brick's own counters first: what the moves made them. No direct command restarts TachoCount
        // (docs/NXT-PROTOCOL-FACTS.md "Outputs"), so it counts all three moves like BlockTachoCount does;
        // RotationCount alone was reset after the first move, and TachoLimit is the last move's.
        assert.ok(Math.abs(state.tachoCount - 630) <= 9, `TachoCount ${state.tachoCount}`);
        assert.ok(Math.abs(state.rotationCount - 270) <= 6, `RotationCount ${state.rotationCount}`);
        assert.ok(Math.abs(state.blockTachoCount - 630) <= 9, `BlockTachoCount ${state.blockTachoCount}`);
        // Then each reporter against the field it names (the motor stands still once the moves end).
        assert.equal(read.limit, 90, 'TachoLimit (9–12)');
        assert.ok(Math.abs(read.tacho - state.tachoCount) <= 1, `TachoCount (13–16): ${read.tacho}`);
        assert.ok(Math.abs(read.block - state.blockTachoCount) <= 1, `BlockTachoCount (17–20): ${read.block}`);
        assert.ok(Math.abs(read.rotation - state.rotationCount) <= 1, `RotationCount (21–24): ${read.rotation}`);
        assert.equal(read.position, read.rotation, '"motor position" is the RotationCount');
    });

    /**
     * The stock Scratch EV3 extension's blocks: per motor, power 30, then turn this way 0.2 s until
     * distance < 10 (inches: the stock extension reads the ultrasonic sensor in mode 1). Half a second
     * first: the extension reports distance 0 until its first poll of the brick has come back. The
     * margin is the extension's: it polls every 150 ms and each turn runs its 0.2 s to the end.
     */
    const stockEv3Program = () => {
        const b = blocksBuilder();
        const motorMenu = port => ['ev3_menu_motorPorts', 'motorPorts', 'ABCD'.indexOf(port)];
        for (const port of ['B', 'C']) {
            const flag = b.block('event_whenflagclicked', {top: true});
            const power = b.block('ev3_motorSetPower', {menus: {PORT: motorMenu(port)}, values: {POWER: 30}});
            const turn = b.block('ev3_motorTurnClockwise', {menus: {PORT: motorMenu(port)}, values: {TIME: 0.2}});
            const distance = b.block('ev3_getDistance');
            const lt = b.block('operator_lt', {blocksIn: {OPERAND1: distance}});
            b.blocks[lt].inputs.OPERAND2 = [1, b.shadow('text', 'TEXT', '10', lt)];
            const loop = b.block('control_repeat_until', {blocksIn: {CONDITION: lt, SUBSTACK: turn}});
            const settle = b.block('control_wait', {values: {DURATION: {value: 0.5, op: 'math_positive_number'}}});
            b.stack(flag, power, settle, loop);
        }
        return {extensions: ['ev3'], blocks: b.blocks};
    };

    test('EV3 wall stopper: the stock Scratch EV3 blocks drive at the wall and stop before it', async t => {
        const ev3 = entry('ev3-wall-stopper.ldr');
        const {track, hub, connectError} = await runOnBtHub({project: projectOfBlocks(stockEv3Program())}, {
            modelText: text(ev3.file), mat: ev3.mat, profile: 'ev3', extensionId: 'ev3', timeLimitMs: 8000
        });
        assert.equal(connectError, null, 'the stock ev3 extension connected to the Virtual EV3 over Scratch Link');
        const start = track[0].position[0];
        const last = track.at(-1);
        const travelled = last.position[0] - start;
        // The sensor's distance (SI cm) where it stopped: the stock extension reads mode 1, inches.
        const cm = hub.readInput(0, 3, 0, 0, 'READY_SI').values[0];
        t.diagnostic(`travelled ${travelled.toFixed(3)} m, stopped ${cm} cm from the wall`);
        assert.ok(travelled > 0.2, 'it drove at the wall');
        assert.ok(cm > 2 && cm < 25.4, `stopped before the wall, within 10 in: ${cm} cm`);
        const before = track.find(p => p.t >= last.t - 1000);
        assert.ok(Math.abs(last.position[0] - before.position[0]) < 0.005, 'stood still for its last second');
        assert.equal(last.running, false, 'both scripts ended');
    });

    // Was {todo} until CrispStrobe/extensions ea3e08e (PR #53) fixed ev3comprehensive's Scratch Link
    // isConnected() and its reply buffer (docs/ROBOT-LAB-EV3-NXT.md).
    test('EV3 wall stopper: the DEVICE EV3 example through ev3comprehensive', async () => {
        const ev3 = entry('ev3-wall-stopper.ldr');
        assert.match(program(ev3.example), /^DEVICE EV3\s*$/m);
        const {track, hub, connectError} = await runOnBtHub({bw: program(ev3.example)}, {
            modelText: text(ev3.file), mat: ev3.mat, profile: 'ev3', extensionId: 'ev3comprehensive', timeLimitMs: 6000
        });
        assert.equal(connectError, null);
        const travelled = track.at(-1).position[0] - track[0].position[0];
        const cm = hub.readInput(0, 3, 0, 0, 'READY_SI').values[0];
        assert.ok(travelled > 0.2, `it drove at the wall (${travelled.toFixed(3)} m)`);
        assert.ok(cm > 2 && cm < 15, `stopped before the wall: ${cm} cm`);
    });

    /**
     * "start motor at % power" (CrispStrobe/extensions#60) on the two bricks: an unregulated duty, where every
     * other motor block of these extensions asks for a speed the brick regulates. EV3: the DEVICE EV3 word, which
     * is opOUTPUT_POWER + opOUTPUT_START (EV3 Firmware Developer Kit); NXT: the legonxt block, SETOUTPUTSTATE with
     * MOTORON | BRAKE and regulation IDLE (BDK Appendix 2). Judged from the brick's own output state each frame:
     * the port runs open (no regulation) at a duty of power/100, and the robot drives.
     */
    test('EV3 "start motor BC at 40 % power" and "nxt start motor B at 40 % power" drive the motors open loop, at that duty', async t => {
        const ev3 = entry('ev3-wall-stopper.ldr');
        const nxt = entry('nxt-bumper-bot.ldr');
        // The NXT's blocks as `nxt start motor B at 40 % power` makes them (lib/legoHubsDialect.js; this harness
        // parses with the pinned compiler alone, without the robot-lab door the nxt words come through).
        const b = blocksBuilder();
        const port = p => ['legonxt_menu_MOTOR_PORT', 'MOTOR_PORT', p];
        b.stack(b.block('event_whenflagclicked', {top: true}),
            ...['B', 'C'].map(p => b.block('legonxt_motorStartPower', {menus: {PORT: port(p)}, values: {POWER: 40}})),
            b.block('control_wait', {values: {DURATION: {value: 2, op: 'math_positive_number'}}}));
        const runs = [
            ['EV3', {bw: 'DEVICE EV3\n\nWHEN flag clicked:\n  start motor BC at 40 % power\n  wait 2 seconds\n'},
                {modelText: text(ev3.file), mat: null, profile: 'ev3', extensionId: 'ev3comprehensive'}],
            ['NXT', {project: projectOfBlocks({extensions: ['legonxt'], blocks: b.blocks})},
                {modelText: text(nxt.file), mat: null, profile: 'nxt', extensionId: 'legonxt'}]
        ];
        for (const [name, source, options] of runs) {
            const seen = [];
            const {track, connectError} = await runOnBtHub(source, {...options, timeLimitMs: 1500,
                stopWhen: (point, all, hub) => {
                    seen.push(['B', 'C'].map(p => {
                        const o = hub.s.outputs['ABCD'.indexOf(p)];
                        return {regulating: o.regulating, duty: o.duty};
                    }));
                    return false;
                }});
            assert.equal(connectError, null, `${name}: connected`);
            const driven = seen.filter(ports => ports.every(o => o.duty !== 0));
            const travelled = Math.hypot(track.at(-1).position[0] - track[0].position[0], track.at(-1).position[2] - track[0].position[2]);
            t.diagnostic(`${name}: ${driven.length} of ${seen.length} frames driven, duties ${JSON.stringify(driven.at(-1))}; drove ${(travelled * 100).toFixed(1)} cm`);
            assert.ok(driven.length > seen.length / 2, `${name}: the motors were driven`);
            for (const ports of driven) {
                for (const o of ports) {
                    assert.equal(o.regulating, false, `${name}: no speed regulation`);
                    assert.ok(Math.abs(Math.abs(o.duty) - 0.4) < 1e-9, `${name}: the duty is power/100 (${o.duty})`);
                }
            }
            assert.ok(travelled > 0.05, `${name}: the robot drove (${travelled} m)`);
        }
    });
}
