// SPDX-License-Identifier: BSD-3-Clause
// Place monospace labels without covering readings anchored to the same assembly.
export const placeMeasurementLabel = (anchor, text, width, height, occupied) => {
    const w = Math.min(width - 4, text.length * 8 + 8);
    const x = Math.max(2, Math.min(width - w - 2, anchor[0] + 6));
    let y = Math.max(14, Math.min(height - 4, anchor[1] - 8));
    for (let i = 0; i <= occupied.length; i++) {
        const hits = occupied.filter(b => x < b.x + b.w && x + w > b.x && y - 14 < b.y + b.h && y + 2 > b.y);
        if (!hits.length) break;
        y = Math.max(...hits.map(b => b.y + b.h)) + 16;
    }
    occupied.push({x, y: y - 14, w, h: 16});
    return [x, y];
};
