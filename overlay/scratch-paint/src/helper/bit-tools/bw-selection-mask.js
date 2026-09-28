// Selection masks use art-board pixel coordinates, including transparent pixels in the source.
const colourMatches = (data, index, seed, tolerance) => {
    const alpha = data[(index * 4) + 3];
    const seedAlpha = data[(seed * 4) + 3];
    if (!alpha || !seedAlpha) return alpha === seedAlpha;
    for (let channel = 0; channel < 4; channel++) {
        if (Math.abs(data[(index * 4) + channel] - data[(seed * 4) + channel]) > tolerance) return false;
    }
    return true;
};

const wandMask = (data, width, height, startX, startY, tolerance = 0) => {
    if (startX < 0 || startY < 0 || startX >= width || startY >= height) return null;
    const seed = (startY * width) + startX;
    const mask = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    let head = 0;
    let tail = 0;
    mask[seed] = 1;
    queue[tail++] = seed;
    while (head < tail) {
        const index = queue[head++];
        const x = index % width;
        const y = Math.floor(index / width);
        const neighbours = [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1,
            y > 0 ? index - width : -1, y + 1 < height ? index + width : -1];
        for (const next of neighbours) {
            if (next < 0 || mask[next] || !colourMatches(data, next, seed, tolerance)) continue;
            mask[next] = 1;
            queue[tail++] = next;
        }
    }
    return mask;
};

const lassoMask = (points, width, height) => {
    if (!points.length) return null;
    const mask = new Uint8Array(width * height);
    const mark = (x, y) => {
        if (x >= 0 && x < width && y >= 0 && y < height) mask[(y * width) + x] = 1;
    };
    for (let i = 0; i < points.length; i++) {
        const [ax, ay] = points[i];
        const [bx, by] = points[(i + 1) % points.length];
        let x = ax;
        let y = ay;
        const dx = Math.abs(bx - ax);
        const dy = -Math.abs(by - ay);
        const sx = ax < bx ? 1 : -1;
        const sy = ay < by ? 1 : -1;
        let error = dx + dy;
        while (true) {
            mark(x, y);
            if (x === bx && y === by) break;
            const doubled = error * 2;
            if (doubled >= dy) { error += dy; x += sx; }
            if (doubled <= dx) { error += dx; y += sy; }
        }
    }
    if (points.length < 3) return mask;
    let minY = height;
    let maxY = -1;
    for (const [, y] of points) {
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
    }
    minY = Math.max(0, minY);
    maxY = Math.min(height - 1, maxY);
    for (let y = minY; y <= maxY; y++) {
        const crossings = [];
        for (let i = 0; i < points.length; i++) {
            const [ax, ay] = points[i];
            const [bx, by] = points[(i + 1) % points.length];
            if ((ay <= y + 0.5 && by > y + 0.5) || (by <= y + 0.5 && ay > y + 0.5)) {
                crossings.push(ax + ((y + 0.5 - ay) * (bx - ax) / (by - ay)));
            }
        }
        crossings.sort((a, b) => a - b);
        for (let i = 0; i + 1 < crossings.length; i += 2) {
            for (let x = Math.max(0, Math.ceil(crossings[i] - 0.5));
                x <= Math.min(width - 1, Math.floor(crossings[i + 1] - 0.5)); x++) mark(x, y);
        }
    }
    return mask;
};

const opaqueBounds = (mask, data, width, height) => {
    let left = width;
    let top = height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = (y * width) + x;
            if (!mask[index] || !data[(index * 4) + 3]) continue;
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
        }
    }
    return right < left ? null : {x: left, y: top, width: right - left + 1, height: bottom - top + 1};
};

export {lassoMask, opaqueBounds, wandMask};
