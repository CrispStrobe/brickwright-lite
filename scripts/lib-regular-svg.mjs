// Independent reader for straight-edged SVG output. No Paper/editor imports.
import assert from 'node:assert/strict';

export const readLinearSvgPath = (data, matrix = [1, 0, 0, 1, 0, 0]) => {
    const pattern = /[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi;
    const tokens = data.match(pattern) || [];
    assert.equal(tokens.join(''), data.replace(/[\s,]/g, ''), 'unsupported SVG path token');
    const points = [];
    let i = 0, command = '', x = 0, y = 0, closed = false;
    const number = () => {
        assert.ok(i < tokens.length && Number.isFinite(Number(tokens[i])), 'missing SVG coordinate');
        return Number(tokens[i++]);
    };
    while (i < tokens.length) {
        if (/^[a-z]$/i.test(tokens[i])) command = tokens[i++];
        const op = command.toUpperCase();
        assert.ok(['M', 'L', 'H', 'V', 'Z'].includes(op), `unsupported SVG command ${command}`);
        if (op === 'Z') { closed = true; assert.equal(i, tokens.length, 'multiple SVG subpaths'); break; }
        const relative = command !== op;
        if (op === 'M' || op === 'L') {
            const dx = number(), dy = number();
            x = relative ? x + dx : dx; y = relative ? y + dy : dy;
            if (op === 'M') {
                assert.equal(points.length, 0, 'multiple SVG subpaths');
                command = relative ? 'l' : 'L';
            }
        } else if (op === 'H') {
            const dx = number(); x = relative ? x + dx : dx;
        } else {
            const dy = number(); y = relative ? y + dy : dy;
        }
        points.push([x, y]);
    }
    assert.ok(closed, 'shape must be closed');
    if (points.length > 1 && Math.hypot(points.at(-1)[0] - points[0][0], points.at(-1)[1] - points[0][1]) < 1e-8) points.pop();
    const [a, b, c, d, e, f] = matrix;
    assert.ok(matrix.length === 6 && matrix.every(Number.isFinite), 'finite SVG transform required');
    return points.map(([px, py]) => [a * px + c * py + e, b * px + d * py + f]);
};

export const assertRadialShape = (points, count, star = false) => {
    assert.equal(points.length, count * (star ? 2 : 1), 'exported vertex count');
    const center = [0, 1].map(axis => points.reduce((sum, p) => sum + p[axis], 0) / points.length);
    const radii = points.map(p => Math.hypot(p[0] - center[0], p[1] - center[1]));
    const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= Math.max(1e-4, Math.abs(expected) * 1e-3), label);
    assert.ok(Math.min(...radii) > 0, 'nondegenerate exported shape');
    for (let i = 0; i < points.length; i++) {
        near(radii[i], radii[star ? i % 2 : 0], 'uniform exported radius');
        const next = points[(i + 1) % points.length];
        const dot = ((points[i][0] - center[0]) * (next[0] - center[0]) +
            (points[i][1] - center[1]) * (next[1] - center[1])) / (radii[i] * radii[(i + 1) % points.length]);
        near(dot, Math.cos(2 * Math.PI / points.length), 'equal exported angular spacing');
        if (!star) near(Math.hypot(next[0] - points[i][0], next[1] - points[i][1]),
            Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]), 'equal exported edges');
    }
    if (star) assert.ok(radii[0] > radii[1], 'alternating star radii');
};
