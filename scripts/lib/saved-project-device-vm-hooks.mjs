/** Reset hardware only at whole-project deserialization, never sprite import. */
export function patchSavedProjectDeviceReset(source) {
    const marker = '// Brickwright: a whole project owns its hardware metadata.';
    if (source.includes(marker)) return source;
    const anchor = '        const runtime = this.runtime;\n        const deserializePromise = function () {';
    if (!source.includes(anchor)) throw new Error('virtual-machine.js whole-project metadata anchor missing');
    return source.replace(anchor, `        const runtime = this.runtime;\n        ${marker}\n        runtime.stc = null;\n        const deserializePromise = function () {`);
}
