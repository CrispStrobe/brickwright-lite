// Existing resource lowering: a fresh typed image Array per literal lookup.
// This creates syntax only; it grants no primitive element or runtime authority.
export function animationAssetArray(animation) {
    return {type: 'Array', items: animation.frames.map(frame => ({type: 'Template', tag: 'img',
        value: Array.from({length: animation.height}, (_, y) =>
            Array.from(frame.pixels.subarray(y * animation.width, (y + 1) * animation.width),
                index => index.toString(16)).join(' ')).join('\n')}))};
}
