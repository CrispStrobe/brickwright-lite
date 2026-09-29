// SPDX-License-Identifier: BSD-3-Clause
// Loads a unit of arena challenges from the app's own static folder
// (static/spike-arena/<unit>/): unit.json, one JSON per challenge, and the
// reference solution as a DEVICE SPIKE .bw file. Same-origin only; every
// challenge is validated before it is offered.

import {assertValidWorld} from './arena-world.js';

export const ARENA_BASE = 'static/spike-arena/';
export const DEFAULT_UNIT = 'rover-basics';

const get = async (fetchImpl, url, as) => {
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return as === 'json' ? response.json() : response.text();
};

/** @returns {Promise<{unit: object, challenges: object[]}>} */
export const loadUnit = async (unitId = DEFAULT_UNIT, {fetchImpl = globalThis.fetch, base = ARENA_BASE} = {}) => {
    const folder = `${base}${unitId}/`;
    const unit = await get(fetchImpl, `${folder}unit.json`, 'json');
    const challenges = await Promise.all(unit.challenges.map(async id =>
        assertValidWorld(await get(fetchImpl, `${folder}${id}.json`, 'json'))));
    return {unit, challenges, folder};
};

/** The reference solution's source text. */
export const loadSolution = (folder, world, {fetchImpl = globalThis.fetch} = {}) =>
    get(fetchImpl, `${folder}${world.solution}`, 'text');
