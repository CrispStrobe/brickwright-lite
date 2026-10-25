// SPDX-License-Identifier: BSD-3-Clause
// Loads a unit of arena challenges from the app's own static folder
// (static/spike-arena/<unit>/): unit.json, one JSON per challenge, and the
// reference solution as a DEVICE SPIKE .bw file. Same-origin only; every
// challenge is validated before it is offered. static/spike-arena/units.json
// lists the units, in the order the pane offers them.

import {assertValidWorld} from './arena-world.js';

export const ARENA_BASE = 'static/spike-arena/';
export const DEFAULT_UNIT = 'rover-basics';

const get = async (fetchImpl, url, as) => {
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return as === 'json' ? response.json() : response.text();
};

/**
 * Every unit, in order, with its title and intro (not its challenges: a unit
 * is loaded when it is opened).
 * @returns {Promise<Array<{id: string, title: object, intro: object, count: number}>>}
 */
export const loadUnitIndex = async ({fetchImpl = globalThis.fetch, base = ARENA_BASE} = {}) => {
    const index = await get(fetchImpl, `${base}units.json`, 'json');
    return Promise.all(index.units.map(async id => {
        const unit = await get(fetchImpl, `${base}${id}/unit.json`, 'json');
        if (unit.id !== id) throw new Error(`${base}${id}/unit.json: id is ${unit.id}`);
        return {id, title: unit.title, intro: unit.intro, count: unit.challenges.length};
    }));
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
