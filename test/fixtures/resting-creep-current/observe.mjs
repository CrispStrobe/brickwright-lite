// SPDX-License-Identifier: BSD-3-Clause
// Current engine identity; all original input/physics/summary code stays frozen.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {currentEngineIdentity} from '../../../scripts/lib/sim-engine-admission.mjs';
import {manifest} from '../resting-creep-1435/observe.mjs';
export {manifest, sha256, prepareInputs, buildCase, isolateFrame, runCase} from '../resting-creep-1435/observe.mjs';
const repo = new URL('../../../', import.meta.url);
export function sourceIdentities() {
    const file = name => ({file: name, sha256: createHash('sha256').update(readFileSync(new URL(name, repo))).digest('hex')});
    return {core: file(manifest.historicalSources.core.file), catalogue: file(manifest.historicalSources.catalogue.file), engine: currentEngineIdentity()};
}
