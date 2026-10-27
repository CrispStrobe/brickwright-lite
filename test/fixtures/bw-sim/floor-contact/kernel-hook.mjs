// SPDX-License-Identifier: BSD-3-Clause
import {readFileSync} from 'node:fs';
import {kernelSource, sha256} from './kernel-source.mjs';
let settings;
export function initialize(data) { settings = data; }
export async function load(url, context, nextLoad) {
    if (url !== settings.kernelUrl) return nextLoad(url, context);
    const source = readFileSync(new URL(url), 'utf8');
    const effective = kernelSource(source, settings.variant, settings.manifest, readFileSync(new URL('./baseline-jolt-core.js', import.meta.url), 'utf8'));
    settings.port.postMessage({variant: settings.variant, candidateSha256: sha256(source), effectiveSha256: sha256(effective)});
    return {format: 'module', source: effective, shortCircuit: true};
}
