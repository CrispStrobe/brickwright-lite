// MINDSTORMS Robot Inventor .lms: a ZIP containing manifest.json, scratch.sb3
// and (usually) icon.svg. Keep the LEGO metadata verbatim across round-trips.
import JSZip from 'jszip';

const MAX_LMS_BYTES = 32 * 1024 * 1024;
let activeLms = null;

const bytesOf = async value => {
    if (value instanceof ArrayBuffer) return value;
    if (ArrayBuffer.isView(value)) {
        return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    }
    return value.arrayBuffer();
};

export async function unpackLms (input) {
    const bytes = await bytesOf(input);
    if (bytes.byteLength > MAX_LMS_BYTES) throw new Error('MINDSTORMS project exceeds 32 MiB');
    const zip = await JSZip.loadAsync(bytes);
    const manifestFile = zip.file('manifest.json');
    const scratchFile = zip.file('scratch.sb3');
    if (!manifestFile || !scratchFile) throw new Error('MINDSTORMS project needs manifest.json and scratch.sb3');
    const manifest = JSON.parse(await manifestFile.async('string'));
    if (!manifest || manifest.type !== 'word-blocks' || !Number.isInteger(manifest.version)) {
        throw new Error('Unsupported MINDSTORMS project manifest');
    }
    const scratch = await scratchFile.async('uint8array');
    if (scratch.byteLength > MAX_LMS_BYTES) throw new Error('Embedded Scratch project exceeds 32 MiB');
    const icon = zip.file('icon.svg') ? await zip.file('icon.svg').async('uint8array') : null;
    return {scratch, manifest, icon, archive: new Uint8Array(bytes)};
}

export function setActiveLms (project) { activeLms = project; }
export function clearActiveLms () { activeLms = null; }
export function hasActiveLms () { return !!activeLms; }

const legoOpcodes = project => {
    const result = new Map();
    for (const target of project.targets || []) {
        for (const block of Object.values(target.blocks || {})) {
            if (typeof block.opcode === 'string' && block.opcode.startsWith('flipper')) {
                result.set(block.opcode, (result.get(block.opcode) || 0) + 1);
            }
        }
    }
    return result;
};

const projectJson = async sb3 => {
    const zip = await JSZip.loadAsync(await bytesOf(sb3));
    const file = zip.file('project.json');
    if (!file) throw new Error('Scratch project has no project.json');
    return JSON.parse(await file.async('string'));
};

export async function packActiveLms (currentSb3, name, {unchanged = false} = {}) {
    if (!activeLms) throw new Error('Open a LEGO MINDSTORMS .lms project before exporting .lms');
    const original = activeLms.scratch;
    const selected = unchanged ? original : currentSb3;
    if (!unchanged) {
        const before = legoOpcodes(await projectJson(original));
        const after = legoOpcodes(await projectJson(selected));
        for (const [opcode, count] of before) {
            if ((after.get(opcode) || 0) < count) {
                throw new Error(`LEGO block ${opcode} was lost during editing; .lms export refused`);
            }
        }
    }
    const manifest = {...activeLms.manifest, name, lastsaved: new Date().toISOString()};
    const zip = activeLms.archive ? await JSZip.loadAsync(activeLms.archive) : new JSZip();
    zip.file('manifest.json', JSON.stringify(manifest));
    zip.file('scratch.sb3', await bytesOf(selected));
    if (activeLms.icon) zip.file('icon.svg', activeLms.icon);
    return zip.generateAsync({type: 'blob', compression: 'DEFLATE'});
}
