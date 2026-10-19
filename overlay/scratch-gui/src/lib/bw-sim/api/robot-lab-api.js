// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// THE ROBOT LAB API (docs/ROBOT-LAB-HUBS-PLAN.md P1, docs/SIM-LAB.md "Steering
// the Lab"): one façade over the pane's SimSession, so the owner's "all must be
// steerable also by pseudocode and blocks and other code flavors. motors etc
// directly by code/blocks" is one method list with four surfaces:
//
//   blocks         the `robotlab` extension (scratch-vm crispstrobe/robotlab) calls
//                  `runtime.robotLab.<method>` — this object, installed by the pane
//                  the way `runtime.nqcCompile` / `runtime.rcxDownload` are hooks;
//   `lab` words    robotLabDialect.js, one table for parser and decompiler: each word
//                  IS one of those blocks;
//   Python / JS    `_robotlab.<method>(…)` (SB3Creator.RUNTIME_EXTENSIONS.robotlab),
//                  whose 'simulator' driver binds to this object, and which the
//                  readers lift back into the same blocks;
//   gates / tests  `window.__bwSimLab.api`.
//
// WHAT IT TOUCHES. Only the session's public surface — its mechanism, its model,
// its hubs (VirtualHubs) and the poses its core answers (in-thread, or the
// worker's mirror). It imports nothing from physics/ or mech/ (the boundary test,
// test/bw-sim-hub-boundary-imports.test.mjs). A motor command is NEVER a physics
// call: it goes to the hub that owns the motor's port —
//
//   - a model without a hub: the Robot Lab's own `lab-direct` hub (hubs/lab-direct),
//     which owns every motor of the model;
//   - a motor on a SPIKE hub's port: that hub's own controller (directCommand), the
//     one a SPIKE block drives, so the port keeps one owner and the last command wins;
//   - a motor on a hub whose program runs ON the hub (the SPIKE firmware route, later
//     the RCX VM): REFUSED, with a sentence that says why. Two programs fighting over
//     one port is not something a child can debug, and the hub program is the one the
//     learner chose to run there.
//
// — and the command reaches the motor on the next 5 ms step (one clock; on the
// worker, a command made while a batch is in flight redoes that batch).
//
// THE LAB NOT OPEN. Before the Robot Lab tab is first shown there is no pane and so no
// `runtime.robotLab`; the blocks then report `lab status` as 'not open' and do nothing
// (the extension's side). With the pane up but no model, or a model loading, every
// call answers {ok: false, code: 'no-model' | 'loading'} and the block-level methods
// return neutral values; nothing here throws at a program.

import {portRefOf, partMotorJoint, partSensor, lduToWorld, upgradeMechanismV1} from '../contracts.js';

const DEG = 180 / Math.PI;

export const ROBOT_LAB_API_VERSION = 1;

/** Camera presets (view/camera-nav.js VIEW_DIRECTIONS, plus fit). */
export const CAMERA_PRESETS = Object.freeze(['home', 'top', 'front', 'side', 'fit']);

/** The slowest the Lab may run (slow motion); 1 is real time and the fastest (the VM paces the program). */
export const MIN_TIME_SCALE = 0.1;

/** Contact margin, m: two parts closer than this count as touching (Jolt's contact tolerances are below it). */
export const CONTACT_MARGIN_M = 0.001;

/** SPIKE colour ids (what the Lab's colour sensors report, sensors.js) as words. */
export const COLOR_NAMES = Object.freeze({
    '-1': 'none', 0: 'black', 1: 'magenta', 2: 'purple', 3: 'blue', 4: 'azure', 5: 'turquoise',
    6: 'green', 7: 'yellow', 8: 'orange', 9: 'red', 10: 'white'
});

const MESSAGES = {
    en: {
        'no-model': 'The Robot Lab has no model loaded yet.',
        loading: 'The Robot Lab is still loading the model.',
        'no-motor': 'There is no motor "{ref}" in this model (motors: {list}).',
        'no-sensor': 'There is no sensor "{ref}" in this model (sensors: {list}).',
        'no-part': 'There is no part "{ref}" in this model.',
        'hub-program': 'Motor {port} belongs to the {hub}, whose own program drives it. Change that program, or choose the Scratch-blocks route.',
        'bad-model': 'There is no model "{ref}" (models: {list}).',
        'bad-command': 'That is not a motor command: {why}'
    },
    de: {
        'no-model': 'Im Robot Lab ist noch kein Modell geladen.',
        loading: 'Das Robot Lab lädt das Modell noch.',
        'no-motor': 'In diesem Modell gibt es keinen Motor „{ref}“ (Motoren: {list}).',
        'no-sensor': 'In diesem Modell gibt es keinen Sensor „{ref}“ (Sensoren: {list}).',
        'no-part': 'In diesem Modell gibt es kein Teil „{ref}“.',
        'hub-program': 'Motor {port} gehört zum {hub}, dessen eigenes Programm ihn steuert. Ändere dieses Programm oder wähle den Weg über Scratch-Blöcke.',
        'bad-model': 'Es gibt kein Modell „{ref}“ (Modelle: {list}).',
        'bad-command': 'Das ist kein Motorbefehl: {why}'
    }
};

const fill = (text, values) => text.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ''));

const num = v => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const round1 = v => Math.round(v * 10) / 10;

// ---- small vector helpers (world frame, metres) ----------------------------------------
const rotate = ([x, y, z, w], [vx, vy, vz]) => {
    const tx = 2 * (y * vz - z * vy);
    const ty = 2 * (z * vx - x * vz);
    const tz = 2 * (x * vy - y * vx);
    return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
};
const quatMul = ([ax, ay, az, aw], [bx, by, bz, bw]) => [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** A collider as an oriented box in world: {c, axes[3], h[3]} (a cylinder or sphere as its bounding box). */
const colliderBox = (col, bodyPose) => {
    const q = bodyPose.rotation;
    const local = col.position || [0, 0, 0];
    const rot = col.rotation ? quatMul(q, col.rotation) : q;
    const h = col.shape === 'box' ? col.halfExtents
        : col.shape === 'cylinder' ? [col.radius, col.halfHeight, col.radius]
            : [col.radius, col.radius, col.radius];
    return {c: add(bodyPose.position, rotate(q, local)), axes: [rotate(rot, [1, 0, 0]), rotate(rot, [0, 1, 0]), rotate(rot, [0, 0, 1])], h};
};

/** Separating-axis test of two oriented boxes, each grown by margin/2. */
const boxesTouch = (a, b, margin) => {
    const ha = a.h.map(v => v + margin / 2);
    const hb = b.h.map(v => v + margin / 2);
    const d = sub(b.c, a.c);
    const axes = [...a.axes, ...b.axes];
    for (const u of a.axes) for (const v of b.axes) {
        const c = cross(u, v);
        if (Math.hypot(...c) > 1e-9) axes.push(c);
    }
    for (const L of axes) {
        const ra = a.axes.reduce((s, u, i) => s + ha[i] * Math.abs(dot(u, L)), 0);
        const rb = b.axes.reduce((s, u, i) => s + hb[i] * Math.abs(dot(u, L)), 0);
        if (Math.abs(dot(d, L)) > ra + rb) return false;
    }
    return true;
};

/**
 * The Robot Lab API over a host — the pane, or a test's stand-in.
 * @param {object} host
 * @param {() => object|null} host.getSession the SimSession on show (null: none, or loading)
 * @param {() => string} [host.getStatus] 'loading' | 'ready' | 'running' | 'paused' | 'failed'
 * @param {() => {id: string, title: object}[]} [host.listModels] the shipped models
 * @param {(spec: string) => Promise<object>} [host.loadModel] a model id, or LDraw text
 * @param {() => Promise|void} [host.start] runs the simulation (without pressing the green flag)
 * @param {() => void} [host.stop] pauses it (without stopping the program)
 * @param {() => Promise|void} [host.reset] reloads the model where it started
 * @param {(scale: number) => void} [host.setTimeScale]
 * @param {(view: string|{follow: string|null}) => void} [host.camera]
 * @param {() => void} [host.ensureRunning] a motor was told to turn: run the world if it is paused
 * @param {() => string} [host.locale] 'en' | 'de'
 */
export const createRobotLabApi = (host) => {
    const lang = () => ((host.locale && host.locale()) === 'de' ? 'de' : 'en');
    const say = (code, values = {}) => fill(MESSAGES[lang()][code] || code, values);
    const refuse = (code, values) => ({ok: false, code, message: say(code, values)});
    const session = () => {
        const s = host.getSession && host.getSession();
        return s && !s._disposed ? s : null;
    };
    const status = () => {
        const s = session();
        const st = host.getStatus ? host.getStatus() : (s ? 'ready' : 'no-model');
        if (!s && st !== 'loading' && st !== 'failed') return 'no-model';
        return st;
    };
    const noSession = () => refuse(status() === 'loading' ? 'loading' : 'no-model');

    // ---- what the model has: motors, sensors, parts (cached per session) ---------------
    let cache = null;
    const scene = () => {
        const s = session();
        if (!s) return null;
        if (cache && cache.session === s) return cache;
        const m = upgradeMechanismV1(s.mechanism);
        const model = s.runModel || s.model;
        const catalog = s.catalog || new Map();
        const meta = p => catalog.get(p.part);
        const hubs = s.hubs || [];
        // hub-bridge.js bindsTo: one hub takes everything; with several, each its own and the unnamed the first's.
        const ownerOf = hub => (hubs.length === 1 ? hubs[0] : hubs.find(h => h.id === hub) || (hub === null || hub === undefined ? hubs[0] : null)) || null;
        const motorParts = model.parts.filter(p => meta(p) && partMotorJoint(meta(p)));
        const motors = (m.actuators || []).map(a => {
            const part = motorParts.find(p => portRefOf(p)?.port === a.port && (!portRefOf(p)?.hub || portRefOf(p).hub === a.hub)) || null;
            const owner = ownerOf(a.hub);
            return {id: a.id, part: part ? part.id : null, port: a.port, joint: a.joint,
                hub: owner ? owner.id : null, profile: owner ? owner.profile : null, owner};
        });
        const sensors = (m.devices || []).filter(d => d.sensor).map(d => {
            const owner = ownerOf(d.hub);
            return {id: d.id, part: d.part, port: d.port, kind: d.sensor, hub: owner ? owner.id : null, owner};
        });
        const bodyOfPart = new Map();
        for (const b of s.mechanism.bodies) for (const id of b.parts || []) if (!bodyOfPart.has(id)) bodyOfPart.set(id, b);
        const parts = model.parts.filter(p => bodyOfPart.has(p.id)).map(p => ({id: p.id, part: p.part, body: bodyOfPart.get(p.id).id,
            kind: meta(p) ? (partMotorJoint(meta(p)) ? 'motor' : partSensor(meta(p)) ? 'sensor' : 'part') : 'part'}));
        const start = new Map(model.parts.map(p => [p.id, lduToWorld(p.position)]));
        // Bodies start at their origin, unrotated (CompiledMechanism): a part's offset in its body is fixed.
        const bodyStart = new Map(s.mechanism.bodies.map(b => [b.id, b]));
        cache = {session: s, motors, sensors, parts, bodyOfPart, start, bodyStart};
        return cache;
    };

    const findMotor = ref => {
        const sc = scene();
        if (!sc) return null;
        const r = String(ref ?? '').trim();
        return sc.motors.find(x => x.id === r) || sc.motors.find(x => x.part === r) || sc.motors.find(x => x.port === r) ||
            sc.motors.find(x => String(x.port).toUpperCase() === r.toUpperCase()) || null;
    };
    const findSensor = ref => {
        const sc = scene();
        if (!sc) return null;
        const r = String(ref ?? '').trim();
        return sc.sensors.find(x => x.id === r) || sc.sensors.find(x => x.part === r) || sc.sensors.find(x => x.port === r) ||
            sc.sensors.find(x => String(x.port).toUpperCase() === r.toUpperCase()) || null;
    };
    const motorList = () => (scene()?.motors || []).map(x => x.port).join(', ') || '–';

    // ---- motor commands that wait: a new scene ends every wait ---------------------------
    let gone = [];
    const untilGone = () => new Promise(resolve => gone.push(resolve));

    const setMotor = (ref, command = {}) => {
        const s = session();
        if (!s) return noSession();
        const motor = findMotor(ref);
        if (!motor) return refuse('no-motor', {ref, list: motorList()});
        const hub = motor.owner && motor.owner.hub;
        if (!hub || typeof hub.directCommand !== 'function') {
            const name = hub && hub.profile && hub.profile.name ? hub.profile.name[lang()] || hub.profile.name.en : '?';
            return refuse('hub-program', {port: motor.port, hub: name});
        }
        const result = hub.directCommand(motor.port, command);
        if (!result.ok) return result.code === 'bad-command' ? refuse('bad-command', {why: result.message}) : result;
        // A motor told to turn makes the world run, as holding the drive pad's arrow does.
        if (host.ensureRunning) host.ensureRunning();
        if (result.done) return {ok: true, done: Promise.race([result.done, untilGone().then(() => 'interrupted')])};
        return {ok: true};
    };

    const encoder = ref => {
        const s = session();
        if (!s) return noSession();
        const motor = findMotor(ref);
        if (!motor) return refuse('no-motor', {ref, list: motorList()});
        const hub = motor.owner && motor.owner.hub;
        const r = hub && typeof hub.readPort === 'function' ? hub.readPort(motor.port) : null;
        if (r && r.kind === 'motor') return {ok: true, angleDeg: r.angleDeg, speedDps: r.speedDps};
        // A hub that cannot say: the hinge itself, as the encoder would count it.
        const js = s.core.jointState(motor.joint);
        return {ok: true, angleDeg: js.angle * DEG, speedDps: js.velocity * DEG};
    };

    const readSensor = ref => {
        const s = session();
        if (!s) return noSession();
        const sensor = findSensor(ref);
        if (!sensor) return refuse('no-sensor', {ref, list: (scene()?.sensors || []).map(x => x.port).join(', ') || '–'});
        const hub = sensor.owner && sensor.owner.hub;
        const raw = hub && typeof hub.readPort === 'function' ? hub.readPort(sensor.port) : null;
        const r = raw || {kind: sensor.kind};
        let value = 0;
        if (sensor.kind === 'distance') value = num(r.distance) < 0 ? -1 : round1(num(r.distance) / 10);
        else if (sensor.kind === 'color') value = COLOR_NAMES[String(r.color ?? -1)] || 'none';
        else if (sensor.kind === 'force') value = num(r.force);
        else value = num(r.value);
        return {ok: true, kind: sensor.kind, value, raw: r};
    };

    const pose = partId => {
        const s = session();
        if (!s) return noSession();
        const sc = scene();
        const id = String(partId ?? '').trim();
        const body = sc.bodyOfPart.get(id) || (sc.bodyStart.has(id) ? sc.bodyStart.get(id) : null);
        if (!body) return refuse('no-part', {ref: id});
        const now = s.core.bodyPose(body.id);
        const startPart = sc.start.get(id) || body.position;
        const position = add(now.position, rotate(now.rotation, sub(startPart, body.position)));
        // Heading: the body's forward (LDraw +z, world -z) turned about the vertical since the start, clockwise seen from above.
        const f = rotate(now.rotation, [0, 0, -1]);
        const headingDeg = Math.abs(f[0]) + Math.abs(f[2]) < 1e-9 ? 0 : Math.atan2(f[0], -f[2]) * DEG;
        return {ok: true, position, quat: now.rotation.slice(), headingDeg};
    };

    /** Colliders of a part (its own) or of a static body (the ground, a mat's wall) as world boxes. */
    const boxesOf = (s, sc, ref) => {
        const id = String(ref ?? '').trim();
        const body = sc.bodyOfPart.get(id) || null;
        if (body) {
            const p = s.core.bodyPose(body.id);
            return body.colliders.filter(c => c.part === id || (!c.part && body.parts.length === 1)).map(c => colliderBox(c, p));
        }
        // 'ground', or a mat's obstacle by its own name ('wall' is the body 'obstacle:wall').
        const statik = s.mechanism.bodies.find(b => b.id === id) || s.mechanism.bodies.find(b => b.id === `obstacle:${id}`);
        if (!statik) return null;
        const p = s.core.bodyPose(statik.id);
        return statik.colliders.map(c => colliderBox(c, p));
    };

    /** Whether two parts (or a part and the ground / a mat's obstacle) touch now. */
    const touchingNow = (a, b) => {
        const s = session();
        if (!s) return false;
        const sc = scene();
        const A = boxesOf(s, sc, a);
        const B = boxesOf(s, sc, b);
        if (!A || !B) return false;
        return A.some(x => B.some(y => boxesTouch(x, y, CONTACT_MARGIN_M)));
    };

    // ---- contact watching: checked after every advance of simulated time ----------------
    const watches = new Map();   // key -> {a, b, touching, latched, listeners:Set}
    let unsubscribe = null;
    let watched = null;
    const keyOf = (a, b) => JSON.stringify([String(a), String(b)]);
    const check = () => {
        for (const w of watches.values()) {
            const now = touchingNow(w.a, w.b);
            if (now && !w.touching) {
                w.latched = true;
                for (const fn of [...w.listeners]) {
                    try { fn({a: w.a, b: w.b}); } catch (error) { setTimeout(() => { throw error; }, 0); }
                }
            }
            w.touching = now;
        }
    };
    const follow = () => {
        const s = session();
        if (s === watched) return;
        if (unsubscribe) unsubscribe();
        unsubscribe = null;
        watched = s;
        if (s && watches.size) unsubscribe = s.onAdvance(check);
    };
    const watch = (a, b) => {
        const key = keyOf(a, b);
        let w = watches.get(key);
        if (!w) {
            w = {a: String(a), b: String(b), touching: false, latched: false, listeners: new Set()};
            watches.set(key, w);
            w.touching = touchingNow(w.a, w.b);
            watched = undefined;
        }
        follow();
        return w;
    };

    const api = {
        version: ROBOT_LAB_API_VERSION,

        // ---- the scene --------------------------------------------------------------
        status,
        models: () => (host.listModels ? host.listModels() : []),
        async loadModel (spec) {
            if (!host.loadModel) return refuse('no-model');
            const s = String(spec ?? '').trim();
            const ldraw = /\n/.test(s) || /^[01]\s/.test(s);
            if (!ldraw) {
                const ids = api.models().map(m => m.id);
                const id = s.replace(/\.ldr$/i, '');
                if (!ids.includes(id)) return refuse('bad-model', {ref: s, list: ids.join(', ')});
                return host.loadModel(id);
            }
            return host.loadModel(s);
        },
        async start () { if (host.start) await host.start(); return {ok: Boolean(session()), status: status()}; },
        stop () { if (host.stop) host.stop(); return {ok: true, status: status()}; },
        async reset () { if (host.reset) await host.reset(); return {ok: Boolean(session()), status: status()}; },
        setTimeScale (scale) {
            const s = Math.max(MIN_TIME_SCALE, Math.min(1, num(scale) || 1));
            if (host.setTimeScale) host.setTimeScale(s);
            return {ok: true, scale: s};
        },
        camera (view) {
            if (view && typeof view === 'object') {
                if (host.camera) host.camera({follow: view.follow ?? null});
                return {ok: true};
            }
            const name = String(view ?? 'home').toLowerCase();
            if (!CAMERA_PRESETS.includes(name)) return {ok: false, code: 'bad-view', message: CAMERA_PRESETS.join(', ')};
            if (host.camera) host.camera(name);
            return {ok: true};
        },

        // ---- what is there -----------------------------------------------------------
        motors: () => (scene()?.motors || []).map(({owner, joint, ...m}) => ({...m, direct: Boolean(owner && owner.hub && owner.hub.directCommand)})),
        sensors: () => (scene()?.sensors || []).map(({owner, ...x}) => x),
        parts: () => (scene()?.parts || []).map(p => ({...p})),

        // ---- direct control and reads ---------------------------------------------------
        setMotor,
        /** Also the `stop motor` block's: an action other than brake, coast or hold brakes. */
        stopMotor: (ref, action = 'brake') => setMotor(ref, {stop: ['brake', 'coast', 'hold'].includes(action) ? action : 'brake'}),
        encoder,
        readSensor,
        pose,
        touching: (a, b) => touchingNow(a, b),
        /**
         * Where a part is on the floor: the corners of its colliders as [x, z] world metres (the
         * challenges' judge measures from these, not from the part's origin inside it). [] when unknown.
         */
        partOutline (part) {
            const s = session();
            if (!s) return [];
            const boxes = boxesOf(s, scene(), part) || [];
            const out = [];
            for (const b of boxes) {
                for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
                    const p = [0, 1, 2].map(k => b.c[k] + sx * b.h[0] * b.axes[0][k] + sy * b.h[1] * b.axes[1][k] + sz * b.h[2] * b.axes[2][k]);
                    out.push([p[0], p[2]]);
                }
            }
            return out;
        },
        /**
         * Calls fn({a, b}) each time `a` comes to touch `b` (a part id, or 'ground' / a mat
         * obstacle's id), after the step it happened in. Returns an unsubscribe.
         */
        onContact (a, b, fn) {
            const w = watch(a, b);
            w.listeners.add(fn);
            return () => w.listeners.delete(fn);
        },

        // ---- the block-level methods (one per robotlab block; robotLabDialect.js) -------
        // Numbers and words in and out, never a throw: a program keeps running.
        async setMotorPower (motor, power) { return setMotor(motor, {power: num(power)}).ok; },
        async setMotorSpeed (motor, speed) { return setMotor(motor, {speedDps: num(speed)}).ok; },
        async runMotorDegrees (motor, degrees, speed) {
            const r = setMotor(motor, {degrees: num(degrees), speedDps: num(speed)});
            return r.ok && r.done ? r.done : (r.ok ? 'completed' : r.code);
        },
        motorAngle (motor) { const r = encoder(motor); return r.ok ? round1(r.angleDeg) : 0; },
        motorSpeed (motor) { const r = encoder(motor); return r.ok ? round1(r.speedDps) : 0; },
        sensorValue (sensor) { const r = readSensor(sensor); return r.ok ? r.value : 0; },
        partPosition (part, axis) {
            const r = pose(part);
            if (!r.ok) return 0;
            const a = String(axis || 'x').toLowerCase();
            if (a === 'heading') return round1(r.headingDeg);
            const i = {x: 0, y: 1, z: 2}[a] ?? 0;
            return round1(r.position[i] * 100);
        },
        /** The hat's question: touching now, or touched since the last time it was asked (edge-triggered hats poll). */
        whenTouch (part, other) {
            const w = watch(part, other);
            const hit = w.touching || w.latched;
            w.latched = false;
            return hit;
        },
        /** Python/JS event registration (`_robotlab.on("robotlab_whenTouch", fn, part, other)`). */
        on (opcode, fn, ...args) {
            if (String(opcode).endsWith('whenTouch')) return api.onContact(args[0], args[1], fn);
            return () => {};
        },

        /** The host tells the API its session changed: waits end, cached lists and contacts are dropped. */
        sessionChanged () {
            cache = null;
            const waiting = gone;
            gone = [];
            for (const resolve of waiting) resolve();
            for (const w of watches.values()) { w.touching = false; w.latched = false; }
            watched = undefined;
            follow();
        },
        dispose () {
            if (unsubscribe) unsubscribe();
            unsubscribe = null;
            watches.clear();
            api.sessionChanged();
        }
    };
    return api;
};
