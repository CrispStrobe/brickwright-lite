// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Copyright (c) 2026 CrispStrobe
// Test-only math. Retain robust length for exceptional magnitudes and values.
export function length3(x, y, z) {
    const squared = x * x + y * y + z * z;
    return squared >= 1e-200 && squared <= 1e200 ? Math.sqrt(squared) : Math.hypot(x, y, z);
}
const sumWinding = (T, p, length) => {
    let sum = 0;
    for (let i = 0; i < T.length; i += 9) {
        const ax = T[i] - p[0], ay = T[i + 1] - p[1], az = T[i + 2] - p[2];
        const bx = T[i + 3] - p[0], by = T[i + 4] - p[1], bz = T[i + 5] - p[2];
        const cx = T[i + 6] - p[0], cy = T[i + 7] - p[1], cz = T[i + 8] - p[2];
        const la = length(ax, ay, az), lb = length(bx, by, bz), lc = length(cx, cy, cz);
        const det = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
        const den = la * lb * lc + (ax * bx + ay * by + az * bz) * lc + (bx * cx + by * cy + bz * cz) * la + (cx * ax + cy * ay + cz * az) * lb;
        sum += 2 * Math.atan2(det, den);
    }
    return sum / (4 * Math.PI);
};
/** Exact triangle roster and summation order; the membership cutoff stays 0.5. */
export function windingNumber(T, p) {
    const winding = sumWinding(T, p, length3);
    // Near the decision boundary, reproduce the original robust computation.
    // This numerical fallback changes neither the cutoff nor the geometry skin.
    return Math.abs(winding - 0.5) < 1e-7 ? sumWinding(T, p, Math.hypot) : winding;
}
