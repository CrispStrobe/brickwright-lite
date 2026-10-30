// Authored local test inputs; these are not SDK outputs or corpus authorities.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const fileRows = files => Object.entries(files).map(([name, source]) => ({name,
    bytes: Buffer.byteLength(source), sha256: digest(Buffer.from(source))}));
export async function fixture (operation) {
    if (!process.env.TMPDIR) throw new Error('Fixture requires an explicit owned TMPDIR');
    const directory = fs.mkdtempSync(path.join(process.env.TMPDIR, 'conversion-context-'));
    const catalogue = {schema: 'brickwright/conversion-context-catalogue/v1', blobs: {}, subjects: []};
    const blob = (name, value, encoding = 'json', shared = false) => {
        const decoded = Buffer.from(encoding === 'utf8' ? value : JSON.stringify(value));
        const bytes = encoding === 'gzip-json' ? gzipSync(decoded) : decoded;
        fs.writeFileSync(path.join(directory, name), bytes);
        catalogue.blobs[name] = {root: 'catalogue', path: name, bytes: bytes.length, sha256: digest(bytes), encoding,
            ...(encoding === 'gzip-json' ? {decodedBytes: decoded.length, decodedSHA256: digest(decoded)} : {}), shared};
        return {blob: name, pointer: ''};
    };
    const raw = (source = 'let count=1;', name = 'tiny') => {
        const files = {'main.ts': source, 'pxt.json': JSON.stringify({name, dependencies: {device: '*'}, files: ['main.ts']})};
        return {id: name, kind: 'RAW_BASELINE', target: 'arcade', name,
            source: blob(name + '.ts', source, 'utf8'), rootFiles: fileRows(files)};
    };
    const context = () => {
        const files = {'main.ts': 'let count=1;', 'pxt.json': JSON.stringify({name: 'retained', dependencies: {device: '*'}, files: ['main.ts']})};
        const graph = {packages: {}, sourceOrder: [], jres: {}, runtimeConfig: {}, rootResourceIds: [], fetchedExtensions: []};
        const originalCompile = {success: false, diagnostics: [{message: 'Authored original compiler diagnostic; not an SDK observation'}]};
        const root = blob('envelope.json.gz', {files, resolved: graph, originalCompile}, 'gzip-json');
        return {id: 'retained', kind: 'RETAINED_CONTEXT', target: 'arcade', name: 'retained',
            root: {...root, pointer: '/files'}, resolved: {...root, pointer: '/resolved'},
            originalCompile: {...root, pointer: '/originalCompile'}, rootFiles: fileRows(files), packages: [],
            resources: {jres: [], rootResourceIds: {provided: true, value: []}, sourceOrder: []},
            notices: [{status: 'unavailable', owner: 'root'}], provenance: {fixture: 'authored byte relations only'}};
    };
    const save = () => {const filename = path.join(directory, 'catalogue.json'); fs.writeFileSync(filename, JSON.stringify(catalogue)); return filename;};
    try {return await operation({directory, catalogue, blob, raw, context, save});}
    finally {fs.rmSync(directory, {recursive: true, force: false});}
}
