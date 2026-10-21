// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The NXT, EV3 and RCX take the Robot Lab API's motor commands (hubs/hub-profile.js directCommand), as
// their own direct commands do — Bluetooth SETOUTPUTSTATE, EV3 opOUTPUT_*, the RCX's IR power/direction/
// on-off-float — so the motor mixer, the blocks and the words turn their motors too (an NXT Tri-bot from
// the LDraw library had three motors nothing could drive). Each command shows in what the hub drives.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hubRegistry} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/index.js';

const drive = (hub, port) => hub.readDrives().find(d => d.port === port);
const plugged = (profile, bindings) => {
    const hub = hubRegistry.create(profile, {id: profile});
    assert.deepEqual(hub.plug(bindings), []);
    return hub;
};

test('NXT: power runs the output regulated, coast floats it, brake brakes it; degrees end the move with done', async () => {
    const hub = plugged('nxt', [{port: 'B', class: 'motor', ids: {}, device: 'nxt-motor'}]);
    assert.deepEqual(hub.directCommand('A', {power: 50}).code, 'no-motor');
    assert.equal(hub.directCommand('B', {power: 60}).ok, true);
    hub.advanceTo(10);
    const on = drive(hub, 'B');
    assert.ok(on && on.mode !== 'coast' && (on.duty > 0 || on.speedDps > 0 || on.mode === 'servo'), JSON.stringify(on));
    assert.equal(hub.getOutputState(1).power, 60);
    hub.directCommand('B', {stop: 'coast'});
    hub.advanceTo(20);
    assert.equal(drive(hub, 'B').decay ?? drive(hub, 'B').mode, 'coast');
    const r = hub.directCommand('B', {degrees: 90, power: 50});
    assert.equal(hub.getOutputState(1).tachoLimit, 90);
    assert.ok(r.done instanceof Promise);
    assert.equal(hub.directCommand('B', {stop: 'sideways'}).code, 'bad-command');
});

test('EV3: power and speed set the level and start it; stop brakes or floats; degrees run a profile', () => {
    const hub = plugged('ev3', [{port: 'C', class: 'motor', ids: {}, device: 'ev3-large-motor'}]);
    assert.equal(hub.directCommand('A', {power: 50}).code, 'no-motor');
    assert.equal(hub.directCommand('C', {power: 40}).ok, true);
    assert.deepEqual([hub.s.outputs[2].level, hub.s.outputs[2].started], [{kind: 'power', value: 40}, true]);
    hub.directCommand('C', {speedDps: 525});
    assert.equal(hub.s.outputs[2].level.kind, 'speed');
    assert.ok(Math.abs(hub.s.outputs[2].level.value - 50) < 1e-9, 'half the large motor\'s 1050 °/s');
    hub.directCommand('C', {stop: 'brake'});
    assert.equal(hub.s.outputs[2].started, false);
    const r = hub.directCommand('C', {degrees: -180, power: 30});
    assert.deepEqual([hub.s.outputs[2].busy, hub.s.outputs[2].job.value < 0, r.done instanceof Promise], [true, true, true]);
});

test('RCX: power to its eight levels and a direction, brake and float; no encoder, so no degrees and no hold', () => {
    const hub = plugged('rcx', [{port: 'A', class: 'motor', ids: {}, device: 'technic-minimotor-71427'}]);
    assert.equal(hub.directCommand('B', {power: 50}).code, 'no-motor');
    assert.equal(hub.directCommand('A', {power: -100}).ok, true);
    assert.deepEqual(drive(hub, 'A'), {port: 'A', mode: 'pwm', duty: -1, decay: 'coast'});
    hub.directCommand('A', {power: 50});
    assert.equal(drive(hub, 'A').duty, 0.5, 'half power: 4 of the 8 ms driven');
    hub.directCommand('A', {stop: 'brake'});
    assert.deepEqual([drive(hub, 'A').duty, drive(hub, 'A').decay], [0, 'brake']);
    hub.directCommand('A', {stop: 'coast'});
    assert.equal(drive(hub, 'A').decay, 'coast');
    assert.equal(hub.directCommand('A', {degrees: 90}).code, 'refused');
    assert.equal(hub.directCommand('A', {stop: 'hold'}).code, 'refused');
});
