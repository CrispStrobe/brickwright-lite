// SPDX-License-Identifier: BSD-3-Clause
// The virtual SPIKE hub's motor model: what a motor DOES with a command.
//
// Before this module the virtual hub stored a speed per port and nothing ever
// turned: positions stayed wherever the last writer left them. A world that
// drives on those motors (lib/spike-arena/) needs positions that advance, and
// every programming route (Scratch blocks through the protocol emulators,
// SPIKE 3 Python, Pybricks) needs the same answer to "run for 360 degrees".
// This is that answer, once. The contract is written down in
// docs/SPIKE-ARENA.md ("The hub contract").
//
// Deliberately ideal, and stated so:
//   - a motor reaches its commanded speed instantly (no acceleration ramp);
//   - it is never loaded: a wheel pressed against a wall keeps turning (the
//     arena models that as wheel slip), so it never stalls;
//   - a degrees/position target is met exactly, inside the step that crosses it.
// Nothing here reads a clock. Time passes only when the owner of the world
// calls step(dtMs), which is what makes a run reproducible.

/** Full speed (100 %) in degrees per second, per LEGO device type id.
 *  Source: the velocity limits LEGO documents for SPIKE 3 Python's
 *  motor.run(): small 660, medium 1110, large 1050 deg/s. The Technic
 *  angular motors (75/76) share the medium/large limits. */
export const MAX_DEG_PER_S = Object.freeze({48: 1110, 75: 1110, 49: 1050, 76: 1050, 65: 660});
export const DEFAULT_MAX_DEG_PER_S = 1110;

export const RESULT = Object.freeze({completed: 'completed', interrupted: 'interrupted'});

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = value => (Number.isFinite(Number(value)) ? Number(value) : 0);

const portIndex = port => {
    const index = typeof port === 'string' ? 'ABCDEF'.indexOf(port.toUpperCase()) : Number(port);
    if (!Number.isInteger(index) || index < 0 || index > 5) throw new RangeError('SPIKE port must be A-F or 0-5');
    return index;
};

export class SpikeMotorModel {
    /** @param {object} hubState a VirtualSpikeHubState (only its `data` and `changed()` are used) */
    constructor (hubState) {
        this.hubState = hubState;
        this.commands = Array.from({length: 6}, () => null);
    }

    /** Full-speed deg/s for the device on a port. */
    maxSpeed (port) {
        const index = portIndex(port);
        const sensor = this.hubState.data.sensors[index];
        return MAX_DEG_PER_S[sensor?.deviceId] || DEFAULT_MAX_DEG_PER_S;
    }

    /** Percent (-100..100) to deg/s for this port's motor. */
    percentToDps (port, percent) {
        return clamp(finite(percent), -100, 100) * this.maxSpeed(port) / 100;
    }

    _ensureMotor (index) {
        const sensors = this.hubState.data.sensors;
        if (!sensors[index] || sensors[index].kind !== 'motor') {
            sensors[index] = {...(sensors[index] || {}), kind: 'motor'};
        }
    }

    _replace (index, command) {
        const previous = this.commands[index];
        this.commands[index] = command;
        if (previous && previous.resolve) previous.resolve(RESULT.interrupted);
        this._ensureMotor(index);
        this._publishSpeed(index, command ? command.dps : 0);
    }

    _publishSpeed (index, dps) {
        const data = this.hubState.data;
        const max = this.maxSpeed(index);
        data.motors[index].speed = clamp(Math.round(dps / max * 100), -100, 100);
        data.motors[index].degPerSec = dps;
        this._publishClassic(index);
    }

    _publishClassic (index) {
        const data = this.hubState.data;
        const motor = data.motors[index];
        const deviceId = data.sensors[index]?.deviceId || 48;
        data.classicPorts[index] = [deviceId, [motor.speed, Math.round(motor.position), 0, motor.speed]];
    }

    _pending (index, command) {
        return new Promise(resolve => {
            command.resolve = resolve;
            this._replace(index, command);
        });
    }

    /** Runs until told otherwise. */
    runAtSpeed (port, dps) {
        const index = portIndex(port);
        const speed = finite(dps);
        if (speed === 0) { this.stop(index); return; }
        this._replace(index, {mode: 'speed', dps: speed});
    }

    /** Runs |degrees| at |dps|; direction is sign(degrees) * sign(dps), as SPIKE's run_for_degrees.
     *  Resolves 'completed' at the target, or 'interrupted' if another command replaces it. */
    runForDegrees (port, degrees, dps) {
        const index = portIndex(port);
        const amount = Math.abs(finite(degrees));
        const speed = Math.abs(finite(dps));
        if (amount === 0 || speed === 0) { this.stop(index); return Promise.resolve(RESULT.completed); }
        const sign = Math.sign(finite(degrees)) * Math.sign(finite(dps));
        const target = this.hubState.data.motors[index].position + sign * amount;
        return this._pending(index, {mode: 'degrees', dps: sign * speed, remaining: amount, target});
    }

    /** Runs for ms milliseconds at dps. */
    runForTime (port, ms, dps) {
        const index = portIndex(port);
        const duration = Math.max(0, finite(ms));
        if (duration === 0 || finite(dps) === 0) { this.stop(index); return Promise.resolve(RESULT.completed); }
        return this._pending(index, {mode: 'time', dps: finite(dps), remaining: duration});
    }

    /** Runs to an absolute position (degrees counted since reset), at |dps|. */
    runToPosition (port, position, dps) {
        const index = portIndex(port);
        const delta = finite(position) - this.hubState.data.motors[index].position;
        return this.runForDegrees(index, delta, Math.abs(finite(dps)));
    }

    /** Stops a motor. brake/hold/coast all stop dead here (no inertia is modelled). */
    stop (port, action = 'brake') {
        const index = portIndex(port);
        const previous = this.commands[index];
        this.commands[index] = null;
        if (previous && previous.resolve) previous.resolve(RESULT.interrupted);
        const motor = this.hubState.data.motors[index];
        motor.stopAction = action;
        // A sensor port has nothing to stop; publishing would overwrite its
        // Classic record with a motor's.
        if (this.hubState.data.sensors[index]?.kind !== 'motor') { motor.speed = 0; motor.degPerSec = 0; return; }
        this._publishSpeed(index, 0);
    }

    stopAll () { for (let i = 0; i < 6; i++) this.stop(i); }

    /** Sets a port's counted position without moving (motor.reset / set_degrees_counted). */
    resetPosition (port, position = 0) {
        const index = portIndex(port);
        this.hubState.data.motors[index].position = finite(position);
        this._publishClassic(index);
    }

    /** True while a port has an active command. */
    busy (port) { return Boolean(this.commands[portIndex(port)]); }

    /**
     * Advances every running motor by dtMs. Positions are read from and written
     * back to hubState.data.motors, so another writer (the Pybricks mirror) and
     * this model can share the array: a port with no command is not touched.
     * Does NOT call hubState.changed(); the caller batches that.
     * @returns {boolean} whether anything moved
     */
    step (dtMs) {
        const dt = Math.max(0, finite(dtMs));
        let moved = false;
        for (let index = 0; index < 6; index++) {
            const command = this.commands[index];
            if (!command) continue;
            const motor = this.hubState.data.motors[index];
            let travel = command.dps * dt / 1000;
            let done = false;
            if (command.mode === 'degrees') {
                if (Math.abs(travel) >= command.remaining) {
                    travel = Math.sign(command.dps) * command.remaining;
                    done = true;
                } else command.remaining -= Math.abs(travel);
            } else if (command.mode === 'time') {
                if (dt >= command.remaining) {
                    travel = command.dps * command.remaining / 1000;
                    done = true;
                } else command.remaining -= dt;
            }
            // A degrees target lands exactly, not at the sum of float steps.
            if (done && command.mode === 'degrees') motor.position = command.target;
            else motor.position += travel;
            if (travel !== 0) moved = true;
            if (done) {
                this.commands[index] = null;
                this._publishSpeed(index, 0);
                command.resolve(RESULT.completed);
            } else this._publishClassic(index);
        }
        return moved;
    }
}

export default SpikeMotorModel;
