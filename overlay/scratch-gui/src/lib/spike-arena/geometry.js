// SPDX-License-Identifier: BSD-3-Clause
// 2D geometry for the SPIKE arena. Pure functions, no DOM.
//
// Coordinates are centimetres on the mat, x to the right and y DOWN (the
// canvas convention), so a heading that increases turns clockwise as seen from
// above, which is the sign SPIKE's yaw and Pybricks' heading both use.
// Headings are degrees; 0 faces +x.
//
// Shapes (the world format, docs/SPIKE-ARENA.md):
//   {type: 'rect', x, y, w, h, angle?}  centre (x, y), size w by h, rotated angle degrees
//   {type: 'circle', x, y, r}
//   {type: 'polygon', points: [[x, y], ...]}   convex for anything solid
//   {type: 'line', points: [[x, y], ...], width}   a stroked polyline

export const DEG = Math.PI / 180;

export const wrap180 = degrees => {
    const wrapped = ((degrees + 180) % 360 + 360) % 360 - 180;
    return wrapped === -180 ? 180 : wrapped;
};

/** A point in the robot's frame (x forward, y to its right) to the mat. */
export const toWorld = (pose, [lx, ly]) => {
    const c = Math.cos(pose.heading * DEG);
    const s = Math.sin(pose.heading * DEG);
    return [pose.x + lx * c - ly * s, pose.y + lx * s + ly * c];
};

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];

export const rectPolygon = ({x, y, w, h, angle = 0}) => {
    const pose = {x, y, heading: angle};
    return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(p => toWorld(pose, p));
};

/** A stroked segment as a rectangle polygon. */
const segmentPolygon = (a, b, width) => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-9;
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]) / DEG;
    return rectPolygon({x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, w: length + width, h: width, angle});
};

/**
 * A shape as convex pieces: {poly: [[x,y]...]} or {circle: {x, y, r}}.
 * A stroked line becomes one rectangle per segment.
 */
export const convexPieces = shape => {
    switch (shape.type) {
    case 'rect': return [{poly: rectPolygon(shape)}];
    case 'circle': return [{circle: {x: shape.x, y: shape.y, r: shape.r}}];
    case 'polygon': return [{poly: shape.points.map(p => [p[0], p[1]])}];
    case 'line': {
        const pieces = [];
        for (let i = 1; i < shape.points.length; i++) {
            pieces.push({poly: segmentPolygon(shape.points[i - 1], shape.points[i], shape.width || 1)});
        }
        return pieces;
    }
    default: throw new TypeError(`unknown arena shape type: ${shape.type}`);
    }
};

export const pointInPolygon = ([px, py], poly) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i];
        const [xj, yj] = poly[j];
        if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
};

export const distanceToSegment = (p, a, b) => {
    const ab = sub(b, a);
    const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1e-12)));
    return Math.hypot(p[0] - (a[0] + ab[0] * t), p[1] - (a[1] + ab[1] * t));
};

/** Distance from a point to a line polyline's centre line. */
export const distanceToPolyline = (p, points) => {
    let best = Infinity;
    for (let i = 1; i < points.length; i++) best = Math.min(best, distanceToSegment(p, points[i - 1], points[i]));
    return best;
};

export const pointInShape = (p, shape) => {
    switch (shape.type) {
    case 'circle': return Math.hypot(p[0] - shape.x, p[1] - shape.y) <= shape.r;
    case 'line': return distanceToPolyline(p, shape.points) <= (shape.width || 1) / 2;
    case 'rect': return pointInPolygon(p, rectPolygon(shape));
    case 'polygon': return pointInPolygon(p, shape.points);
    default: return false;
    }
};

/** Distance from a point to a convex piece (0 inside). */
const distanceToPiece = (p, piece) => {
    if (piece.circle) return Math.max(0, Math.hypot(p[0] - piece.circle.x, p[1] - piece.circle.y) - piece.circle.r);
    if (pointInPolygon(p, piece.poly)) return 0;
    let best = Infinity;
    for (let i = 0; i < piece.poly.length; i++) {
        best = Math.min(best, distanceToSegment(p, piece.poly[i], piece.poly[(i + 1) % piece.poly.length]));
    }
    return best;
};

export const distanceToPieces = (p, pieces) => pieces.reduce((best, piece) => Math.min(best, distanceToPiece(p, piece)), Infinity);

// ---- overlap (separating axis) ---------------------------------------------

const project = (poly, axis) => {
    let min = Infinity;
    let max = -Infinity;
    for (const p of poly) { const d = dot(p, axis); if (d < min) min = d; if (d > max) max = d; }
    return [min, max];
};

const axesOf = poly => poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const edge = sub(q, p);
    const length = Math.hypot(edge[0], edge[1]) || 1;
    return [-edge[1] / length, edge[0] / length];
});

const polygonsOverlap = (a, b, margin = 0) => {
    for (const axis of [...axesOf(a), ...axesOf(b)]) {
        const [minA, maxA] = project(a, axis);
        const [minB, maxB] = project(b, axis);
        if (maxA + margin <= minB || maxB + margin <= minA) return false;
    }
    return true;
};

const polygonCircleOverlap = (poly, {x, y, r}, margin = 0) =>
    distanceToPiece([x, y], {poly}) < r + margin;

/** Do a convex polygon and a convex piece overlap (touching counts only with a positive margin)? */
export const polygonOverlapsPiece = (poly, piece, margin = 0) => (piece.circle ?
    polygonCircleOverlap(poly, piece.circle, margin) : polygonsOverlap(poly, piece.poly, margin));

export const polygonOverlapsPieces = (poly, pieces, margin = 0) => pieces.some(piece => polygonOverlapsPiece(poly, piece, margin));

// ---- rays -------------------------------------------------------------------

const raySegment = (origin, direction, a, b) => {
    const edge = sub(b, a);
    const denominator = cross(direction, edge);
    if (Math.abs(denominator) < 1e-12) return Infinity;
    const offset = sub(a, origin);
    const t = cross(offset, edge) / denominator;
    const u = cross(offset, direction) / denominator;
    return t >= 0 && u >= 0 && u <= 1 ? t : Infinity;
};

const rayCircle = (origin, direction, {x, y, r}) => {
    const offset = [origin[0] - x, origin[1] - y];
    const b = dot(offset, direction);
    const c = dot(offset, offset) - r * r;
    const disc = b * b - c;
    if (disc < 0) return Infinity;
    const root = Math.sqrt(disc);
    const t0 = -b - root;
    const t1 = -b + root;
    if (t0 >= 0) return t0;
    return t1 >= 0 ? 0 : Infinity;
};

/** Distance along a unit ray to the first convex piece it meets (0 if it starts inside one). */
export const rayToPieces = (origin, direction, pieces) => {
    let best = Infinity;
    for (const piece of pieces) {
        if (piece.circle) { best = Math.min(best, rayCircle(origin, direction, piece.circle)); continue; }
        if (pointInPolygon(origin, piece.poly)) return 0;
        for (let i = 0; i < piece.poly.length; i++) {
            best = Math.min(best, raySegment(origin, direction, piece.poly[i], piece.poly[(i + 1) % piece.poly.length]));
        }
    }
    return best;
};

export const translatePieces = (pieces, dx, dy) => pieces.map(piece => (piece.circle ?
    {circle: {...piece.circle, x: piece.circle.x + dx, y: piece.circle.y + dy}} :
    {poly: piece.poly.map(([x, y]) => [x + dx, y + dy])}));

/** The centroid of a shape, for "is the object in the zone". */
export const shapeCentre = shape => {
    if (shape.type === 'circle' || shape.type === 'rect') return [shape.x, shape.y];
    const points = shape.points;
    return [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];
};

export const translateShape = (shape, dx, dy) => {
    if (shape.type === 'circle' || shape.type === 'rect') return {...shape, x: shape.x + dx, y: shape.y + dy};
    return {...shape, points: shape.points.map(([x, y]) => [x + dx, y + dy])};
};
