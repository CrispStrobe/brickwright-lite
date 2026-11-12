// Focused test loader for the installed packages' genuine production ES
// entries. No transforms, global mutation, alternate realm or package download.
import {readFileSync, realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';

const expected = new Map([
    [
        "dapjs/dist/dap.esm.js",
        "a12431f9b0a456b8a4f5144c3927b8aeea64b4c5f77aa39f2bd55884c5ff68e9"
    ],
    [
        "@microbit/microbit-universal-hex/dist/esm5/index.js",
        "5b794e19ced71e0cc21ed90a61899f1c8f7dcc0a190bd39b116df40c57b0f25e"
    ],
    [
        "@microbit/microbit-universal-hex/dist/esm5/universal-hex.js",
        "afd7d0632fa9ccdea8f08c61d09a8f9d670a0f3f4b05e36cec3bd30a4bb639e9"
    ],
    [
        "@microbit/microbit-universal-hex/dist/esm5/ihex.js",
        "9620afbcb7fb19bd3752fe625347c422a0ad91c8471c696fa9c9702f03a0a230"
    ],
    [
        "@microbit/microbit-universal-hex/dist/esm5/utils.js",
        "e1047a266f963eae6334da5439eb749676d684b35ed131c80b50283e11f9f39f"
    ]
]);
let files;
let edges;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function initialize ({guiRoot}) {
    files = new Map();
    const urls = new Map();
    for (const [relative, sha256] of expected) {
        const file = realpathSync(join(guiRoot, 'node_modules', relative));
        if (digest(readFileSync(file)) !== sha256) throw new Error(`Unexpected production ES package body: ${relative}`);
        const url = pathToFileURL(file).href;
        files.set(url, {file, sha256}); urls.set(relative, url);
    }
    const root = '@microbit/microbit-universal-hex/dist/esm5/';
    edges = new Map([
        [urls.get(`${root}index.js`), new Map([['./universal-hex', urls.get(`${root}universal-hex.js`)]])],
        [urls.get(`${root}universal-hex.js`), new Map([['./ihex', urls.get(`${root}ihex.js`)]])],
        [urls.get(`${root}ihex.js`), new Map([['./utils', urls.get(`${root}utils.js`)]])]
    ]);
}
export async function resolve (specifier, context, nextResolve) {
    if (files.has(context.parentURL)) {
        const target = edges.get(context.parentURL)?.get(specifier);
        if (!target) throw new Error(`Undeclared production ES package edge: ${specifier}`);
        const result = await nextResolve(target, context);
        if (result.url !== target) throw new Error('Unexpected production ES package target');
        return {...result, format: 'module'};
    }
    const result = await nextResolve(specifier, context);
    return files.has(result.url) ? {...result, format: 'module'} : result;
}
export async function load (url, context, nextLoad) {
    const row = files.get(url);
    if (!row) return nextLoad(url, context);
    if (digest(readFileSync(row.file)) !== row.sha256) throw new Error('Changed production ES package body');
    const result = await nextLoad(url, {...context, format: 'module'});
    if (!result.source || digest(result.source) !== row.sha256) throw new Error('Transformed production ES package body');
    return {...result, format: 'module'};
}
