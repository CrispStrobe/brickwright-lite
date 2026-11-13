// SPDX-License-Identifier: BSD-3-Clause
// Current-engine identity admission plus the unchanged independent row reader.
// No engine or observer imports; old readers remain available byte-for-byte.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {currentEngineIdentity} from './lib/sim-engine-admission.mjs';
import {manifest, auditAll, extractRecords} from './verify-sim-resting-creep.mjs';
export {manifest, auditRecord, auditAll, recompute, extractRecords, PREFIX} from './verify-sim-resting-creep.mjs';
const repo = new URL('../', import.meta.url);
export function expectedIdentities() {
    const file = name => ({file: name, sha256: createHash('sha256').update(readFileSync(new URL(name, repo))).digest('hex')});
    return {identities: {core: file(manifest.historicalSources.core.file), catalogue: file(manifest.historicalSources.catalogue.file), engine: currentEngineIdentity()}};
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    console.log(JSON.stringify({audit: 'PASS (data integrity only)', cases: auditAll(extractRecords(readFileSync(process.argv[2], 'utf8')), expectedIdentities())}, null, 1));
}
