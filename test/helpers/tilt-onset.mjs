// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/** Read-only detector for the first completed-step tower/table tilt crossing.
 * Angles use the validation's original quaternion rotation, without normalization.
 * The caller must finish each already-started poll/hold and retain its late sample.
 */
const DEG = 180 / Math.PI;
const angle = q => {
    if (!Array.isArray(q) || q.length !== 4 || !q.every(Number.isFinite) || !q.some(v => v !== 0)) {
        throw new Error('missing or nonfinite tilt quaternion');
    }
    const [x, y, z, w] = q;
    // Original qrot(q, [0, 1, 0]) operation order; do not normalize q.
    const ix = w * 0 + y * 0 - z * 1;
    const iy = w * 1 + z * 0 - x * 0;
    const iz = w * 0 + x * 1 - y * 0;
    const iw = -x * 0 - y * 1 - z * 0;
    const upY = iy * w - iw * y - iz * x + ix * z;
    const upZ = iz * w - iw * z - ix * y + iy * x;
    if (!Number.isFinite(upY) || !Number.isFinite(upZ) || (upY === 0 && upZ === 0)) {
        throw new Error('undefined tilt up vector');
    }
    return Math.atan2(upZ, upY) * DEG;
};
const wrapDegrees = a => Math.atan2(Math.sin(a / DEG), Math.cos(a / DEG)) * DEG;
export const createTiltOnset = ({tableRotation, towerRotation}) => {
    const b0 = angle(tableRotation), t0 = angle(towerRotation);
    if (Math.abs(wrapDegrees(t0 - b0)) > 5) throw new Error('tower is pre-tipped at initialization');
    let armed = false, first = null, last = null, samples = 0;
    return Object.freeze({
        arm() {
            if (armed || !last || last.phase !== 'settle') throw new Error('missing completed settle observation');
            armed = true;
        },
        observe({tableRotation: table, towerRotation: tower, step, timeSeconds, phase, command = null}) {
            if (!Number.isInteger(step) || step !== samples + 1 || !Number.isFinite(timeSeconds) ||
                timeSeconds <= (last?.timeSeconds ?? 0) || !['settle', 'poll', 'hold'].includes(phase) ||
                (armed ? phase === 'settle' || !Number.isInteger(command) || command < 0 : phase !== 'settle')) {
                throw new Error('missing or out-of-order completed-step tilt observation');
            }
            const tableDegrees = angle(table) - b0;
            const towerDegrees = wrapDegrees(angle(tower) - t0);
            const relativeDegrees = towerDegrees - tableDegrees;
            const tipped = Math.abs(towerDegrees - tableDegrees) > 5;
            if (!armed && tipped) throw new Error('tower is pre-tipped during settle');
            last = Object.freeze({step, timeSeconds, phase, command, tableDegrees, towerDegrees, relativeDegrees, tipped});
            samples++;
            if (armed && tipped && first === null) first = last;
            return last;
        },
        first() { return first; },
        result() {
            if (!armed || !first) throw new Error('missing completed-step tilt crossing');
            return Object.freeze({first, last, samples});
        }
    });
};
