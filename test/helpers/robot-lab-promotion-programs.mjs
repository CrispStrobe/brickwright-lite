// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {runTipline} from './promotion-tipline.mjs';
import {runTwistspan} from './promotion-twistspan.mjs';
import {runSwayShift} from './promotion-swayshift.mjs';

export const isBatchEPromotion = id => ['tipline', 'twistspan', 'swayshift'].includes(id);
export async function runBatchEPromotion(contract, modelText, autoPorts, overrides = {}) {
    const options = {...contract, modelText, autoPorts,
        // SwayShift's frozen observer requires at least 40 samples per period;
        // its 0.757 s pendulum cannot be qualified from 20 ms observations.
        frameMs: autoPorts === false ? contract.secondFrameMs : contract.frameMs, ...overrides};
    let result;
    if (contract.id === 'tipline') result = await runTipline(overrides.variant || 'tipline', options);
    else if (contract.id === 'twistspan') result = await runTwistspan(overrides.variant || 'twistspan', options);
    else if (contract.id === 'swayshift') result = await runSwayShift(overrides.mode || 'tuned', options);
    else throw new Error('Unknown independently reviewed promotion');
    assert.deepEqual(result.provenance.compilerErrors, []);
    assert.deepEqual(result.provenance.compilerWarnings, []);
    assert.deepEqual(result.vmErrors, []);
    assert.equal(result.setup.explicitHubIdentity, true);
    assert.deepEqual(result.setup.frozenBodies, []);
    assert.deepEqual(result.setup.missingOpcodes, []);
    for (const frame of result.track) {
        assert.equal(frame.extra.sessionFailed, null);
        // The supplied observers record this actual hub controller mode.
        frame.extra.modes = [frame.extra.controllerMode];
        frame.extra.actuators = {driver: 'hub'};
    }
    return result;
}
