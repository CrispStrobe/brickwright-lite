// SPDX-License-Identifier: BSD-3-Clause
// The debugger can attach only to S040 parts on the published simulation board.
export const s040PartIds = board => Array.isArray(board?.parts)
    ? board.parts.filter(part => part?.kind === 'esp32_4848s040' && typeof part.id === 'string' && part.id)
        .map(part => part.id)
    : [];

export const sameS040PartIds = (left, right) => left.length === right.length &&
    left.every((id, index) => id === right[index]);
