// Extension palette structure (Arcade): section labels, sub-category rail entries and
// extension buttons with their own callback. The base VM supports none of them, and the
// change is too small to carry the whole runtime.js as an overlay, so it is patched here
// like the other runtime hooks. Idempotent; each anchor must occur exactly once.
const MARKER = '// Brickwright: extension palette structure.';

const replaceOnce = (source, before, after, what) => {
    if (source.split(before).length !== 2) throw new Error(`runtime.js palette anchor missing or ambiguous: ${what}`);
    return source.replace(before, after);
};

export function patchPaletteStructure (source) {
    if (source.includes(MARKER)) return source;

    // 1) `label` blocks carry their own flyout XML (arcade/palette.js): a <label>, optionally preceded by
    //    `</category><!--s--><category ...>` so the category rail shows a sub-category entry (getBlocksXML splits on the marker).
    source = replaceOnce(source,
        '        if (blockInfo.blockType === BlockType.BUTTON) {\n            return this._convertButtonForScratchBlocks(blockInfo);\n        }\n',
        `        ${MARKER}
        if (blockInfo.blockType === 'label') return {info: blockInfo, xml: blockInfo.xml};

        if (blockInfo.blockType === BlockType.BUTTON) {
            return this._convertButtonForScratchBlocks(blockInfo);
        }
`, 'label conversion');

    // 2) Buttons that bring their own callback (the GUI reads runtime.bwButtonCallbacks).
    source = replaceOnce(source,
        '        if (supportedCallbackKeys.indexOf(buttonInfo.func) < 0) {',
        '        if (typeof buttonInfo.callback === \'function\') {\n' +
        '            (this.bwButtonCallbacks = this.bwButtonCallbacks || {})[buttonInfo.func] = buttonInfo.callback;\n' +
        '        } else if (supportedCallbackKeys.indexOf(buttonInfo.func) < 0) {', 'button callback');

    // 3) One extension may emit several categories.
    source = replaceOnce(source,
        '    getBlocksXML (target) {\n',
        `    getBlocksXML (target) {
        return this._bwBlocksXML(target).flatMap(c => c.xml.split('<!--s-->').map((xml, i) => ({id: c.id + (i || ''), xml})));
    }

    _bwBlocksXML (target) {
`, 'getBlocksXML');
    return source;
}
