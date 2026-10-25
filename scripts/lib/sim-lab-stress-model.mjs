// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// A big Robot Lab model for the scale checks (scripts/verify-sim-lab-browser.mjs
// --part=scale, scripts/measure-sim-lab-scale.mjs, test/bw-sim-instancing.test.mjs):
// the reference driving base plus `tiles` grid tiles beside it. A tile is two
// crossed layers of 15-hole beams (15 along z, 15 along x on top) with a
// friction pin through every crossing: 30 beams and 225 pins, one rigid body.
// Eight tiles and the driving base are 2,055 parts.

/** Parts in one tile. */
export const TILE_PARTS = 15 * 2 + 15 * 15;

const BEAM = '32278.dat'; // Technic beam 15: length along local z, holes along local y
const PIN = '2780.dat'; // friction pin: axis along local x
const ALONG_Z = '1 0 0 0 1 0 0 0 1';
const ALONG_X = '0 0 1 0 1 0 -1 0 0'; // 90° about y
const PIN_UP = '0 -1 0 1 0 0 0 0 1'; // the pin's x axis to world y
const COLOURS = [71, 72, 0, 4, 1, 14, 25, 15];

/**
 * @param {string} drivingBase the driving base's LDraw text (static/sim-lab/models/driving-base.ldr)
 * @param {{tiles?: number}} [options]
 * @returns {string} LDraw text
 */
export const stressModel = (drivingBase, {tiles = 8} = {}) => {
    const lines = drivingBase.replace(/\r?\n$/, '').split(/\r?\n/)
        .map(l => (/^0 Name:/.test(l) ? '0 Name: stress-model.ldr' : l));
    lines[0] = `0 Robot Lab scale model: the driving base and ${tiles} beam-and-pin grid tiles`;
    const pitch = 20;
    const span = 14 * pitch; // a beam 15 is 14 pitches from end hole to end hole
    for (let t = 0; t < tiles; t++) {
        // Two rows of tiles behind the robot (+z), side by side along x, on the floor.
        const ox = (t % 4 - 1.5) * (span + 60);
        const oz = 400 + Math.floor(t / 4) * (span + 60);
        const colour = COLOURS[t % COLOURS.length];
        // The lower layer's centre: its bottom face at y = 80, the driving base's lowest point
        // (wheels and castor ball); LDraw y grows downward and a beam is 20 LDU thick.
        const lower = 70;
        const upper = lower - 20;
        for (let i = 0; i < 15; i++) {
            const x = ox + (i - 7) * pitch;
            lines.push(`1 ${colour} ${x} ${lower} ${oz} ${ALONG_Z} ${BEAM}`);
        }
        for (let k = 0; k < 15; k++) {
            const z = oz + (k - 7) * pitch;
            lines.push(`1 ${colour} ${ox} ${upper} ${z} ${ALONG_X} ${BEAM}`);
        }
        for (let i = 0; i < 15; i++) {
            for (let k = 0; k < 15; k++) {
                lines.push(`1 0 ${ox + (i - 7) * pitch} ${lower - 10} ${oz + (k - 7) * pitch} ${PIN_UP} ${PIN}`);
            }
        }
    }
    return `${lines.join('\r\n')}\r\n`;
};
