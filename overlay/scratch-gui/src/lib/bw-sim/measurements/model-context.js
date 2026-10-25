// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {sha256Text} from './binding-digest.js';

/** The same physical serialization before and after a project roundtrip.
 * Header identity is fixed; observations live in the separate project section,
 * never in this text. Keep the original opened bytes as an explicit CSV alias.
 */
export const measurementModelContext = (model, rawText, serializeModel) => {
    if (!model || typeof rawText !== 'string' || typeof serializeModel !== 'function') {
        throw new Error('Measurement model identity is unavailable');
    }
    const canonical = serializeModel(model, {name: 'measurement-model.ldr', title: 'Robot Lab measurement model', author: 'Brickwright'});
    if (typeof canonical !== 'string' || !canonical.length) throw new Error('Measurement model identity is unavailable');
    return {modelSha256: sha256Text(canonical), rawModelSha256: sha256Text(rawText)};
};
