// SPDX-License-Identifier: BSD-3-Clause
import {createHash} from 'node:crypto';
export const sha256 = source => createHash('sha256').update(source).digest('hex');
export function kernelSource(source, variant, manifest, baseline) {
    if (!['baseline', 'candidate'].includes(variant)) throw Error('Unknown kernel variant');
    if (variant === 'candidate') return source;
    if (typeof baseline !== 'string' || sha256(baseline) !== manifest.kernel.baselineSha256) throw Error('Retained baseline is not byte-exact');
    return baseline;
}
