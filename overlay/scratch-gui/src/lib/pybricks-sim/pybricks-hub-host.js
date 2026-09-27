// SPDX-License-Identifier: BSD-3-Clause
// Host for the Pybricks SPIKE Prime simulator (static/pybricks-sim/).
//
// The simulator is Pybricks MicroPython itself, compiled to WebAssembly on a
// small hardware layer (firmware/pybricks-wasm/). This module is the page side
// of that layer: it boots the hub, runs Python source, and exposes the ports,
// light matrix, status light, buttons, IMU and speaker as plain values.
//
// It has no DOM or bundler dependency, so the same code drives the pane in the
// browser and the node tests. The caller supplies the emscripten factory
// (`createPybricksHub` from pybricks-hub.js).

/** LEGO device type ids the simulated ports can carry (LUMP type ids). */
export const DEVICE_TYPES = Object.freeze({
    none: 0,
    'motor-m': 48, // SPIKE Medium Angular Motor
    'motor-l': 49, // SPIKE Large Angular Motor
    'motor-s': 65, // SPIKE Small Angular Motor
    color: 61, // SPIKE Color Sensor
    distance: 62, // SPIKE Ultrasonic (distance) Sensor
    force: 63 // SPIKE Force Sensor
});

export const PORTS = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F']);

/** Hub button flags (pbio_button_flags_t). */
export const BUTTONS = Object.freeze({left: 1 << 4, center: 1 << 5, right: 1 << 6, bluetooth: 1 << 9});

/** pbw_run() results. */
export const RESULT = Object.freeze({ok: 0, exception: 1, stopped: 2, notBooted: 3, busy: 4});
const RESULT_NAMES = ['ok', 'exception', 'stopped', 'not-booted', 'busy'];

const portIndex = port => {
    const index = typeof port === 'string' ? PORTS.indexOf(port.toUpperCase()) : Number(port);
    if (!Number.isInteger(index) || index < 0 || index > 5) throw new RangeError(`SPIKE port must be A-F, got ${port}`);
    return index;
};

const kindOf = typeId => Object.keys(DEVICE_TYPES).find(k => DEVICE_TYPES[k] === typeId) || 'none';

/**
 * Creates a simulated hub.
 *
 * @param {object} options
 * @param {function} options.factory       emscripten module factory (createPybricksHub)
 * @param {function} [options.locateFile]   where to fetch pybricks-hub.wasm from
 * @param {Uint8Array} [options.wasmBinary] the wasm bytes, instead of fetching
 * @param {boolean} [options.realtime]      pace simulated time to the wall clock (browser)
 * @param {function} [options.onOutput]     (text) => void, program stdout/stderr
 * @param {function} [options.onBeep]       (frequencyHz) => void, 0 = silence
 * @param {function} [options.onTick]       (simulatedMs) => void, every simulated millisecond
 */
export const createPybricksHost = async ({factory, locateFile, wasmBinary, realtime = false,
    onOutput, onBeep, onTick} = {}) => {
    if (typeof factory !== 'function') throw new TypeError('createPybricksHost needs the emscripten factory');
    const decoder = new TextDecoder();
    const moduleArgs = {
        pbwOnStdout: bytes => { if (onOutput) onOutput(decoder.decode(bytes, {stream: true})); },
        pbwOnBeep: frequency => { if (onBeep) onBeep(frequency); },
        pbwOnTick: onTick ? ms => onTick(ms) : undefined,
        print: text => { if (onOutput) onOutput(`${text}\n`); },
        printErr: text => { if (onOutput) onOutput(`${text}\n`); }
    };
    if (locateFile) moduleArgs.locateFile = locateFile;
    if (wasmBinary) moduleArgs.wasmBinary = wasmBinary;
    const M = await factory(moduleArgs);

    let booted = false;
    let busy = null;

    const host = {
        module: M,

        /** Boots drivers, pbio and pbsys; attached devices sync. */
        async boot () {
            if (booted) return;
            M._pbw_set_realtime(realtime ? 1 : 0);
            await M.ccall('pbw_boot', 'number', [], [], {async: true});
            booted = true;
        },

        /**
         * Compiles and runs a Pybricks program. Resolves when it ends.
         * @param {string} source Python source
         * @param {object} [opts]
         * @param {number} [opts.settleMs] simulated time to let newly attached devices sync first
         * @returns {Promise<{result: string, code: number, simulatedMs: number}>}
         */
        async run (source, {settleMs = 400} = {}) {
            if (!booted) await host.boot();
            if (busy) throw new Error('a program is already running');
            M._pbw_set_realtime(realtime ? 1 : 0);
            const start = M._pbw_now_ms();
            const ptr = M.stringToNewUTF8(String(source));
            busy = M.ccall('pbw_run', 'number', ['number', 'number'], [ptr, settleMs], {async: true});
            try {
                const code = await busy;
                return {result: RESULT_NAMES[code] || String(code), code, simulatedMs: M._pbw_now_ms() - start};
            } finally {
                busy = null;
                M._free(ptr);
            }
        },

        /** Stops the running program: first SystemExit (as the stop button), then abort. */
        stop () { M._pbw_request_stop(); },
        get running () { return Boolean(M._pbw_is_running()); },
        get booted () { return booted; },
        get simulatedMs () { return M._pbw_now_ms(); },
        setRealtime (on) { realtime = Boolean(on); M._pbw_set_realtime(realtime ? 1 : 0); },

        /** Lets simulated time pass with no program running. */
        async idle (ms) {
            if (!booted) await host.boot();
            await M.ccall('pbw_idle', null, ['number'], [ms], {async: true});
        },

        // ---- ports -------------------------------------------------------
        /** Plugs a device into a port: one of the DEVICE_TYPES keys. */
        setDevice (port, kind) {
            const typeId = DEVICE_TYPES[kind];
            if (typeId === undefined) throw new RangeError(`unknown SPIKE device ${kind}`);
            M._pbw_port_set_device(portIndex(port), typeId);
        },
        device (port) { return kindOf(M._pbw_port_device(portIndex(port))); },
        /** True once the hub's LUMP driver has completed the handshake with the device. */
        synced (port) { return Boolean(M._pbw_device_is_synced_js(portIndex(port))); },
        /** Surface colour under a colour sensor, 0-255 per channel; ambient light 0-100 %. */
        setColor (port, {r = 0, g = 0, b = 0, ambient} = {}) {
            const i = portIndex(port);
            M._pbw_sensor_set_rgb(i, r, g, b);
            if (ambient !== undefined) M._pbw_sensor_set_ambient(i, ambient);
        },
        /** Distance in front of an ultrasonic sensor, mm (-1 = nothing in range). */
        setDistance (port, mm) { M._pbw_sensor_set_distance(portIndex(port), Math.round(mm)); },
        /** Force on a force sensor, newtons (0-10). */
        setForce (port, newtons) { M._pbw_sensor_set_force(portIndex(port), Math.round(newtons * 1000)); },
        /** Motor shaft angle in degrees, as the physics has it. */
        motorAngle (port) { return M._pbw_motor_angle(portIndex(port)); },
        /** Motor speed in degrees per second. */
        motorSpeed (port) { return M._pbw_motor_speed(portIndex(port)); },
        /** Motor drive voltage in millivolts (sign = direction). */
        motorVoltage (port) { return M._pbw_motor_voltage(portIndex(port)); },
        /** Turns a motor shaft by hand (degrees). */
        setMotorAngle (port, degrees) { M._pbw_motor_set_angle(portIndex(port), degrees); },
        /** Sensor/motor lights written by the program (colour/ultrasonic lights). */
        deviceLights (port) {
            const i = portIndex(port);
            return [0, 1, 2, 3].map(k => M._pbw_device_light(i, k));
        },

        // ---- hub ---------------------------------------------------------
        /** Light matrix: 25 brightness values 0-100, row-major from the top left. */
        pixels () { return Array.from({length: 25}, (_, i) => M._pbw_matrix_pixel(i)); },
        /** Status light colour as 0-255 RGB. */
        statusLight () {
            const raw = [0, 1, 2].map(ch => M._pbw_pwm_duty(1, ch));
            const max = Math.max(...raw);
            return max ? raw.map(v => Math.round(v * 255 / max)) : [0, 0, 0];
        },
        /** Increments when the matrix or status light changes. */
        outputGeneration () { return M._pbw_output_generation(); },
        /** Presses buttons: {left, center, right, bluetooth} booleans. */
        setButtons (pressed = {}) {
            let flags = 0;
            for (const [name, bit] of Object.entries(BUTTONS)) if (pressed[name]) flags |= bit;
            M._pbw_set_buttons(flags);
        },
        /** Orientation in degrees; the hub turns towards it at up to 720 deg/s. */
        setOrientation ({pitch = 0, roll = 0, yaw = 0} = {}) { M._pbw_imu_set_orientation(pitch, roll, yaw); },
        /** Current beep frequency (Hz, 0 = silent) and number of beeps started. */
        speaker () { return {frequency: M._pbw_beep_frequency(), beeps: M._pbw_beep_count()}; },
        /** Sends text to the program's stdin (input(), sys.stdin). */
        writeStdin (text) {
            const bytes = new TextEncoder().encode(text);
            const ptr = M._malloc(bytes.length || 1);
            M.HEAPU8.set(bytes, ptr);
            const n = M._pbw_stdin_write(ptr, bytes.length);
            M._free(ptr);
            return n;
        },

        /** Everything the pane draws, in one object. */
        snapshot () {
            return {
                simulatedMs: M._pbw_now_ms(),
                running: host.running,
                pixels: host.pixels(),
                statusLight: host.statusLight(),
                ports: PORTS.map(p => ({
                    port: p,
                    device: host.device(p),
                    synced: host.synced(p),
                    angle: host.motorAngle(p),
                    speed: host.motorSpeed(p)
                }))
            };
        }
    };
    return host;
};

/** Does this Python source target Pybricks? (What the Code tab keys the button on.) */
export const isPybricksProgram = source => /^\s*(from\s+pybricks[\s.]|import\s+pybricks\b)/m.test(String(source || ''));
