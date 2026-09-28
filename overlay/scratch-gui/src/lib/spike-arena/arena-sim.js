// SPDX-License-Identifier: BSD-3-Clause
// The SPIKE arena's world simulation: a two-wheeled driving base on a mat.
//
// Pure and deterministic: no DOM, no clock, no randomness. It is advanced by
// wheel travel (advanceWheels) and read back as a plain snapshot, so the 2D
// canvas today and a three.js view later (docs/SIM-LAB-PLAN.md) render the SAME
// state, and a test can drive it without either. It knows nothing about hubs;
// arena-hub-bridge.js couples it to the virtual SPIKE hub.
//
// What is modelled, and what is not (docs/SPIKE-ARENA.md, "The model"):
//   - kinematics: ideal differential drive, no wheel slip in free driving,
//     integrated exactly along the arc each step;
//   - collisions: the body is a rectangle; walls, the mat border and fixed
//     objects stop it with no penetration (the move is cut back to contact by
//     bisection). There is no sliding along a wall and no bounce: a blocked
//     step is simply shortened. The wheels keep turning (slip), so motor
//     positions keep counting while the robot stands still;
//   - pushable objects move with the robot's centre displacement while it is
//     in contact, if they are free to; they do not rotate;
//   - the colour sensor samples ONE point of the mat; the distance sensor casts
//     a fan of rays across a narrow cone; the force sensor is a point probe at
//     the tip of its button.

import {DEG, wrap180, toWorld, convexPieces, pointInShape, distanceToPieces,
    polygonOverlapsPieces, rayToPieces, translatePieces, translateShape, shapeCentre} from './geometry.js';

/**
 * The SPIKE Prime driving base, as Pybricks documents it for SPIKE Prime:
 * `DriveBase(left_motor, right_motor, wheel_diameter=56, axle_track=112)`,
 * left motor on port A mounted counterclockwise (docs.pybricks.com, robotics
 * module, "Driving straight and turning in place"). The SPIKE Prime wheel is
 * 56 mm. Body outline and sensor places are this arena's own choice for a
 * compact rover, all configurable.
 */
export const SPIKE_DRIVING_BASE = Object.freeze({
    wheelDiameter: 5.6, // cm
    axleTrack: 11.2, // cm, wheel centre to wheel centre
    left: {port: 'A', reversed: true},
    right: {port: 'B', reversed: false},
    // Body rectangle relative to the axle midpoint: x forward, y to the right.
    body: {front: 9, back: 8, halfWidth: 7},
    wheel: {width: 1.4},
    sensors: [
        {kind: 'color', port: 'C', x: 7, y: 0},
        {kind: 'distance', port: 'D', x: 9, y: 0, heading: 0},
        {kind: 'force', port: 'E', x: 9.8, y: 3}
    ]
});

/** SPIKE colour ids, as the colour sensor reports them. */
export const COLOR_IDS = Object.freeze({
    black: 0, magenta: 1, violet: 2, blue: 3, azure: 4, turquoise: 5,
    green: 6, yellow: 7, orange: 8, red: 9, white: 10
});
export const COLOR_NAMES = Object.freeze(Object.keys(COLOR_IDS));

/** How each mat colour looks to the colour sensor: reflected light (%) and
 *  raw RGB in the SPIKE 3 protocol's 0-1024 range, plus a drawing colour.
 *  Reflection values are this arena's round numbers for printed mat colours
 *  (black near 10, white near 100), not a measurement of any mat. */
export const MAT_COLORS = Object.freeze({
    black: {reflection: 10, rgb: [60, 60, 60], draw: '#1f2328'},
    magenta: {reflection: 45, rgb: [700, 200, 600], draw: '#d63384'},
    violet: {reflection: 35, rgb: [400, 250, 800], draw: '#7048e8'},
    blue: {reflection: 30, rgb: [120, 250, 800], draw: '#1c7ed6'},
    azure: {reflection: 60, rgb: [250, 700, 950], draw: '#4dabf7'},
    turquoise: {reflection: 55, rgb: [200, 800, 700], draw: '#20c997'},
    green: {reflection: 40, rgb: [150, 700, 200], draw: '#2f9e44'},
    yellow: {reflection: 85, rgb: [950, 900, 250], draw: '#fcc419'},
    orange: {reflection: 65, rgb: [950, 550, 150], draw: '#fd7e14'},
    red: {reflection: 50, rgb: [900, 150, 150], draw: '#e03131'},
    white: {reflection: 100, rgb: [1000, 1000, 1000], draw: '#f8f9fa'}
});

/** The SPIKE distance sensor: 50-2000 mm, 1 mm resolution (LEGO Education,
 *  "Technic Distance Sensor" technical specification). Outside that range it
 *  has no reading, which the hub reports as -1. The real entrance angle is
 *  about +/-35 degrees and varies with distance; this cone is narrower on
 *  purpose, so a wall beside the robot does not read as one ahead. */
export const DISTANCE_SENSOR = Object.freeze({minMm: 50, maxMm: 2000, coneDeg: 10, rays: 5});

/** How close (cm) the force sensor's tip must be to something solid to read pressed. */
export const FORCE_CONTACT_CM = 0.3;
/** Force reported while pressed, percent of the sensor's 10 N range. */
export const FORCE_PRESSED_PERCENT = 60;

const mergeRobot = (base, override = {}) => ({
    ...base,
    ...override,
    left: {...base.left, ...(override.left || {})},
    right: {...base.right, ...(override.right || {})},
    body: {...base.body, ...(override.body || {})},
    wheel: {...base.wheel, ...(override.wheel || {})},
    sensors: override.sensors || base.sensors
});

export class ArenaSim {
    /**
     * @param {object} world a validated world (arena-world.js)
     * @param {object} [robot] driving-base overrides on top of SPIKE_DRIVING_BASE and world.robot
     */
    constructor (world, robot = {}) {
        this.world = world;
        this.robot = mergeRobot(mergeRobot(SPIKE_DRIVING_BASE, world.robot || {}), robot);
        const {width, height} = world.mat;
        const t = 10;
        // The mat border is a wall unless the world says the robot may drive off.
        this.borderPieces = world.mat.border === false ? [] : [
            {x: width / 2, y: -t / 2, w: width + 2 * t, h: t}, {x: width / 2, y: height + t / 2, w: width + 2 * t, h: t},
            {x: -t / 2, y: height / 2, w: t, h: height}, {x: width + t / 2, y: height / 2, w: t, h: height}
        ].flatMap(r => convexPieces({type: 'rect', ...r}));
        this.wallPieces = [...this.borderPieces, ...(world.walls || []).flatMap(wall => convexPieces(wall.shape))];
        this.reset();
    }

    reset () {
        const start = this.world.start;
        this.pose = {x: start.x, y: start.y, heading: start.heading || 0};
        this.timeMs = 0;
        this.speed = 0; // cm/s along the heading
        this.turnRate = 0; // deg/s, clockwise positive
        this.distanceTravelled = 0;
        this.objects = (this.world.objects || []).map(object => ({
            id: object.id, pushable: Boolean(object.pushable), color: object.color, label: object.label,
            shape: object.shape, pieces: convexPieces(object.shape)
        }));
        this.blocked = false; // the last step was cut short by something solid
        this.blockedBy = null;
        this.touching = new Set(); // ids of objects (or 'wall') the body touches
        this.touchedEver = new Set();
        this.pushed = new Set();
        this.trail = [[this.pose.x, this.pose.y]];
        this._trailAcc = 0;
    }

    /** The body outline on the mat, for a pose. */
    footprint (pose = this.pose) {
        const {front, back, halfWidth} = this.robot.body;
        return [[front, -halfWidth], [front, halfWidth], [-back, halfWidth], [-back, -halfWidth]].map(p => toWorld(pose, p));
    }

    /** A pose after the wheels travel dl and dr cm, along the exact arc. */
    integrate (pose, dl, dr) {
        const ds = (dl + dr) / 2;
        const dh = (dl - dr) / this.robot.axleTrack; // radians, clockwise positive
        const h = pose.heading * DEG;
        let x;
        let y;
        if (Math.abs(dh) < 1e-9) {
            x = pose.x + ds * Math.cos(h);
            y = pose.y + ds * Math.sin(h);
        } else {
            const radius = ds / dh;
            x = pose.x + radius * (Math.sin(h + dh) - Math.sin(h));
            y = pose.y - radius * (Math.cos(h + dh) - Math.cos(h));
        }
        return {x, y, heading: pose.heading + dh / DEG};
    }

    _solidPieces (except = null) {
        const pieces = [...this.wallPieces];
        for (const object of this.objects) if (object !== except) pieces.push(...object.pieces);
        return pieces;
    }

    _blockedAt (pose) {
        const footprint = this.footprint(pose);
        if (polygonOverlapsPieces(footprint, this.wallPieces)) return 'wall';
        for (const object of this.objects) {
            if (!object.pushable && polygonOverlapsPieces(footprint, object.pieces)) return object.id;
        }
        return null;
    }

    /** Pushes any pushable object the pose overlaps by (dx, dy); returns the id that could not move, or null. */
    _push (pose, dx, dy) {
        const footprint = this.footprint(pose);
        for (const object of this.objects) {
            if (!object.pushable || !polygonOverlapsPieces(footprint, object.pieces)) continue;
            const moved = translatePieces(object.pieces, dx, dy);
            const others = this._solidPieces(object);
            if (polygonOverlapsPieces(footprint, moved) || moved.some(piece =>
                polygonOverlapsPieces(piece.poly || circlePoly(piece.circle), others))) return object.id;
            object.pieces = moved;
            object.shape = translateShape(object.shape, dx, dy);
            this.pushed.add(object.id);
        }
        return null;
    }

    /**
     * Moves the robot by wheel travel over dtMs.
     * @param {number} dl left wheel travel, cm (forward positive)
     * @param {number} dr right wheel travel, cm
     * @param {number} dtMs simulated time this covers
     */
    advanceWheels (dl, dr, dtMs) {
        const from = this.pose;
        let target = this.integrate(from, dl, dr);
        this.blocked = false;
        this.blockedBy = null;
        if (dl !== 0 || dr !== 0) {
            let blocker = this._blockedAt(target) || this._push(target, target.x - from.x, target.y - from.y);
            if (blocker) {
                // Cut the step back to contact: the largest fraction that is free.
                let low = 0;
                let high = 1;
                for (let i = 0; i < 12; i++) {
                    const mid = (low + high) / 2;
                    const trial = this.integrate(from, dl * mid, dr * mid);
                    if (this._blockedAt(trial) || this._wouldPushBlocked(trial, from)) high = mid; else low = mid;
                }
                target = this.integrate(from, dl * low, dr * low);
                this._push(target, target.x - from.x, target.y - from.y);
                this.blocked = true;
                this.blockedBy = blocker;
            }
        }
        const dt = dtMs / 1000;
        const moved = Math.hypot(target.x - from.x, target.y - from.y);
        const forward = (target.x - from.x) * Math.cos(from.heading * DEG) + (target.y - from.y) * Math.sin(from.heading * DEG);
        this.speed = dt > 0 ? forward / dt : 0;
        this.turnRate = dt > 0 ? (target.heading - from.heading) / dt : 0;
        this.pose = target;
        this.timeMs += dtMs;
        this.distanceTravelled += moved;
        this._trailAcc += moved;
        if (this._trailAcc >= 0.5) {
            this._trailAcc = 0;
            this.trail.push([target.x, target.y]);
            if (this.trail.length > 4000) this.trail.splice(0, this.trail.length - 4000);
        }
        this._updateContacts();
    }

    _wouldPushBlocked (pose, from) {
        const footprint = this.footprint(pose);
        const dx = pose.x - from.x;
        const dy = pose.y - from.y;
        for (const object of this.objects) {
            if (!object.pushable || !polygonOverlapsPieces(footprint, object.pieces)) continue;
            const moved = translatePieces(object.pieces, dx, dy);
            if (polygonOverlapsPieces(footprint, moved)) return true;
            const others = this._solidPieces(object);
            if (moved.some(piece => polygonOverlapsPieces(piece.poly || circlePoly(piece.circle), others))) return true;
        }
        return false;
    }

    _updateContacts () {
        const footprint = this.footprint();
        this.touching = new Set();
        if (polygonOverlapsPieces(footprint, this.wallPieces, FORCE_CONTACT_CM)) this.touching.add('wall');
        for (const object of this.objects) {
            if (polygonOverlapsPieces(footprint, object.pieces, FORCE_CONTACT_CM)) this.touching.add(object.id);
        }
        for (const id of this.touching) this.touchedEver.add(id);
    }

    /** Where a sensor is on the mat, and which way it faces. */
    sensorPose (sensor) {
        const [x, y] = toWorld(this.pose, [sensor.x, sensor.y]);
        return {x, y, heading: this.pose.heading + (sensor.heading || 0)};
    }

    /** The mat colour name under a point: the LAST mat shape containing it, else the background. */
    matColorAt (point) {
        const shapes = this.world.mat.shapes || [];
        for (let i = shapes.length - 1; i >= 0; i--) {
            if (pointInShape(point, shapes[i].shape)) return shapes[i].color;
        }
        return this.world.mat.background || 'white';
    }

    /** Distance sensor reading in mm, or -1 for no reading. */
    distanceMm (sensor) {
        const pose = this.sensorPose(sensor);
        const pieces = this._solidPieces();
        const {coneDeg, rays, minMm, maxMm} = {...DISTANCE_SENSOR, ...(sensor.cone || {})};
        let best = Infinity;
        for (let i = 0; i < rays; i++) {
            const offset = rays === 1 ? 0 : -coneDeg + 2 * coneDeg * i / (rays - 1);
            const angle = (pose.heading + offset) * DEG;
            best = Math.min(best, rayToPieces([pose.x, pose.y], [Math.cos(angle), Math.sin(angle)], pieces));
        }
        const mm = Math.round(best * 10);
        return Number.isFinite(best) && mm >= minMm && mm <= maxMm ? mm : -1;
    }

    /** Every mounted sensor's reading, keyed by port, in the hub's units. */
    readSensors () {
        const out = {};
        for (const sensor of this.robot.sensors) {
            if (sensor.kind === 'color') {
                const pose = this.sensorPose(sensor);
                const name = this.matColorAt([pose.x, pose.y]);
                const look = MAT_COLORS[name] || MAT_COLORS.white;
                out[sensor.port] = {kind: 'color', colorName: name, color: COLOR_IDS[name] ?? -1,
                    reflection: look.reflection, red: look.rgb[0], green: look.rgb[1], blue: look.rgb[2]};
            } else if (sensor.kind === 'distance') {
                out[sensor.port] = {kind: 'distance', distance: this.distanceMm(sensor)};
            } else if (sensor.kind === 'force') {
                const pose = this.sensorPose(sensor);
                const pressed = distanceToPieces([pose.x, pose.y], this._solidPieces()) <= FORCE_CONTACT_CM;
                out[sensor.port] = {kind: 'force', pressed, force: pressed ? FORCE_PRESSED_PERCENT : 0};
            }
        }
        return out;
    }

    /**
     * Everything a renderer or checker needs, as plain data. This is the
     * interface a later 3D view consumes; see docs/SPIKE-ARENA.md.
     */
    snapshot () {
        return {
            timeMs: this.timeMs,
            pose: {...this.pose},
            yawDeg: wrap180(this.pose.heading - (this.world.start.heading || 0)),
            speed: this.speed,
            turnRate: this.turnRate,
            footprint: this.footprint(),
            blocked: this.blocked,
            blockedBy: this.blockedBy,
            touching: [...this.touching],
            touchedEver: [...this.touchedEver],
            pushed: [...this.pushed],
            objects: this.objects.map(object => ({id: object.id, shape: object.shape, centre: shapeCentre(object.shape)})),
            sensors: this.readSensors(),
            sensorPoses: this.robot.sensors.map(sensor => ({...sensor, ...this.sensorPose(sensor)})),
            trail: this.trail
        };
    }
}

/** A circle as a 16-gon, for the rare circle-against-something test on a moved pushable. */
const circlePoly = ({x, y, r}) => Array.from({length: 16}, (_, i) =>
    [x + r * Math.cos(i * Math.PI / 8), y + r * Math.sin(i * Math.PI / 8)]);
