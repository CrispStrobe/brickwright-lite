import paper from '@scratch/paper';

/**
 * Brickwright: geometry for the parametric shape tools (polygon and star).
 *
 * Both are built by hand rather than with paper.Path.RegularPolygon / paper.Path.Star, for two
 * reasons: those take a single radius, so they can only ever draw a shape that fits a SQUARE,
 * and they choose their own starting angle. Inscribing into the dragged rectangle instead makes
 * the tools behave like the rect and oval tools next to them — drag a box, get a shape that
 * fills it — and fixing the start angle at straight up keeps a triangle pointing where people
 * expect it to.
 */

// Straight up. paper's y axis points down, so this is negative.
const START_ANGLE = -Math.PI / 2;

/**
 * @param {!paper.Rectangle} rect Box to inscribe the shape in.
 * @param {!number} angle Angle in radians.
 * @param {!number} scale Fraction of the full radius (1 for outer points).
 * @return {!paper.Point} The point on the inscribed ellipse at that angle.
 */
const pointOn = function (rect, angle, scale) {
    return new paper.Point(
        rect.center.x + (rect.width / 2 * scale * Math.cos(angle)),
        rect.center.y + (rect.height / 2 * scale * Math.sin(angle))
    );
};

/**
 * A regular polygon inscribed in the given rectangle, first vertex pointing up.
 * @param {!paper.Rectangle} rect Box to fill.
 * @param {!number} sides Number of sides, 3 or more.
 * @return {!paper.Path} The closed path.
 */
const makePolygon = function (rect, sides) {
    const count = Math.max(3, Math.round(sides));
    const path = new paper.Path();
    for (let i = 0; i < count; i++) {
        path.add(pointOn(rect, START_ANGLE + (i * 2 * Math.PI / count), 1));
    }
    path.closed = true;
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
    const count = Math.max(3, Math.round(points));
    const inner = Math.min(0.95, Math.max(0.05, innerRatio));
    const path = new paper.Path();
    // Alternate outer and inner vertices, so a full turn takes 2 * count steps.
    for (let i = 0; i < count * 2; i++) {
        path.add(pointOn(rect, START_ANGLE + (i * Math.PI / count), i % 2 === 0 ? 1 : inner));
    }
    path.closed = true;
    return path;
};

export {
    makePolygon,
    makeStar
};
