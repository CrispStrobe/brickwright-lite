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

    // 1) `label` blocks. A label with `subcategory` also closes the running <category> and opens a
    //    sibling one, so the category rail shows it as its own entry (getBlocksXML splits on the marker).
    source = replaceOnce(source,
        '        if (blockInfo.blockType === BlockType.BUTTON) {\n            return this._convertButtonForScratchBlocks(blockInfo);\n        }\n',
        `        ${MARKER}
        if (blockInfo.blockType === 'label') {
            const text = xmlEscape(maybeFormatMessage(blockInfo.text, this.makeMessageContextForTarget()));
            return {info: blockInfo, xml: (blockInfo.subcategory ?
                \`</category><!--s--><category name="\${text}" id="\${categoryInfo.id}_\${blockInfo.subcategory}" colour="\${categoryInfo.color1}" secondaryColour="\${categoryInfo.color2}">\` : '') +
                \`<label text="\${text}"></label>\`};
        }

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
        return [].concat(...this._bwBlocksXML(target).map(c => c.xml.split('<!--s-->').map((xml, i) =>
            (i ? {id: /id="([^"]*)"/.exec(xml)[1], xml} : c))));
    }

    _bwBlocksXML (target) {
`, 'getBlocksXML');
    return source;
}
