// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Observed guest encoders drive the existing world; the native controller never steps here.
import {writeObservedMotor} from '../virtual-hub/motor-telemetry.js';
const PORTS = 'ABCDEF';
const REQUIRED = ['arena-inputs/v1', 'arena-clock/v1', 'guest-motor-output/v1', 'state-sample/v1'];
export class RenodeArenaBridge {
    constructor (bridge) {
        if (!bridge?.hubState || !bridge.sim) throw new TypeError('A shared arena bridge is required');
        this.bridge = bridge;
        this.last = null;
        this.closed = false;
        this.previousOwner = bridge.hubState.clockOwner;
    }
    accept (frame) {
        if (this.closed) throw new Error('Renode arena connection is closed');
        const target = frame?.target;
        if (frame?.schemaVersion !== 1 || frame.type !== 'snapshot' || target?.board !== 'spike-prime' ||
            !['brickwright-arena-demo', 'brickwright-nuttx'].includes(target.firmware) || target.transport !== 'none' ||
            !/^[a-f0-9]{64}$/.test(target.imageSha256 || '') ||
            !REQUIRED.every(cap => target.capabilities?.includes(cap))) {
            throw new Error('Configured simulation firmware does not support the arena contract');
        }
        const speedLimit = target.capabilities.some(cap => ['arena-program/v1', 'nuttx-program/v1'].includes(cap)) ? 1110 : 300;
        const generation = frame.lifecycle?.connectionGeneration;
        if (!Number.isSafeInteger(frame.seq) || frame.seq < 0 || !Number.isSafeInteger(generation) || generation < 0 ||
            !Number.isSafeInteger(frame.clockNs) || frame.clockNs < 0) throw new Error('Invalid guest clock or sequence');
        const sides = [this.bridge.robot.left, this.bridge.robot.right];
        const motors = sides.map(side => {
            if (this.bridge.hubState.data.sensors[PORTS.indexOf(side.port)]?.kind !== 'motor') {
                throw new Error('Arena drive motor is no longer attached');
            }
            const matches = frame.motors?.filter(motor => motor.port === side.port);
            if (matches?.length !== 1) throw new Error('Guest drive motor is unavailable');
            const motor = matches[0];
            if (!Number.isFinite(motor.position) || Math.abs(motor.position) > 1080000 ||
                !Number.isFinite(motor.speedDps) || Math.abs(motor.speedDps) > speedLimit ||
                ![-1, 0, 1].includes(motor.demandDirection) || typeof motor.stalled !== 'boolean') {
                throw new Error('Invalid guest motor frame');
            }
            return {...motor};
        });
        for (const sensor of this.bridge.robot.sensors) {
            if (!frame.ports?.some(port => port.id === sensor.port && port.attached && port.kind === sensor.kind)) {
                throw new Error('Guest sensor layout does not match the arena');
            }
        }
        const identity = `${target.imageSha256}:${generation}`;
        const last = this.last;
        const ms = last ? (frame.clockNs - last.clockNs) / 1e6 : 0;
        if (last && (identity !== last.identity || frame.seq <= last.seq || ms < 0 || ms > 2000 ||
            motors.some((motor, i) => Math.abs(motor.position - last.motors[i].position) > speedLimit * ms / 1000 + 0.002))) {
            throw new Error('Guest frame is stale, discontinuous or outside the sampling interval');
        }
        const hub = this.bridge.hubState;
        if (!last) hub.backend.cancel();
        hub.clockOwner = 'renode';
        // Linear encoder interpolation is a sampled trajectory, bounded to 5 ms world steps.
        if (ms > 0) {
            const count = Math.ceil(ms / this.bridge.stepMs);
            const travels = motors.map((motor, i) => (motor.position - last.motors[i].position) *
                (sides[i].reversed ? -1 : 1) / 360 * Math.PI *
                (sides[i].wheelDiameter ?? this.bridge.robot.wheelDiameter));
            for (let i = 0; i < count; i++) this.bridge.sim.advanceWheels(travels[0] / count, travels[1] / count, ms / count);
        }
        for (const motor of motors) {
            writeObservedMotor(hub, motor.port, motor);
            this.bridge.lastPositions[motor.port] = motor.position;
        }
        this.last = {identity, seq: frame.seq, clockNs: frame.clockNs, motors};
        this.bridge.verdict = this.bridge.checker.evaluate(this.bridge.sim.snapshot());
        this.bridge._publish();
        return this.inputs();
    }
    inputs () {
        if (!this.last || this.closed) throw new Error('No active guest frame');
        const sensors = Object.entries(this.bridge.sim.readSensors()).map(([port, value]) => ({port, kind: value.kind,
            values: value.kind === 'color' ? {colorId: value.color < 0 ? 255 : value.color,
                reflectionPercent: Math.round(value.reflection), ambientPercent: 0} :
                value.kind === 'distance' ? {distanceMillimeters: Math.round(value.distance)} :
                    {forcePercent: Math.round(value.force), pressed: value.pressed}}));
        const sides = [this.bridge.robot.left, this.bridge.robot.right];
        const travel = sides.map((side, i) => this.last.motors[i].demandDirection * (side.reversed ? -1 : 1) * 0.01);
        const contact = this.bridge.robot.contactModel === 'stall' && this.bridge.sim.wouldBlockWheels(...travel);
        return {sensors, loads: sides.map(side => ({port: side.port, percent: contact ? 100 : 0}))};
    }
    close () {
        if (this.closed) return;
        this.closed = true;
        if (!this.last) return;
        const hub = this.bridge.hubState;
        if (hub.clockOwner !== 'renode') return;
        hub.backend.cancel();
        if (hub.clockOwner === 'renode') hub.clockOwner = this.previousOwner;
        this.bridge.lastPositions = Object.fromEntries([this.bridge.robot.left, this.bridge.robot.right]
            .map(side => [side.port, hub.data.motors[PORTS.indexOf(side.port)].position]));
    }
}
