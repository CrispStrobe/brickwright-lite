// SPDX-License-Identifier: BSD-3-Clause
import {createHash} from 'node:crypto';
export const sha256 = source => createHash('sha256').update(source).digest('hex');
export function kernelSource(source, variant, manifest) {
    if (!['baseline', 'candidate'].includes(variant)) throw Error('Unknown kernel variant');
    if (sha256(source) !== manifest.kernel.candidateSha256) throw Error('Candidate kernel identity changed');
    let effective = source;
    if (variant === 'baseline') {
        const block = /\/\/ FLOOR1436_GROUND_BEGIN\n[\s\S]*?\/\/ FLOOR1436_GROUND_END\n\n/;
        if ((source.match(/FLOOR1436_GROUND_BEGIN/g) || []).length !== 1 || !block.test(source)) throw Error('Missing isolated floor change');
        effective = source.replace(block, '').replace(
            'shape = createBoxColliderShape(J, b, col);',
            'shape = new J.BoxShape(new J.Vec3(...col.halfExtents), boxConvexRadius(col.halfExtents));');
        if (sha256(effective) !== manifest.kernel.baselineSha256) throw Error('Reconstructed baseline is not byte-exact');
    }
    return effective;
}
