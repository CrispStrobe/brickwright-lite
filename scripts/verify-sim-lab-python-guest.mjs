#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Required real own-NuttX embedded Python, through the actual Lab route/physics.
// No reference firmware, upstream raw REPL, native-app or hardware claim.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchRenode, monitorCommand, StateServiceTransport} from './lib/sim-lab-renode-guest.mjs';
import {SimSession, catalogFrom} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {loadJolt} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {openLockstepRoute} from '../overlay/scratch-gui/src/lib/bw-sim/routes/renode-lockstep/route.js';
import {PROGRAM_STATE} from '../overlay/scratch-gui/src/lib/spike-nuttx/upload-protocol.js';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const renodePath = process.env.BW_RENODE, packagePath = process.env.BW_SIMLAB_NUTTX_PACKAGE;
assert.ok(renodePath && existsSync(renodePath), 'required Renode executable');
for (const f of ['nuttx.resc', 'nuttx-kernel.elf', 'nuttx-user.elf', 'state-config.json', 'tools/spike_lockstep.py', 'tools/spike_nuttx_mailbox.py']) {
    assert.ok(packagePath && existsSync(path.join(packagePath, f)), `required package ${f}`);
}
const SIM = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim');
const catalog = catalogFrom(JSON.parse(readFileSync(path.join(SIM, 'part-meta/parts.json'), 'utf8')));
const base = readFileSync(path.join(ROOT, 'overlay/scratch-gui/static/sim-lab/models/wall-stopper.ldr'), 'utf8');
// Use the shipped wall stopper's mechanically mounted distance sensor. The
// wrong-scene control removes the wall via the actual plain mat, not fake data.
const report = {schema: 'robot-lab-own-python/v1', cases: [], failures: []};
let renode, transport, active;
const output = frame => frame?.lifecycle?.nuttxProgramOutput;
const frameOf = run => run.hub.read.frame;
async function step (run, count = 1) {
    for (let i = 0; i < count; i++) {
        run.session.tick(5);await run.session.idle();
        const frame = frameOf(run), p = frame.lifecycle.nuttxProgram, out = output(frame);
        assert.ok(out && out.truncated === false && typeof out.text === 'string', 'bounded untruncated Python output');
        run.text = out.text;run.states.add(p.state);
        run.last = {state: p.state, error: p.error, positions: p.positions, duties: p.duties,
            physicalAngles: Object.fromEntries([...run.joints].map(([port, joint]) => [port, (run.session.core.jointState(joint).angle - run.angle0.get(port)) * 180 / Math.PI])),
            sensor: structuredClone(run.hub.sensors.get('D') || null),
            motors: run.hub.read.motors.map(m => ({port: m.port, position: m.position, speedDps: m.speedDps})),
            drives: run.hub.read.drives.map(d => ({port: d.port, meanDrive: d.meanDrive, brakingTicks: d.brakingTicks, ticks: d.ticks}))};
    }
}
async function until (run, predicate, maxSteps, label) {
    for (let i = 0; i < maxSteps; i++) {await step(run);if (predicate()) return;}
    throw Error(`${label} exceeded ${maxSteps * 5} ms virtual: ${JSON.stringify(run.last)}`);
}
async function open (name, source, facing = true) {
    const before = transport.validated.packet;
    const route = await openLockstepRoute({transport, manageSession: false, pythonSource: source});
    assert.equal(route.program.stateName, 'ready');
    assert.ok(transport.validated.packet > before, 'actual source uploaded before lockstep');
    let hub;
    const {session, issues} = await SimSession.fromText(base, {catalog, mat: facing ? 'wall' : 'plain', createHub: def => (hub = route.createHub(def))});
    assert.ok(session?.lockstep && hub, JSON.stringify(issues));
    const joints = new Map(session.mechanism.actuators.map(a => [a.port, a.joint]));
    const angle0 = new Map([...joints].map(([port, joint]) => [port, session.core.jointState(joint).angle]));
    const run = {name, source, route, session, hub, joints, angle0, states: new Set(), text: '', packets: transport.validated.packet, last: null};
    active = run;await route.program.start();return run;
}
async function close (run) {
    await run.route.driver.end();run.session.dispose();active = null;
    report.cases.push({name: run.name, states: [...run.states], output: run.text, last: run.last,
        controls: run.route.program.sent.map(c => c.op), uploadPackets: run.packets, complete: run.complete || null});
}
const motionSource = `import brickwright as b
assert sum([x*x for x in range(6)]) == 55
print("WP6_BEGIN")
b.motor(b.A, 300)
b.sleep_ms(400)
b.motor(b.A, 0)
print("WP6_DONE")
`;
try {
    renode = await launchRenode(renodePath, packagePath);
    await monitorCommand(renode.monitorPort, 'start');await loadJolt();
    transport = new StateServiceTransport(renode.statePort);await transport.connect();
    report.imageSha256 = transport.latest.target.imageSha256;
    const run = await open('embedded computation and physical motor', motionSource);
    const initial = run.hub.read.motors.find(m => m.port === 'A').position;
    await until(run, () => run.route.program.idle && run.route.program.state === PROGRAM_STATE.COMPLETE, 1200, 'Python completion');
    assert.ok(run.states.has(PROGRAM_STATE.RUNNING));assert.equal(run.last.error, 0);
    assert.match(run.text, /WP6_BEGIN/);assert.match(run.text, /WP6_DONE/);
    assert.ok(Math.abs(run.last.motors.find(m => m.port === 'A').position - initial) > 20, 'real physics shaft moved');
    assert.equal(run.last.duties[0], 0, 'completed program stopped motor demand');
    assert.ok(Math.abs(run.last.physicalAngles.A) > 20, 'actual Jolt hinge moved');
    run.complete = {output: run.text, last: structuredClone(run.last)};
    await run.route.program.start();
    await until(run, () => run.route.program.idle && run.route.program.state === PROGRAM_STATE.RUNNING, 100, 'retained restart');
    assert.equal(transport.validated.packet, run.packets, 'retained restart did not reupload source');
    await run.route.program.stop();
    await until(run, () => run.route.program.idle && run.route.program.state === PROGRAM_STATE.STOPPED, 100, 'retained Stop');
    await step(run, 60);
    assert.equal(run.last.duties[0], 0);assert.ok(run.last.drives.find(d => d.port === 'A').meanDrive === 0);
    assert.deepEqual(run.route.program.sent.map(c => c.op), [3, 4, 3, 4]);
    await close(run);

    const sleeping = await open('Stop interrupts actual Python sleep', 'import brickwright as b\nprint("WP6_SLEEP")\nb.motor(b.A,300)\nb.sleep_ms(3000)\nprint("WP6_TOO_LATE")\n');
    await until(sleeping, () => sleeping.text.includes('WP6_SLEEP') && sleeping.states.has(PROGRAM_STATE.RUNNING), 100, 'sleep start');
    await step(sleeping, 60);await sleeping.route.program.stop();
    await until(sleeping, () => sleeping.route.program.idle && sleeping.route.program.state === PROGRAM_STATE.STOPPED, 100, 'sleep Stop');
    await step(sleeping, 60);assert.doesNotMatch(sleeping.text, /WP6_TOO_LATE/);
    assert.equal(sleeping.last.duties[0], 0);
    const drive = sleeping.last.drives.find(d => d.port === 'A');
    assert.ok(drive.meanDrive === 0 && drive.brakingTicks === drive.ticks, 'actual stopped bridge brakes');
    await close(sleeping);

    const sensorSource = 'import brickwright as b\nb.sleep_ms(500)\nd=b.sensor(1)\nprint("WP6_SENSOR",d)\nassert 0 < d < 2000\nprint("WP6_SENSOR_PASS")\n';
    for (const facing of [true, false]) {
        const sensor = await open(facing ? 'scene sensor positive' : 'wrong scene sensor control', sensorSource, facing);
        await until(sensor, () => sensor.route.program.idle && [PROGRAM_STATE.COMPLETE, PROGRAM_STATE.FAULT].includes(sensor.route.program.state), 1200, 'sensor terminal');
        assert.match(sensor.text, /WP6_SENSOR/);
        assert.ok(sensor.last.sensor?.raw, 'the real physical scene supplied the probe');
        if (facing) {assert.ok(sensor.last.sensor.raw.distance > 0 && sensor.last.sensor.raw.distance < 2000);assert.equal(sensor.route.program.state, PROGRAM_STATE.COMPLETE);assert.match(sensor.text, /WP6_SENSOR_PASS/);}
        else {assert.equal(sensor.last.sensor.raw.distance, -1);assert.equal(sensor.route.program.state, PROGRAM_STATE.FAULT);assert.doesNotMatch(sensor.text, /WP6_SENSOR_PASS/);}
        await close(sensor);
    }
    const fault = await open('actual Python OSError fault', 'print("WP6_FAULT")\nraise OSError(5)\n');
    await until(fault, () => fault.route.program.idle && fault.route.program.state === PROGRAM_STATE.FAULT, 1200, 'OSError fault');
    assert.equal(fault.last.error, -5);assert.match(fault.text, /WP6_FAULT/);await close(fault);
    const recovery = await open('distinct source recovery', 'print("WP6_RECOVERED",sum(range(10)))\n');
    await until(recovery, () => recovery.route.program.idle && recovery.route.program.state === PROGRAM_STATE.COMPLETE, 1200, 'distinct recovery');
    assert.equal(recovery.last.error, 0);assert.match(recovery.text, /WP6_RECOVERED 45/);await close(recovery);
    assert.ok(transport.validated.begin >= 6 && transport.validated.control > 0 && transport.validated.step > 0);
    report.validated = transport.validated;
} catch (error) {
    report.failures.push(error.stack || error.message);console.error(error.stack);
} finally {
    if (active) {try {await active.route.driver.end();} catch {} active.session.dispose();}
    transport?.close();renode?.child.kill('SIGKILL');
}
const arg = process.argv.indexOf('--json');if (arg !== -1) writeFileSync(process.argv[arg + 1], `${JSON.stringify(report, null, 2)}\n`);
console.log(`own Python Lab guest: ${report.failures.length ? 'FAIL' : 'PASS'} (${report.cases.length} completed cases)`);
process.exitCode = report.failures.length ? 1 : 0;
