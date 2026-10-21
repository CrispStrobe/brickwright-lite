// Pinned scratch-render source patch, applied only through the canonical overlay.
export const bubbleScaleAnchor = '        const requestedScale = scaleMax / 100;\n';
export const bubbleScalePatch = bubbleScaleAnchor + `
        // Brickwright: a hidden stage has no pixels. Keep pending text dirty
        // and reuse any texture until a finite positive scale can render it.
        if (!(requestedScale > 0) || !Number.isFinite(requestedScale)) return this._texture;
`;

export function patchTextBubbleScale(source) {
    if (source.includes('Brickwright: a hidden stage has no pixels.')) {
        if (!source.includes(bubbleScalePatch)) throw new Error('TextBubbleSkin.js partial scale patch');
        return source;
    }
    if (source.split(bubbleScaleAnchor).length !== 2) {
        throw new Error('TextBubbleSkin.js unique requestedScale anchor not found');
    }
    return source.replace(bubbleScaleAnchor, bubbleScalePatch);
}
