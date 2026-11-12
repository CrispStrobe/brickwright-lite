// SPDX-License-Identifier: BSD-3-Clause
// Each real VM/Jolt case runs outside this parent event loop under a180s kill deadline.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runBoundedPhysicsChild} from './helpers/bounded-physics-child.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
for(const coldMs of [0,1000])test(`actual repaired Door authored programme cold${coldMs}`,{timeout:181000},async t=>{
    // The extra second belongs only to parent receipt sealing/reaping. The
    // physics child deadline remains exactly180000ms, independently enforced.
    const receipt=await runBoundedPhysicsChild({cwd:ROOT,timeoutMs:180000,signal:t.signal,
        args:['--import',path.join(ROOT,'scripts/lib/register-gui-scope.mjs'),
            path.join(ROOT,'test/helpers/paired-door-program-child.mjs'),String(coldMs),fileURLToPath(import.meta.url)],
        logDir:path.join(ROOT,'test-results/paired-door',`launcher-cold${coldMs}`),
        evidenceDir:path.join(ROOT,'test-results/paired-door',`cold${coldMs}`)});
    // The final argv is the actual consumer test identity used by the unchanged
    // GUI-scope hook; the child helper is not relabeled as an unrelated test.
    assert.equal(receipt.reason,null,'no deadline/abort/output-cap failure');
    assert.equal(receipt.spawnError,null);assert.equal(receipt.signal,null);assert.equal(receipt.code,0,'actual child programme outcome');
});
