// SPDX-License-Identifier: BSD-3-Clause
// Couples the arena (arena-sim.js) to the virtual SPIKE hub (lib/virtual-hub).
//
// This is the whole interface between the world and every programming route,
// and it goes through the hub's state only (docs/SPIKE-ARENA.md, "The hub
// contract"):
//
//   IN  (hub -> world)  motors[port].position, degrees counted, for the two
//                       drive ports. Whoever turned them (the hub's motor model
//                       answering Scratch blocks or SPIKE 3 Python, or the
//                       Pybricks simulator mirroring its own motors) is not
//                       this module's business: a position delta is a wheel
//                       turning.
//   OUT (world -> hub)  sensors[port] for each mounted sensor, imu.yaw through
//                       hubState.setHeading(), then ONE hubState.changed() per
//                       tick so listeners see a consistent frame.
//
// The bridge owns simulated time while it runs: tick(ms) steps the hub's motor
// model and the world in fixed steps, so a run is reproducible for any frame
// rate that feeds it.

import {ArenaSim} from './arena-sim.js';
import {ArenaChecker} from './arena-checker.js';

export const STEP_MS = 5;
const PORTS = 'ABCDEF';

/** LEGO device id for the SPIKE Medium Angular Motor, the driving base's motors. */
const MEDIUM_MOTOR = 48;
const SENSOR_DEVICE = {color: 61, distance: 62, force: 63};

export class ArenaHubBridge {
    /**
     * @param {object} options
     * @param {object} options.hubState a VirtualSpikeHubState
     * @param {object} options.world a validated challenge world
     * @param {object} [options.robot] driving-base overrides
     * @param {number} [options.stepMs] fixed physics step
     */
    constructor ({hubState, world, robot, stepMs = STEP_MS}) {
        this.hubState = hubState;
        this.stepMs = stepMs;
        this.sim = new ArenaSim(world, robot);
        this.checker = new ArenaChecker(world);
        this.accumulator = 0;
        this.reset();
    }

    get world () { return this.sim.world; }
    get robot () { return this.sim.robot; }

    /** Puts the robot at the start, plugs its devices into the hub and zeroes the hub's motion state. */
    reset () {
        const hub = this.hubState;
        const {left, right} = this.robot;
        hub.motors.stopAll();
        this.sim.reset();
        this.checker.reset();
        this.accumulator = 0;
        for (const side of [left, right]) {
            const index = PORTS.indexOf(side.port);
            hub.data.sensors[index] = {kind: 'motor', deviceId: MEDIUM_MOTOR};
            hub.motors.resetPosition(side.port, 0);
            hub.motors.stop(side.port);
        }
        hub.movementPair = [left.port, right.port];
        hub.motorPairDefined = false;
        this.lastPositions = {[left.port]: 0, [right.port]: 0};
        hub.resetHeading(this.sim.pose.heading);
        this._publish();
        this.verdict = this.checker.evaluate(this.sim.snapshot());
    }

    /** Cm of wheel travel for a motor's position change, forward positive. */
    _wheelTravel (side) {
        const position = Number(this.hubState.data.motors[PORTS.indexOf(side.port)].position) || 0;
        const delta = position - this.lastPositions[side.port];
        this.lastPositions[side.port] = position;
        return (side.reversed ? -delta : delta) / 360 * Math.PI * this.robot.wheelDiameter;
    }

    /** One fixed step: motors, then the world. */
    step () {
        const {left, right} = this.robot;
        this.hubState.stepMotors(this.stepMs);
        this.sim.advanceWheels(this._wheelTravel(left), this._wheelTravel(right), this.stepMs);
    }

    /**
     * Advances simulated time by ms (in fixed steps; the remainder carries to
     * the next call), publishes sensors once and evaluates the challenge.
     * @returns {object} the verdict
     */
    tick (ms) {
        this.accumulator += Math.max(0, Number(ms) || 0);
        let stepped = false;
        while (this.accumulator >= this.stepMs) {
            this.accumulator -= this.stepMs;
            this.step();
            stepped = true;
            if (this.verdict.status === 'running') {
                this.verdict = this.checker.evaluate(this.sim.snapshot());
            }
        }
        if (stepped) this._publish();
        return this.verdict;
    }

    _publish () {
        const hub = this.hubState;
        const readings = this.sim.readSensors();
        for (const sensor of this.robot.sensors) {
            const {kind, colorName, ...value} = readings[sensor.port];
            hub.updateSensor(sensor.port, kind, {deviceId: SENSOR_DEVICE[kind], ...value});
        }
        hub.setHeading(this.sim.pose.heading, {rate: this.sim.turnRate});
        hub.changed();
    }

    snapshot () { return {...this.sim.snapshot(), verdict: this.verdict}; }
}
