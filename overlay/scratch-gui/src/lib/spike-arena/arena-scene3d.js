// SPDX-License-Identifier: BSD-3-Clause
// The SPIKE arena as a three.js scene graph, built from the world and moved
// by ArenaSim.snapshot() — the same snapshot the 2D canvas draws
// (arena-render.js). It is a reader: it never calls into the simulation and
// never writes to the snapshot, so opening the 3D view cannot change a run
// (docs/SPIKE-ARENA.md, "The 3D view").
//
// No renderer, no DOM: building the scene and applying a snapshot is plain
// three.js object work, so a Node test can assert every transform. The WebGL
// half (renderer, cameras, controls) is arena-view3d.js. Both reach the app
// only through the pane's dynamic import, so three.js stays out of the first
// load (scripts/verify-boot-payload.mjs).
//
// Frames. The arena is centimetres on the mat, x to the right and y DOWN,
// heading degrees clockwise seen from above, 0 facing +x (geometry.js). The
// scene is metres, y up: arena (x, y) -> scene (x, 0, y) * M_PER_CM, so
// looking down the scene's -y with -z at the top of the screen shows the mat
// exactly as the 2D canvas does. A heading h turns the rover about -y:
// rotation.y = -h in radians. In the rover's own frame x is forward and z is
// its right (the arena's robot frame, x forward and y to the right).

import {
    AmbientLight, BoxGeometry, BufferGeometry, CanvasTexture, CircleGeometry, Color, ConeGeometry,
    CylinderGeometry, DirectionalLight, ExtrudeGeometry, Float32BufferAttribute, Group, Line,
    LineBasicMaterial, Mesh, MeshBasicMaterial, MeshStandardMaterial, OrthographicCamera,
    PerspectiveCamera, PlaneGeometry, Scene, Shape, SphereGeometry, SRGBColorSpace, Vector3
} from 'three';
import {MAT_COLORS} from './arena-sim.js';
import {DEG, convexPieces, shapeCentre} from './geometry.js';

/** Scene units per arena unit: the scene is in metres, the arena in cm. */
export const M_PER_CM = 0.01;
/** Heights the 2D world does not have. Walls are a LEGO-brick fence; crates a box. */
export const WALL_HEIGHT_CM = 6;
export const OBJECT_HEIGHT_CM = 5;
/** The rover's body, sitting just above the wheel axles (a SPIKE hub on a
 *  driving base), so the lower half of each wheel shows beneath it. */
const BODY_HEIGHT_CM = 5.5;
const BODY_CLEARANCE_CM = 1.2;
const SENSOR_SIZE_CM = 1.6;

const WALL_COLOR = '#4a3f3a';
const OBJECT_COLOR = '#7a5a48';
const BODY_COLOR = '#f8f9fa';
const BODY_BLOCKED_COLOR = '#ffd8a8';

/** Arena (x, y) cm, plus height above the mat in cm, to a scene position. */
export const toScene = (x, y, up = 0) => new Vector3(x * M_PER_CM, up * M_PER_CM, y * M_PER_CM);
/** The scene rotation about y for an arena heading in degrees. */
export const headingToYaw = heading => -heading * DEG;

/** A convex piece (convexPieces) extruded upward by height cm, relative to an origin on the mat. */
const pieceMesh = (piece, height, material, origin = [0, 0]) => {
    const [ox, oy] = origin;
    let geometry;
    if (piece.circle) {
        const {x, y, r} = piece.circle;
        geometry = new CylinderGeometry(r * M_PER_CM, r * M_PER_CM, height * M_PER_CM, 32);
        geometry.translate((x - ox) * M_PER_CM, height * M_PER_CM / 2, (y - oy) * M_PER_CM);
    } else {
        // The outline in the shape's x/y plane; rotating it +90 degrees about x
        // takes (x, y, 0) to (x, 0, y) — the mat plane — and the extrusion's +z
        // to -y, so it is lifted by its height to stand on the mat.
        const shape = new Shape(piece.poly.map(([x, y]) => ({x: (x - ox) * M_PER_CM, y: (y - oy) * M_PER_CM})));
        geometry = new ExtrudeGeometry(shape, {depth: height * M_PER_CM, bevelEnabled: false});
        geometry.rotateX(Math.PI / 2);
        geometry.translate(0, height * M_PER_CM, 0);
    }
    return new Mesh(geometry, material);
};

const solidGroup = (shape, height, material, origin) => {
    const group = new Group();
    for (const piece of convexPieces(shape)) group.add(pieceMesh(piece, height, material, origin));
    return group;
};

/**
 * Builds the scene for a world and a driving base.
 * @param {object} world a validated challenge (arena-world.js)
 * @param {object} robot the driving base (bridge.robot / ArenaSim.robot)
 * @param {object} [options]
 * @param {HTMLCanvasElement} [options.matCanvas] the mat drawn by drawMat
 *   (arena-render.js), used as the mat's texture; without one (a test) the mat
 *   is its background colour
 * @returns {object} {scene, mat, walls, objects: Map<id, Group>, rover, body,
 *   wheels: {left, right}, sensors: Map<port, object>, trail, update(snapshot), dispose()}
 */
export const buildArenaScene = (world, robot, {matCanvas = null} = {}) => {
    const scene = new Scene();
    scene.background = new Color('#e9eef5');
    scene.add(new AmbientLight(0xffffff, 1.4));
    const sun = new DirectionalLight(0xffffff, 2.2);
    sun.position.copy(toScene(world.mat.width * 0.3, -world.mat.height * 0.6, 220));
    sun.target.position.copy(toScene(world.mat.width / 2, world.mat.height / 2));
    scene.add(sun, sun.target);

    const {mat} = world;
    const matGeometry = new PlaneGeometry(mat.width * M_PER_CM, mat.height * M_PER_CM);
    // A plane faces +z; -90 degrees about x lays it on the mat facing up, its
    // top edge (+y) toward -z: the arena's y = 0 side, as the canvas draws it.
    matGeometry.rotateX(-Math.PI / 2);
    let texture = null;
    if (matCanvas) {
        texture = new CanvasTexture(matCanvas);
        texture.colorSpace = SRGBColorSpace;
        texture.anisotropy = 4;
    }
    const matMesh = new Mesh(matGeometry, new MeshStandardMaterial(texture ? {map: texture, roughness: 0.95} :
        {color: mat.paint || (MAT_COLORS[mat.background] || MAT_COLORS.white).draw, roughness: 0.95}));
    matMesh.position.copy(toScene(mat.width / 2, mat.height / 2));
    matMesh.name = 'mat';
    scene.add(matMesh);

    const wallMaterial = new MeshStandardMaterial({color: WALL_COLOR, roughness: 0.8});
    const walls = (world.walls || []).map((wall, i) => {
        const group = solidGroup(wall.shape, WALL_HEIGHT_CM, wallMaterial);
        group.name = `wall-${i}`;
        scene.add(group);
        return group;
    });

    // Objects are built around their centre, so a pushed crate is placed by its
    // snapshot centre alone (objects do not rotate: arena-sim.js).
    const objects = new Map();
    for (const object of world.objects || []) {
        const centre = shapeCentre(object.shape);
        const material = new MeshStandardMaterial({color: object.color || OBJECT_COLOR, roughness: 0.7});
        const group = solidGroup(object.shape, OBJECT_HEIGHT_CM, material, centre);
        group.name = `object-${object.id}`;
        group.position.copy(toScene(centre[0], centre[1]));
        scene.add(group);
        objects.set(object.id, group);
    }

    // The rover. Its group's origin is the axle midpoint on the mat.
    const rover = new Group();
    rover.name = 'rover';
    const {front, back, halfWidth} = robot.body;
    const bodyMaterial = new MeshStandardMaterial({color: BODY_COLOR, roughness: 0.5});
    const body = new Mesh(new BoxGeometry((front + back) * M_PER_CM, BODY_HEIGHT_CM * M_PER_CM, 2 * halfWidth * M_PER_CM),
        bodyMaterial);
    const bodyBottom = robot.wheelDiameter / 2 + BODY_CLEARANCE_CM;
    body.position.copy(toScene((front - back) / 2, 0, bodyBottom + BODY_HEIGHT_CM / 2));
    body.name = 'body';
    rover.add(body);
    const notch = new Mesh(new ConeGeometry(1.6 * M_PER_CM, 3 * M_PER_CM, 16), new MeshStandardMaterial({color: '#f59f00'}));
    notch.geometry.rotateZ(-Math.PI / 2); // point along +x, forward
    notch.position.copy(toScene(front - 2, 0, bodyBottom + BODY_HEIGHT_CM + 0.8));
    rover.add(notch);

    const wheelMaterial = new MeshStandardMaterial({color: '#343a40', roughness: 0.9});
    const hubMaterial = new MeshStandardMaterial({color: '#adb5bd'});
    const wheels = {};
    const wheelRadius = {};
    for (const [name, side] of [['left', -1], ['right', 1]]) {
        const diameter = robot[name].wheelDiameter ?? robot.wheelDiameter;
        wheelRadius[name] = diameter / 2;
        const radius = diameter / 2 * M_PER_CM;
        const geometry = new CylinderGeometry(radius, radius, robot.wheel.width * M_PER_CM, 28);
        geometry.rotateX(Math.PI / 2); // axle along the rover's z (its left-right)
        const wheel = new Mesh(geometry, wheelMaterial);
        // A spoke, so the wheel's turning is visible.
        const spoke = new Mesh(new BoxGeometry(radius * 1.7, radius * 0.25, robot.wheel.width * M_PER_CM * 1.1), hubMaterial);
        wheel.add(spoke);
        wheel.position.copy(toScene(0, side * robot.axleTrack / 2, diameter / 2));
        wheel.name = `wheel-${name}`;
        rover.add(wheel);
        wheels[name] = wheel;
    }

    // Sensors, at their mount points in the rover frame, facing their heading.
    const sensors = new Map();
    // Sensors hang low at the front of the body, as on the driving base.
    const mountHeight = 2;
    for (const sensor of robot.sensors || []) {
        const group = new Group();
        group.name = `sensor-${sensor.port}`;
        group.position.copy(toScene(sensor.x, sensor.y, Math.max(SENSOR_SIZE_CM / 2, mountHeight)));
        group.rotation.y = headingToYaw(sensor.heading || 0);
        const entry = {sensor, group};
        if (sensor.kind === 'color') {
            group.add(new Mesh(new BoxGeometry(SENSOR_SIZE_CM * M_PER_CM, SENSOR_SIZE_CM * M_PER_CM, SENSOR_SIZE_CM * M_PER_CM),
                new MeshStandardMaterial({color: '#e9ecef'})));
            // The spot it reads, on the mat (a child of the rover, not the
            // sensor, so it lies flat at mat height), in the colour it reads.
            entry.spot = new Mesh(new CircleGeometry(1.1 * M_PER_CM, 24), new MeshBasicMaterial({color: MAT_COLORS.white.draw}));
            entry.spot.geometry.rotateX(-Math.PI / 2);
            entry.spot.position.copy(toScene(sensor.x, sensor.y, 0.05));
            entry.spot.name = `spot-${sensor.port}`;
            rover.add(entry.spot);
        } else if (sensor.kind === 'distance') {
            group.add(new Mesh(new BoxGeometry(SENSOR_SIZE_CM * M_PER_CM, SENSOR_SIZE_CM * M_PER_CM, 2.4 * M_PER_CM),
                new MeshStandardMaterial({color: '#1c7ed6'})));
            // The beam: a unit length along +x, scaled to the reading.
            const beamGeometry = new BoxGeometry(1, 0.2 * M_PER_CM, 0.2 * M_PER_CM);
            beamGeometry.translate(0.5, 0, 0);
            entry.beam = new Mesh(beamGeometry, new MeshBasicMaterial({color: '#1c7ed6', transparent: true, opacity: 0.7}));
            entry.beam.visible = false;
            entry.beam.name = `beam-${sensor.port}`;
            group.add(entry.beam);
        } else if (sensor.kind === 'force') {
            entry.material = new MeshStandardMaterial({color: '#868e96'});
            group.add(new Mesh(new SphereGeometry(0.8 * M_PER_CM, 16, 12), entry.material));
        }
        rover.add(group);
        sensors.set(sensor.port, entry);
    }
    scene.add(rover);

    const trailGeometry = new BufferGeometry();
    const trail = new Line(trailGeometry, new LineBasicMaterial({color: '#ffffff', transparent: true, opacity: 0.8}));
    trail.name = 'trail';
    scene.add(trail);
    let trailDrawn = -1;

    /** Moves everything to a snapshot. Reads it; never writes to it. */
    const update = snapshot => {
        const {pose} = snapshot;
        rover.position.copy(toScene(pose.x, pose.y));
        rover.rotation.y = headingToYaw(pose.heading);
        bodyMaterial.color.set(snapshot.blocked ? BODY_BLOCKED_COLOR : BODY_COLOR);
        // Forward travel rolls a wheel's top toward +x: a turn about -z.
        const travel = snapshot.wheelTravel || {left: 0, right: 0};
        wheels.left.rotation.z = -travel.left / wheelRadius.left;
        wheels.right.rotation.z = -travel.right / wheelRadius.right;
        for (const object of snapshot.objects || []) {
            const group = objects.get(object.id);
            if (group) group.position.copy(toScene(object.centre[0], object.centre[1]));
        }
        for (const [port, entry] of sensors) {
            const reading = (snapshot.sensors || {})[port] || {};
            if (entry.spot) entry.spot.material.color.set((MAT_COLORS[reading.colorName] || MAT_COLORS.white).draw);
            if (entry.beam) {
                const length = reading.distance > 0 ? reading.distance / 10 : 0; // mm -> cm
                entry.beam.visible = length > 0;
                entry.beam.scale.x = Math.max(1e-6, length * M_PER_CM);
            }
            if (entry.material) entry.material.color.set(reading.pressed ? '#e03131' : '#868e96');
        }
        const points = snapshot.trail || [];
        if (points.length !== trailDrawn) {
            trailDrawn = points.length;
            const flat = new Float32Array(points.length * 3);
            points.forEach(([x, y], i) => {
                flat[i * 3] = x * M_PER_CM;
                flat[i * 3 + 1] = 0.002;
                flat[i * 3 + 2] = y * M_PER_CM;
            });
            trailGeometry.setAttribute('position', new Float32BufferAttribute(flat, 3));
            trailGeometry.computeBoundingSphere();
        }
    };

    const dispose = () => {
        scene.traverse(node => {
            if (node.geometry) node.geometry.dispose();
            if (node.material) node.material.dispose();
        });
        if (texture) texture.dispose();
    };

    return {scene, mat: matMesh, walls, objects, rover, body, wheels, wheelRadius, sensors, trail, update, dispose};
};

export const CAMERA_MODES = Object.freeze(['orbit', 'follow', 'top']);

/**
 * The top-down camera: orthographic, straight down, framing the mat exactly as
 * the 2D canvas does (x to the right, arena y down the screen) for a viewport
 * of the mat's own aspect.
 */
export const topDownCamera = (world, aspect = world.mat.width / world.mat.height) => {
    const {width, height} = world.mat;
    // Fit the whole mat, like the 2D view; extra room goes to the other axis.
    let halfW = width / 2;
    let halfH = height / 2;
    if (halfW / halfH > aspect) halfH = halfW / aspect; else halfW = halfH * aspect;
    const camera = new OrthographicCamera(-halfW * M_PER_CM, halfW * M_PER_CM, halfH * M_PER_CM, -halfH * M_PER_CM, 0.01, 20);
    camera.up.set(0, 0, -1);
    camera.position.copy(toScene(width / 2, height / 2, 300));
    camera.lookAt(toScene(width / 2, height / 2));
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    return camera;
};

/** A perspective camera for the orbit and follow modes. */
export const perspectiveCamera = aspect => new PerspectiveCamera(45, aspect, 0.01, 50);

/** Where the orbit camera starts: south of the mat and above it, the whole mat in view. */
export const orbitStart = world => {
    const {width, height} = world.mat;
    const reach = Math.max(width, height);
    return {position: toScene(width / 2, height / 2 + reach * 1.2, reach * 1.2), target: toScene(width / 2, height / 2)};
};

/** The follow camera: behind and above the rover, looking a little ahead of it. */
export const followPose = snapshot => {
    const {pose} = snapshot;
    const c = Math.cos(pose.heading * DEG);
    const s = Math.sin(pose.heading * DEG);
    return {
        position: toScene(pose.x - 45 * c, pose.y - 45 * s, 38),
        target: toScene(pose.x + 25 * c, pose.y + 25 * s, 0)
    };
};
