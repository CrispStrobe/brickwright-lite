// SPDX-License-Identifier: BSD-3-Clause
// Copyright 2026 Brickwright contributors.
export const MAX_DEG_PER_S = Object.freeze({
    48: 1110,
    75: 1110,
    49: 1050,
    76: 1050,
    65: 660
});
export const DEFAULT_MAX_DEG_PER_S = 1110;
export const RESULT = Object.freeze({
    COMPLETED: 'completed',
    INTERRUPTED: 'interrupted',
    STALLED: 'stalled',
    completed: 'completed',
    interrupted: 'interrupted',
    stalled: 'stalled'
});
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const finite = v => {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError('Expected finite number');
    return v;
};
const nonnegative = v => {
    finite(v);
    if (v < 0) throw new RangeError('Expected nonnegative number');
    return v;
};
const copy = v => structuredClone(v);
const defaults = () => ({
    acceleration: 1500,
    deceleration: 1500,
    coastDeceleration: 1500,
    brakeDeceleration: 6000,
    stallMs: 500,
    stallSpeed: 1
});
export default class IndependentSpikeBackend {
    constructor(hubState, options = {}) {
        this.hubState = hubState;
        this.data = hubState.data;
        this.simulatedMs = 0;
        this._remainder = 0;
        this._controllers = Array.from({
            length: 6
        }, () => ({
            mode: 'idle', load: 0, config: defaults(), resolve: null, stallElapsed: 0,
            defaultStopAction: 'brake'
        }));
        this._waits = new Set();
        this._disposed = false;
        this._cancelEpoch = 0;
        this._pacing = false;
        this._sound = null;
        this._onBeep = options.onBeep;
        if (options.configuration) for (let i = 0; i < 6; i++) this.configure(i, options.configuration);
    }

    _ownsClock() {
        return !this.hubState.clockOwner || this.hubState.clockOwner === 'native';
    }

    _assertClock() {
        if (!this._ownsClock()) throw new Error('Clock is owned by another backend');
        if (this._disposed) throw new Error('Backend disposed');
    }

    _port(port) {
        if (typeof port === 'string' && /^[a-f]$/i.test(port)) return port.toUpperCase().charCodeAt(0) - 65;
        if (Number.isInteger(port) && port >= 0 && port < 6) return port;
        throw new RangeError('Invalid motor port');
    }

    _changed() {
        this.hubState.changed();
    }

    maxSpeed(port) {
        const i = this._port(port);
        const id = this.data.sensors[i]?.deviceId ?? this.data.classicPorts[i]?.[0];
        return MAX_DEG_PER_S[id] ?? DEFAULT_MAX_DEG_PER_S;
    }

    percentToDps(port, percent) {
        const i = this._port(port);
        return clamp(finite(percent), -100, 100) * this.maxSpeed(i) / 100;
    }

    _attach(i) {
        const old = this.data.sensors[i];
        let id = old?.deviceId ?? this.data.classicPorts[i]?.[0];
        if (id == null || id <= 0) id = 48;
        this.data.sensors[i] = {
            ...old,
            kind: 'motor',
            deviceId: id
        };
        const m = this.data.motors[i];
        if (!Number.isFinite(m.degPerSec)) m.degPerSec = (m.speed || 0) * this.maxSpeed(i) / 100;
        m.stalled = false;
        m.stopAction = this._controllers[i].defaultStopAction;
    }

    _interrupt(i) {
        const c = this._controllers[i];
        if (c.resolve) {
            const resolve = c.resolve;
            c.resolve = null;
            resolve(RESULT.INTERRUPTED);
        }
    }

    _publish(i) {
        const m = this.data.motors[i];
        m.speed = Math.round(m.degPerSec / this.maxSpeed(i) * 100);
        const speed = Math.round(m.speed);
        this.data.classicPorts[i] = [this.data.sensors[i].deviceId, [speed, Math.round(m.position), 0, speed]];
    }

    // A replacement owns the port and resolves the previous finite task exactly once.
    _start(i, mode, fields) {
        this._assertClock();
        this._interrupt(i);
        this._attach(i);
        const c = this._controllers[i];
        Object.assign(c, {
            mode, stallElapsed: 0
        }, fields);
        this._publish(i);
        this._changed();
        return c;
    }

    // Motor positions are degrees, shaft speeds degrees/second, and durations milliseconds.
    runAtSpeed(port, dps) {
        const i = this._port(port);
        finite(dps);
        this._start(i, 'speed', {
            requested: clamp(dps, -this.maxSpeed(i), this.maxSpeed(i))
        });
    }

    _position(i, target, dps) {
        this._assertClock();
        const speed = Math.min(Math.abs(dps), this.maxSpeed(i));
        if (target !== this.data.motors[i].position && speed === 0) return Promise.reject(new RangeError('Position motion needs nonzero speed'));
        const c = this._start(i, 'position', {
            target, requested: speed
        });
        if (target === this.data.motors[i].position) {
            this.data.motors[i].degPerSec = 0;
            this._complete(c);
            this._publish(i);
            this._changed();
            return Promise.resolve(RESULT.COMPLETED);
        }
        return new Promise(resolve => {
            c.resolve = resolve;
        });
    }

    runForDegrees(port, degrees, dps) {
        const i = this._port(port);
        finite(degrees);
        finite(dps);
        return this._position(i, this.data.motors[i].position + degrees * Math.sign(dps || 1), dps);
    }

    runToPosition(port, position, dps) {
        const i = this._port(port);
        finite(position);
        finite(dps);
        return this._position(i, position, dps);
    }

    runForTime(port, ms, dps) {
        const i = this._port(port);
        nonnegative(ms);
        finite(dps);
        const c = this._start(i, 'time', {
            remaining: ms, requested: clamp(dps, -this.maxSpeed(i), this.maxSpeed(i))
        });
        if (ms === 0) {
            this.data.motors[i].degPerSec = 0;
            this._complete(c);
            this._publish(i);
            this._changed();
            return Promise.resolve(RESULT.COMPLETED);
        }
        return new Promise(resolve => {
            c.resolve = resolve;
        });
    }

    setStopAction(port, action) {
        const i = this._port(port);
        if (!['coast', 'brake', 'hold'].includes(action)) throw new RangeError('Invalid stop action');
        this._controllers[i].defaultStopAction = action;
        this.data.motors[i].stopAction = action;
        this._changed();
    }

    stop(port, action) {
        const i = this._port(port);
        if (action === undefined) action = this._controllers[i].defaultStopAction;
        if (!['coast', 'brake', 'hold'].includes(action)) throw new RangeError('Invalid stop action');
        this._assertClock();
        this._interrupt(i);
        const c = this._controllers[i];
        const m = this.data.motors[i];
        if (c.mode === 'idle' && this.data.sensors[i]?.kind !== 'motor') return;
        c.mode = action === 'hold' ? 'hold' : 'stop';
        c.action = action;
        c.target = m.position;
        c.requested = Math.max(100, Math.abs(m.degPerSec || 0));
        m.lastStopAction = action;
        m.stalled = false;
        this._changed();
    }

    stopAll({ notify = true } = {}) {
        for (let i = 0; i < 6; i++) {
            this._interrupt(i);
            const c = this._controllers[i];
            if (c.mode !== 'idle' || this.data.sensors[i]?.kind === 'motor') {
                const m = this.data.motors[i];
                m.degPerSec = 0;
                m.speed = 0;
                m.stalled = false;
                if (this.data.sensors[i]?.kind === 'motor') this._publish(i);
            }
            c.mode = 'idle';
        }
        if (notify) this._changed();
    }

    cancel(options) {
        this._cancelEpoch++;
        this.stopAll(options);
        this._finishSound(RESULT.INTERRUPTED, options);
        for (const w of [...this._waits]) this._finishWait(w, RESULT.INTERRUPTED);
    }

    resetPosition(port, value = 0) {
        const i = this._port(port);
        finite(value);
        this._assertClock();
        this.data.motors[i].position = value;
        if (this.data.sensors[i]?.kind === 'motor') this._publish(i);
        this._changed();
    }

    busy(port) {
        const i = this._port(port);
        const c = this._controllers[i];
        return ['speed', 'position', 'time'].includes(c.mode);
    }

    done(port) {
        const i = this._port(port);
        const c = this._controllers[i];
        const m = this.data.motors[i];
        if (c.mode === 'hold') return Math.abs(m.position - c.target) <= 0.5 && Math.abs(m.degPerSec || 0) <= 1;
        if (['position', 'time', 'stop'].includes(c.mode)) return false;
        if (c.mode === 'speed') return Math.abs((m.degPerSec || 0) - c.requested * (1 - c.load)) <= 1;
        return true;
    }

    configure(port, options) {
        const i = this._port(port);
        const next = {
            ...this._controllers[i].config
        };
        for (const [k, v] of Object.entries(options)) {
            if (!(k in next)) throw new RangeError('Unknown configuration');
            nonnegative(v);
            if (k !== 'stallMs' && k !== 'stallSpeed' && v === 0) throw new RangeError('Deceleration and acceleration must be positive');
            next[k] = v;
        }
        this._controllers[i].config = next;
    }

    setLoad(port, fraction) {
        const i = this._port(port);
        finite(fraction);
        if (fraction < 0 || fraction > 1) throw new RangeError('Invalid load');
        this._controllers[i].load = fraction;
    }

    _complete(c, result = RESULT.COMPLETED) {
        const finiteMotion = c.mode === 'position' || c.mode === 'time';
        if (result === RESULT.COMPLETED && finiteMotion && c.defaultStopAction === 'hold') {
            const m = this.data.motors[this._controllers.indexOf(c)];
            if (c.mode === 'time') c.target = m.position;
            c.requested = Math.max(100, Math.abs(c.requested));
            c.mode = 'hold';
        } else {
            c.mode = 'idle';
        }
        if (c.resolve) {
            const resolve = c.resolve;
            c.resolve = null;
            resolve(result);
        }
    }

    // Fixed 1 ms ticks make physics independent of caller chunk boundaries.
    _tick() {
        let moved = false;
        for (let i = 0; i < 6; i++) {
            const c = this._controllers[i];
            if (c.mode === 'idle') continue;
            const m = this.data.motors[i];
            const cfg = c.config;
            let v = m.degPerSec || 0;
            let desired = 0;
            let rate = cfg.deceleration;
            const positionMode = c.mode === 'position' || c.mode === 'hold';
            if (c.mode === 'speed') desired = c.requested * (1 - c.load);
            // Reserve the final portion of timed motion for deceleration.
            if (c.mode === 'time') {
                c.remaining = Math.max(0, c.remaining - 1);
                desired = Math.sign(c.requested) * Math.min(
                    Math.abs(c.requested) * (1 - c.load),
                    cfg.deceleration * c.remaining / 1000
                );
            }
            // Braking-distance bound approaches the target without teleporting.
            if (positionMode) {
                const distance = c.target - m.position;
                const dec = c.mode === 'hold' ? cfg.brakeDeceleration : cfg.deceleration;
                rate = dec;
                desired = Math.sign(distance) * Math.min(
                    c.requested * (1 - c.load),
                    Math.sqrt(2 * dec * Math.abs(distance))
                );
            }
            if (c.mode === 'stop') rate = c.action === 'coast' ? cfg.coastDeceleration : cfg.brakeDeceleration;
            const accelerating = Math.sign(desired) === Math.sign(v)
                && Math.abs(desired) > Math.abs(v);
            if (accelerating || (v === 0 && desired !== 0)) rate = cfg.acceleration;
            let next = v + clamp(desired - v, -rate / 1000, rate / 1000);
            if (c.load === 1) {
                next = 0;
                v = 0;
            }
            const previous = m.position;
            m.position += (v + next) / 2000;
            m.degPerSec = next;
            m.stalled = c.load === 1 && ['position', 'speed', 'time'].includes(c.mode) && c.requested !== 0;
            if (c.mode === 'position' && m.stalled && Math.abs(next) <= cfg.stallSpeed) {
                c.stallElapsed++;
                if (c.stallElapsed >= cfg.stallMs) this._complete(c, RESULT.STALLED);
            } else c.stallElapsed = 0;
            const settled = Math.abs(c.target - m.position) <= 0.5 && Math.abs(next) <= 1;
            if (positionMode && c.mode !== 'idle' && settled) {
                m.position = c.target;
                m.degPerSec = 0;
                // Hold continues regulating after it settles.
                if (c.mode !== 'hold') this._complete(c);
            }
            if (c.mode === 'time' && c.remaining === 0) {
                m.degPerSec = 0;
                this._complete(c);
            }
            if (c.mode === 'stop' && next === 0) this._complete(c);
            moved ||= previous !== m.position;
            this._publish(i);
        }
        return moved;
    }

    // The world owner publishes motor and arena sensor changes atomically after step.
    step(dtMs) {
        nonnegative(dtMs);
        if (!this._ownsClock() || this._disposed) return false;
        this.simulatedMs += dtMs;
        this._remainder += dtMs;
        const ticks = Math.floor(this._remainder + 1e-9);
        this._remainder -= ticks;
        let moved = false;
        for (let t = 0; t < ticks; t++) moved = this._tick() || moved;
        for (const w of [...this._waits]) if (this.simulatedMs + 1e-9 >= w.deadline) this._finishWait(w, RESULT.COMPLETED);
        if (this._sound && this.simulatedMs + 1e-9 >= this._sound.deadline) {
            this._finishSound(RESULT.COMPLETED, {notify: false});
        }
        return moved;
    }
    // Waits share the motor clock; their deadlines are in simulated milliseconds.
    wait(ms, { signal } = {}) {
        try {
            nonnegative(ms);
            if (!this._ownsClock()) throw new Error('Clock is owned by another backend');
        } catch (error) {
            return Promise.reject(error);
        }
        if (this._disposed || signal?.aborted) return Promise.resolve(RESULT.INTERRUPTED);
        if (ms === 0) return Promise.resolve(RESULT.COMPLETED);
        return new Promise(resolve => {
            const w = {resolve, deadline: this.simulatedMs + ms, signal};
            w.abort = () => this._finishWait(w, RESULT.INTERRUPTED);
            this._waits.add(w);
            signal?.addEventListener('abort', w.abort, {once: true});
        });
    }

    _finishWait(w, result) {
        if (!this._waits.delete(w)) return;
        w.signal?.removeEventListener('abort', w.abort);
        w.resolve(result);
    }
    // A single standalone driver may advance the clock; arena callers use step.
    async pace(ms, { realtime = false, signal } = {}) {
        nonnegative(ms);
        this._assertClock();
        if (signal?.aborted) return RESULT.INTERRUPTED;
        if (this._pacing) throw new Error('A pace driver is already active');
        this._pacing = true;
        const epoch = this._cancelEpoch;
        const abort = new AbortController();
        const forward = () => abort.abort();
        signal?.addEventListener('abort', forward, {
            once: true
        });
        const pending = this.wait(ms, {
            signal: abort.signal
        });
        let remaining = ms;
        try {
            while (remaining > 0) {
                await new Promise(resolve => setTimeout(resolve, realtime ? Math.min(10, remaining) : 0));
                if (this._disposed || signal?.aborted || this._cancelEpoch !== epoch || !this._ownsClock()) {
                    abort.abort();
                    break;
                }
                const chunk = Math.min(10, remaining);
                this.step(chunk);
                this._changed();
                remaining -= chunk;
            }
            return await pending;
        } finally {
            this._pacing = false;
            signal?.removeEventListener('abort', forward);
        }
    }

    dispose() {
        this._disposed = true;
        this.cancel();
    }

    // Frequencies are Hz; beep durations run on the same supplied simulated clock.
    beep(frequencyHz, durationMs, { waveform = 'sin' } = {}) {
        try {
            nonnegative(frequencyHz);
            nonnegative(durationMs);
            if (!['sin', 'square', 'triangle', 'sawtooth'].includes(waveform)) {
                throw new RangeError('Invalid waveform');
            }
            this._assertClock();
        } catch (error) {
            return Promise.reject(error);
        }
        this._finishSound(RESULT.INTERRUPTED, {notify: false});
        const speaker = this.data.speaker ??= {frequency: 0, waveform: 'sin', beeps: 0};
        speaker.waveform = waveform;
        speaker.beeps = (speaker.beeps ?? 0) + 1;
        this._setFrequency(durationMs === 0 ? 0 : frequencyHz);
        this._changed();
        if (durationMs === 0) return Promise.resolve(RESULT.COMPLETED);
        return new Promise(resolve => {
            this._sound = {resolve, deadline: this.simulatedMs + durationMs};
        });
    }

    _setFrequency(frequency) {
        const speaker = this.data.speaker;
        if (!speaker || speaker.frequency === frequency) return;
        speaker.frequency = frequency;
        if (typeof this._onBeep === 'function') this._onBeep(frequency);
    }

    _finishSound(result, { notify = true } = {}) {
        const sound = this._sound;
        this._sound = null;
        if (sound) sound.resolve(result);
        const wasAudible = (this.data.speaker?.frequency ?? 0) !== 0;
        this._setFrequency(0);
        if (notify && (sound || wasAudible)) this._changed();
    }

    stopSound() {
        if (!this.data.speaker) {
            this.data.speaker = {frequency: 0, waveform: 'sin', beeps: 0};
            this._changed();
            return;
        }
        this._finishSound(RESULT.INTERRUPTED);
    }

    readSensor(port, kind) {
        const i = this._port(port);
        const sensor = this.data.sensors[i];
        if (!sensor || sensor.kind !== kind) throw new Error('Missing or mismatched sensor');
        return copy(sensor);
    }

    imu() {
        return copy(this.data.imu);
    }

    buttons() {
        return copy(this.data.buttons);
    }

    setPixels(levels) {
        if (!Array.isArray(levels) || levels.length !== 25) throw new RangeError('Expected 25 pixels');
        const next = levels.map(v => clamp(finite(v), 0, 9));
        this.data.display.splice(0, 25, ...next);
        this._changed();
    }

    setPixel(x, y, brightness) {
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 4 || y < 0 || y > 4) throw new RangeError('Invalid pixel coordinates');
        this.data.display[y * 5 + x] = clamp(finite(brightness), 0, 9);
        this._changed();
    }

    setLight(value) {
        this.data.centerLight = clamp(finite(value), 0, 11);
        this._changed();
    }

    setVolume(value) {
        this.data.volume = clamp(finite(value), 0, 100);
        this._changed();
    }

    setDistanceLights(port, levels) {
        const i = this._port(port);
        if (!Array.isArray(levels) || levels.length !== 4) throw new RangeError('Expected four lights');
        const next = levels.map(v => clamp(finite(v), 0, 9));
        this.data.distanceLights[i] = next;
        this._changed();
    }
}
