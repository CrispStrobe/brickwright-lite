// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Floor mats for the Sim Lab (E1, data half). Procedurally drawn, no scraped art.

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
    {id: 'wall', title: {en: 'Wall', de: 'Wand'}}
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

export const createMat = id => {
    const mat = {plain, 'line-oval': lineOval, 'colour-zones': colourZones, wall}[id];
    if (!mat) throw new Error(`unknown mat '${id}'`);
    return {
        id: mat.id,
        sizeM: mat.sizeM.slice(),
        colorAt: mat.colorAt.bind(mat),
        paint: mat.paint.bind(mat),
        startPose: mat.startPose ? {...mat.startPose} : undefined,
        centreLineLengthM: mat.centreLineLengthM,
        obstacles: (mat.obstacles || []).map(o => ({...o, size: o.size.slice(), position: o.position.slice()}))
    };
};
