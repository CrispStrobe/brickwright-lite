// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Floor mats for the Sim Lab (E1, data half). Procedurally drawn, no scraped art.

import {palletLoad} from './objects.js';

const COLORS = {
    0: {color: 0, reflection: 5, rgb: [0, 0, 0]},
    3: {color: 3, reflection: 50, rgb: [0, 100, 200]}, // blue approx
    6: {color: 6, reflection: 50, rgb: [0, 200, 0]}, // green
    7: {color: 7, reflection: 80, rgb: [200, 200, 0]}, // yellow
    9: {color: 9, reflection: 50, rgb: [200, 0, 0]}, // red
    10: {color: 10, reflection: 100, rgb: [1024, 1024, 1024]} // white
};

// Helper to get colour for a given id
const col = id => COLORS[id];

export const MATS = [
    {id: 'plain', title: {en: 'Plain', de: 'Einfach'}},
    {id: 'line-oval', title: {en: 'Line Oval', de: 'Linien-Oval'}},
    {id: 'colour-zones', title: {en: 'Colour Zones', de: 'Farbzonen'}},
    {id: 'wall', title: {en: 'Wall', de: 'Wand'}},
    {id: 'sumo', title: {en: 'Sumo ring', de: 'Sumo-Ring'}},
    {id: 'maze', title: {en: 'Maze', de: 'Labyrinth'}},
    {id: 'warehouse', title: {en: 'Warehouse', de: 'Lager'}}
];

// Plain mat: white 1.2x0.8 (same as line-oval, but could be any, we choose 1.2x0.8 to match line-oval)
const plain = {
    id: 'plain',
    sizeM: [1.2, 0.8],
    // Documented start pose for a line follower: not on a line, just at origin heading 0
    startPose: {x: 0, z: 0, heading: 0},
    colorAt(x, z) {
        const [w, d] = this.sizeM;
        if (Math.abs(x) > w/2 || Math.abs(z) > d/2) {
            return {color: 10, reflection: 100, rgb: [1024, 1024, 1024]};
        }
        return {color: 10, reflection: 100, rgb: [1024, 1024, 1024]};
    },
    paint(imageData, pxPerM) {
        const [w, d] = this.sizeM;
        const pw = Math.round(w * pxPerM);
        const pd = Math.round(d * pxPerM);
        // imageData is {width, height, data: Uint8ClampedArray} where width/height are in pixels, centred on origin
        // For simplicity, we will fill the entire imageData with white where inside the mat, else floor white (same)
        for (let y = 0; y < imageData.height; y++) {
            for (let x = 0; x < imageData.width; x++) {
                const mx = (x - imageData.width/2 + 0.5) / pxPerM;
                const mz = (y - imageData.height/2 + 0.5) / pxPerM;
                const c = this.colorAt(mx, mz);
                const idx = (y * imageData.width + x) * 4;
                // Use rgb 0..1024 mapped to 0..255
                imageData.data[idx] = Math.round(c.rgb[0] / 4);
                imageData.data[idx+1] = Math.round(c.rgb[1] / 4);
                imageData.data[idx+2] = Math.round(c.rgb[2] / 4);
                imageData.data[idx+3] = 255;
            }
        }
    }
};

// Line-oval: white 1.2 x 0.8 m with a 20 mm black line forming a stadium: two
// straights along x at z = ±0.25 (x from -0.3 to 0.3) joined by two semicircles of
// radius 0.25 centred at (±0.3, 0). Centre-line length 2·0.6 + 2π·0.25 ≈ 2.771 m.
// A line follower starts ON the line at (0, 0.25), heading along +x.
export const LINE_OVAL = Object.freeze({halfStraight: 0.3, radius: 0.25, lineHalfWidth: 0.01});

/** Distance (m) from a world point (x, z) to the line-oval centre line. */
export const distanceToOvalCentre = (x, z) => {
    const {halfStraight: h, radius: r} = LINE_OVAL;
    if (Math.abs(x) <= h) return Math.abs(Math.abs(z) - r);
    const cx = Math.sign(x) * h;
    return Math.abs(Math.hypot(x - cx, z) - r);
};

/** The centre line as a closed path: point at arc length s (0 = the start pose, increasing along +x first). */
export const ovalCentreAt = s => {
    const {halfStraight: h, radius: r} = LINE_OVAL;
    const L = 4 * h + 2 * Math.PI * r;
    let t = ((s % L) + L) % L;
    if (t <= h) return [t, r];                               // top straight, from x=0 to +h
    t -= h;
    if (t <= Math.PI * r) {                                  // right semicircle, z from +r to -r
        const a = Math.PI / 2 - t / r;
        return [h + r * Math.cos(a), r * Math.sin(a)];
    }
    t -= Math.PI * r;
    if (t <= 2 * h) return [h - t, -r];                      // bottom straight, x from +h to -h
    t -= 2 * h;
    if (t <= Math.PI * r) {                                  // left semicircle, z from -r to +r
        const a = -Math.PI / 2 - t / r;
        return [-h + r * Math.cos(a), r * Math.sin(a)];
    }
    t -= Math.PI * r;
    return [-h + t, r];                                      // top straight, back to x=0
};

const lineOval = {
    id: 'line-oval',
    sizeM: [1.2, 0.8],
    centreLineLengthM: 4 * LINE_OVAL.halfStraight + 2 * Math.PI * LINE_OVAL.radius,
    // On the line at (0, 0.25), heading along +x (degrees from +x toward +z: 0).
    startPose: {x: 0, z: LINE_OVAL.radius, heading: 0},
    colorAt(x, z) {
        const [w, d] = this.sizeM;
        if (Math.abs(x) > w / 2 || Math.abs(z) > d / 2) return {color: 10, reflection: 100, rgb: [1024, 1024, 1024]};
        if (distanceToOvalCentre(x, z) <= LINE_OVAL.lineHalfWidth) return {color: 0, reflection: 5, rgb: [60, 60, 60]};
        return {color: 10, reflection: 100, rgb: [1024, 1024, 1024]};
    },
    paint(imageData, pxPerM) {
        for (let y = 0; y < imageData.height; y++) {
            for (let x = 0; x < imageData.width; x++) {
                const mx = (x - imageData.width/2 + 0.5) / pxPerM;
                const mz = (y - imageData.height/2 + 0.5) / pxPerM;
                const c = this.colorAt(mx, mz);
                const idx = (y * imageData.width + x) * 4;
                imageData.data[idx] = Math.round(c.rgb[0] / 4);
                imageData.data[idx+1] = Math.round(c.rgb[1] / 4);
                imageData.data[idx+2] = Math.round(c.rgb[2] / 4);
                imageData.data[idx+3] = 255;
            }
        }
    }
};

// Colour-zones: white 1.0x1.0 with four 0.3m squares in the corners and a black 20mm border line.
const colourZones = {
    id: 'colour-zones',
    sizeM: [1.0, 1.0],
    startPose: {x: 0, z: 0, heading: 0},
    colorAt(x, z) {
        const [w, d] = this.sizeM;
        if (Math.abs(x) > w/2 || Math.abs(z) > d/2) {
            return {color: 10, reflection: 100, rgb: [1024, 1024, 1024]};
        }
        // Border line: 20mm (0.02m) black around the edge
        const maxAbs = Math.max(Math.abs(x), Math.abs(z));
        if (maxAbs >= 0.48 && maxAbs <= 0.5) {
            return {color: 0, reflection: 5, rgb: [0, 0, 0]};
        }
        // Four 0.3m squares in the corners: Each square 0.3x0.3, in the corners of the mat, inset by the border (0.02) plus maybe a small gap.
        // The mat is 1.0x1.0, from -0.5 to 0.5 in x and z.
        // The squares are 0.3x0.3, in the corners: e.g., top-left (negative x, negative z) is red, etc.
        // Let's place them at:
        // Top-left (-0.5+0.15, -0.5+0.15) = (-0.35, -0.35) with size 0.3, so from -0.5 to -0.2 in x and z, but inset by border 0.02, so from -0.48 to -0.18?
        // Simpler: The squares are centred at (±0.35, ±0.35) with half size 0.15, so from -0.5 to -0.2 and 0.2 to 0.5, but with the border at 0.48-0.5, the squares should be inset by 0.02 from the edge, so from -0.48 to -0.18 and 0.18 to 0.48.
        // Let's define the squares as:
        // Red at (-0.35, -0.35) (top-left, -x -z)
        // Yellow at (0.35, -0.35) (top-right, +x -z)
        // Green at (-0.35, 0.35) (bottom-left, -x +z)
        // Blue at (0.35, 0.35) (bottom-right, +x +z)
        // Each with half size 0.15, so x from centre-0.15 to centre+0.15.
        const squares = [
            {centre: [-0.35, -0.35], color: 9, rgb: [200, 0, 0]}, // red
            {centre: [0.35, -0.35], color: 7, rgb: [200, 200, 0]}, // yellow
            {centre: [-0.35, 0.35], color: 6, rgb: [0, 200, 0]}, // green
            {centre: [0.35, 0.35], color: 3, rgb: [0, 100, 200]} // blue
        ];
        for (const sq of squares) {
            if (Math.abs(x - sq.centre[0]) <= 0.15 + 1e-9 && Math.abs(z - sq.centre[1]) <= 0.15 + 1e-9) {
                return {color: sq.color, reflection: 50, rgb: sq.rgb.slice()};
            }
        }
        return {color: 10, reflection: 100, rgb: [1024, 1024, 1024]};
    },
    paint(imageData, pxPerM) {
        for (let y = 0; y < imageData.height; y++) {
            for (let x = 0; x < imageData.width; x++) {
                const mx = (x - imageData.width/2 + 0.5) / pxPerM;
                const mz = (y - imageData.height/2 + 0.5) / pxPerM;
                const c = this.colorAt(mx, mz);
                const idx = (y * imageData.width + x) * 4;
                imageData.data[idx] = Math.round(c.rgb[0] / 4);
                imageData.data[idx+1] = Math.round(c.rgb[1] / 4);
                imageData.data[idx+2] = Math.round(c.rgb[2] / 4);
                imageData.data[idx+3] = 255;
            }
        }
    }
};

// Wall: the plain white floor with a wall across it. A mat may carry static
// obstacles (the compile option `obstacles`, world metres: x/z on the floor,
// y the height of the box's bottom above it): choosing the mat in the pane is
// how a wall gets into the scene. The robot starts 0.7 m from the wall, heading
// at it (+x); the wall's face toward it is at x = WALL.faceX.
export const WALL = Object.freeze({x: 0.4, thickness: 0.04, height: 0.15, width: 0.6, faceX: 0.4 - 0.04 / 2});

const wall = {
    id: 'wall',
    sizeM: plain.sizeM,
    startPose: {x: -0.3, z: 0, heading: 0},
    obstacles: [{id: 'wall', shape: 'box', size: [WALL.thickness, WALL.height, WALL.width], position: [WALL.x, 0, 0], color: 3}],
    colorAt: plain.colorAt,
    paint: plain.paint
};

// Sumo ring: white 1.0x1.0 with a black ring band centred on the mat. Outer
// diameter 0.77 m, band 0.05 m wide — so inner radius = 0.77/2 - 0.05 = 0.335 m,
// outer radius = 0.77/2 = 0.385 m (hand-derived; SUMO carries the same numbers).
// A robot starts at the centre and stays inside the ring by reading black at
// the band. Outside the ring the floor would be grey; COLORS has no grey id
// (only 0/3/6/7/9/10), so it reads white — see the sumo mat tests.
export const SUMO = Object.freeze({outerDiameter: 0.77, bandWidth: 0.05});

const sumo = {
    id: 'sumo',
    sizeM: [1.0, 1.0],
    startPose: {x: 0, z: 0, heading: 0},
    colorAt(x, z) {
        const [w, d] = this.sizeM;
        if (Math.abs(x) > w / 2 || Math.abs(z) > d / 2) return {color: 10, reflection: 100, rgb: [1024, 1024, 1024]};
        const r = Math.hypot(x, z);
        if (r >= SUMO.outerDiameter / 2 - SUMO.bandWidth && r <= SUMO.outerDiameter / 2) {
            return {color: 0, reflection: 5, rgb: [60, 60, 60]}; // the band: same printed-black rgb as the line-oval line
        }
        return {color: 10, reflection: 100, rgb: [1024, 1024, 1024]};
    },
    paint(imageData, pxPerM) {
        for (let y = 0; y < imageData.height; y++) {
            for (let x = 0; x < imageData.width; x++) {
                const mx = (x - imageData.width / 2 + 0.5) / pxPerM;
                const mz = (y - imageData.height / 2 + 0.5) / pxPerM;
                const c = this.colorAt(mx, mz);
                const idx = (y * imageData.width + x) * 4;
                imageData.data[idx] = Math.round(c.rgb[0] / 4);
                imageData.data[idx + 1] = Math.round(c.rgb[1] / 4);
                imageData.data[idx + 2] = Math.round(c.rgb[2] / 4);
                imageData.data[idx + 3] = 255;
            }
        }
    }
};

// Maze: white 1.2x1.2 (a 4x4 grid of 0.3 m cells) with walls as static boxes,
// the `wall` mat's obstacle format: each wall spans one cell edge (0.3 m long),
// 0.02 m thick, 0.04 m high, sitting on its grid line. The closed interior
// edges below are hand-drawn; the sketch reads with +x right and +z up,
// S = start cell (0,0), G = goal cell (3,0), · = an open edge:
//
//   z=+0.45|#   ·   · |   ·   row j=3
//          +---+---+---+
//   z=+0.15| · | · | · | ·   row j=2       primary route (10 cells):
//          +---+   +   +        S(0,0) - (0,1) - (1,1) - (1,2) - (1,3)
//   z=-0.15| · | · | · | ·   row j=1       - (2,3) - (2,2) - (2,1) - (2,0) - G
//          +---+---+   +
//   z=-0.45| S ·   · | G   row j=0       the side branches are dead ends, so
//          +---+---+---+---+             every cell is reachable from S.
//            x=-0.45 ... x=+0.45  (i = 0..3, west to east)
//
// The outer boundary is inset 0.01 m so every wall lies inside the mat (four
// corner walls overlap their neighbours by 0.02x0.02 — static boxes, harmless).
// Robot start pose: the start cell's centre (-0.45, -0.45), heading 90
// (place.js: heading degrees from world +x toward +z) — north is the open
// corridor. The goal cell's floor is green so a colour sensor knows it arrived;
// the walls cover their own footprint with dark grey rgb (SPIKE 'black', the
// nearest representable id).
export const MAZE = Object.freeze({
    cell: 0.3, n: 4,                    // line(n) = -0.6 + 0.3*n, with -0.6 = -(4*0.3)/2
    thickness: 0.02, height: 0.04,
    startCell: [0, 0], goalCell: [3, 0],
    heading: 90
});

const mazeLine = n => Math.round((-0.6 + MAZE.cell * n) * 1e12) / 1e12;   // grid line n = 0..4, float-noise-free
const cellCentre = (i, j) => {
    const round = v => Math.round(v * 1e12) / 1e12;
    return [round(mazeLine(i) + MAZE.cell / 2), round(mazeLine(j) + MAZE.cell / 2)];
};

// Closed interior edges. wall-v-i-j sits on line(i)=x between cells (i-1,j)
// and (i,j); wall-h-i-j sits on line(j)=z between cells (i,j-1) and (i,j).
const mazeClosedV = [[1, 0], [2, 0], [2, 1], [2, 2]];
const mazeClosedH = [[0, 2], [0, 3], [3, 1], [3, 2], [3, 3]];

const mazeWallList = [];
for (const [i, j] of mazeClosedV) {
    mazeWallList.push({id: `wall-v-${i}-${j}`, size: [MAZE.thickness, MAZE.height, MAZE.cell], position: [mazeLine(i), 0, mazeLine(j) + MAZE.cell / 2]});
}
for (const [i, j] of mazeClosedH) {
    mazeWallList.push({id: `wall-h-${i}-${j}`, size: [MAZE.cell, MAZE.height, MAZE.thickness], position: [mazeLine(i) + MAZE.cell / 2, 0, mazeLine(j)]});
}
// The boundary: one wall per rim cell edge, inset 0.01 m inward on its outward
// side so the outer face is the mat edge (-0.6 / +0.6).
for (let i = 0; i < MAZE.n; i++) {
    mazeWallList.push({id: `wall-s-${i}`, size: [MAZE.cell, MAZE.height, MAZE.thickness], position: [mazeLine(i) + MAZE.cell / 2, 0, mazeLine(0) + MAZE.thickness / 2]});
    mazeWallList.push({id: `wall-n-${i}`, size: [MAZE.cell, MAZE.height, MAZE.thickness], position: [mazeLine(i) + MAZE.cell / 2, 0, mazeLine(MAZE.n) - MAZE.thickness / 2]});
}
for (let j = 0; j < MAZE.n; j++) {
    mazeWallList.push({id: `wall-w-${j}`, size: [MAZE.thickness, MAZE.height, MAZE.cell], position: [mazeLine(0) + MAZE.thickness / 2, 0, mazeLine(j) + MAZE.cell / 2]});
    mazeWallList.push({id: `wall-e-${j}`, size: [MAZE.thickness, MAZE.height, MAZE.cell], position: [mazeLine(MAZE.n) - MAZE.thickness / 2, 0, mazeLine(j) + MAZE.cell / 2]});
}

// The floor under a wall is covered by the wall body; below it stays white
// except the goal cell, which is green (colour id 6).
const mazeFloorColor = (x, z) => {
    if (x >= 0.3 && x <= 0.6 && z >= -0.6 && z <= -0.3) {
        return {color: 6, reflection: 50, rgb: [0, 200, 0]};    // goal cell, green
    }
    return {color: 10, reflection: 100, rgb: [1024, 1024, 1024]};
};

const maze = {
    id: 'maze',
    sizeM: [MAZE.n * MAZE.cell, MAZE.n * MAZE.cell],
    startPose: {x: cellCentre(...MAZE.startCell)[0], z: cellCentre(...MAZE.startCell)[1], heading: MAZE.heading},
    obstacles: mazeWallList.map(w => ({id: w.id, shape: 'box', size: w.size.slice(), position: w.position.slice(), color: 0})),
    colorAt(x, z) {
        const [w, d] = this.sizeM;
        if (Math.abs(x) > w / 2 || Math.abs(z) > d / 2) return {color: 10, reflection: 100, rgb: [1024, 1024, 1024]};
        // A wall's footprint paints the floor dark grey: the wall body stands there.
        for (const wseg of mazeWallList) {
            const [sx, , sz] = wseg.size;
            const [px, , pz] = wseg.position;
            if (x >= px - sx / 2 && x <= px + sx / 2 && z >= pz - sz / 2 && z <= pz + sz / 2) {
                return {color: 0, reflection: 5, rgb: [60, 60, 60]}; // dark grey, read as SPIKE black
            }
        }
        return mazeFloorColor(x, z);
    },
    paint(imageData, pxPerM) {
        for (let y = 0; y < imageData.height; y++) {
            for (let x = 0; x < imageData.width; x++) {
                const mx = (x - imageData.width / 2 + 0.5) / pxPerM;
                const mz = (y - imageData.height / 2 + 0.5) / pxPerM;
                const c = this.colorAt(mx, mz);
                const idx = (y * imageData.width + x) * 4;
                imageData.data[idx] = Math.round(c.rgb[0] / 4);
                imageData.data[idx + 1] = Math.round(c.rgb[1] / 4);
                imageData.data[idx + 2] = Math.round(c.rgb[2] / 4);
                imageData.data[idx + 3] = 255;
            }
        }
    }
};

// Warehouse: the plain floor with a pallet on it (world/objects.js, slice R4): a mat may carry
// LOADS — dynamic world bodies the model moves by contact — as it carries obstacles (the compile
// option `loads`). The pallet stands where the Forklift example's tines are when the model is
// placed on the start pose (x −0.2 m, heading +x; the anchor is its lift motor's shaft): centred
// between the tines (model x −20 LDU, 160 LDU ahead of the shaft: the tines hang on a cross beam
// in front of the guide axle), turned so its pockets run
// along the tines. test/bw-sim-forklift.test.mjs measures that the tines sit in the pockets.
export const WAREHOUSE = Object.freeze({start: Object.freeze({x: -0.2, z: 0, heading: 0}), pallet: Object.freeze([-0.136, 0, -0.016])});

const warehouse = {
    id: 'warehouse',
    sizeM: plain.sizeM,
    startPose: {...WAREHOUSE.start},
    loads: [palletLoad({id: 'pallet', position: WAREHOUSE.pallet.slice(), yawDeg: 90})],
    colorAt: plain.colorAt,
    paint: plain.paint
};

export const createMat = id => {
    const mat = {plain, 'line-oval': lineOval, 'colour-zones': colourZones, wall, sumo, maze, warehouse}[id];
    if (!mat) throw new Error(`unknown mat '${id}'`);
    return {
        id: mat.id,
        sizeM: mat.sizeM.slice(),
        colorAt: mat.colorAt.bind(mat),
        paint: mat.paint.bind(mat),
        startPose: mat.startPose ? {...mat.startPose} : undefined,
        centreLineLengthM: mat.centreLineLengthM,
        obstacles: (mat.obstacles || []).map(o => ({...o, size: o.size.slice(), position: o.position.slice()})),
        loads: (mat.loads || []).map(l => ({...l, position: l.position.slice(), boxes: l.boxes.map(b => ({...b, size: b.size.slice(), offset: (b.offset || [0, 0, 0]).slice()}))}))
    };
};
