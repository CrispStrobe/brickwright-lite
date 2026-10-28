/** MakeCode's native project envelope, accepted as uncompressed .mkcd JSON.
 * Protocol reference: microsoft/pxt pxtlib/package.ts saveToJsonAsync and
 * webapp/src/app.tsx importProjectCoreAsync. No compressor or firmware needed.
 */
export function makeCodeProjectFile (files, {name = 'Brickwright project', target = 'microbit'} = {}) {
    if (!files || typeof files !== 'object' || Array.isArray(files) ||
        !Object.keys(files).length || !Object.values(files).every(value => typeof value === 'string')) {
        throw new Error('MakeCode project files must be a nonempty map of text files.');
    }
    if (!/^[a-z][a-z0-9-]*$/i.test(target)) throw new Error('Invalid MakeCode project target.');
    let editor = 'tsprj';
    try { editor = JSON.parse(files['pxt.json']).preferredEditor || editor; } catch { /* default source editor */ }
    return JSON.stringify({meta: {name, cloudId: `pxt/${target}`, editor}, source: JSON.stringify(files)}, null, 2) + '\n';
}

/** Current PNG/.mkcd downloads wrap the file map in {meta, source}.
 * Historical cartridges can contain a bare file map, which remains readable.
 */
export function readMakeCodeProjectText (text, format) {
    const parsed = JSON.parse(text);
    let meta = {}, files = parsed, source = text;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'meta' in parsed && 'source' in parsed) {
        if (!parsed.meta || typeof parsed.meta !== 'object' || Array.isArray(parsed.meta)) {
            throw new Error('MakeCode project metadata must be an object.');
        }
        meta = parsed.meta;
        files = typeof parsed.source === 'string' ? JSON.parse(parsed.source) : parsed.source;
        source = typeof parsed.source === 'string' ? parsed.source : JSON.stringify(parsed.source);
    }
    if (!files || typeof files !== 'object' || Array.isArray(files) || !Object.keys(files).length ||
        !Object.values(files).every(value => typeof value === 'string')) {
        throw new Error('MakeCode project source must be a nonempty map of text files.');
    }
    return {format, meta, source, files};
}
