import paper from '@scratch/paper';

/** Regular polygons and radially symmetric stars fitted inside the drag box.
 * A single scale preserves equal polygon edges/angles, even for a wide or tall drag.
 * Centre the resulting bounds so odd-sided shapes do not drift within the box.
 */

// Straight up. paper's y axis points down, so this is negative.
const START_ANGLE = -Math.PI / 2;

const fitPoints = (rect, points) => {
    const xs = points.map(point => point[0]);
    const ys = points.map(point => point[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const scale = Math.min(Math.abs(rect.width) / (maxX - minX), Math.abs(rect.height) / (maxY - minY));
    const x = rect.center.x - ((minX + maxX) / 2 * scale);
    const y = rect.center.y - ((minY + maxY) / 2 * scale);
    return points.map(point => new paper.Point(x + point[0] * scale, y + point[1] * scale));
};

/**
 * A regular polygon inscribed in the given rectangle, first vertex pointing up.
 * @param {!paper.Rectangle} rect Box to fill.
 * @param {!number} sides Number of sides, 3 or more.
 * @return {!paper.Path} The closed path.
 */
const makePolygon = function (rect, sides) {
    const count = Number.isFinite(Number(sides)) ? Math.max(3, Math.round(sides)) : 3;
    const path = new paper.Path();
    const points = Array.from({length: count}, (_, i) => {
        const angle = START_ANGLE + (i * 2 * Math.PI / count);
        return [Math.cos(angle), Math.sin(angle)];
    });
    for (const point of fitPoints(rect, points)) path.add(point);
    path.closed = true;
    // Let the objects tree name it outright instead of inferring it back out of the segments.
    path.data.bwKind = `Polygon (${count} sides)`;
    return path;
};

/**
 * A star inscribed in the given rectangle, first point up.
 * @param {!paper.Rectangle} rect Box to fill.
 * @param {!number} points Number of points, 3 or more.
 * @param {!number} innerRatio Inner radius as a fraction of the outer, between 0 and 1.
 * @return {!paper.Path} The closed path.
 */
const makeStar = function (rect, points, innerRatio) {
    const count = Number.isFinite(Number(points)) ? Math.max(3, Math.round(points)) : 3;
    const inner = Math.min(0.95, Math.max(0.05, innerRatio));
    const path = new paper.Path();
    // Alternate outer and inner vertices, so a full turn takes 2 * count steps.
    const vertices = Array.from({length: count * 2}, (_, i) => {
        const angle = START_ANGLE + (i * Math.PI / count);
        const radius = i % 2 === 0 ? 1 : inner;
        return [Math.cos(angle) * radius, Math.sin(angle) * radius];
    });
    for (const point of fitPoints(rect, vertices)) path.add(point);
    path.closed = true;
    // Let the objects tree name it outright instead of inferring it back out of the segments.
    path.data.bwKind = `Star (${count} points)`;
    return path;
};

export {
    makePolygon,
    makeStar
};
