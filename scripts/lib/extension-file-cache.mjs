/**
 * A directory-backed cache for fetched MakeCode extensions, in the {get, set}
 * shape extension-fetch.js takes. One JSON file per `repo@commit`, holding the
 * full provenance record (repo, commit, file blobs, licence text, holder) and
 * the extension's files. Only a full 40-hex commit names a file.
 */
import fs from 'node:fs';
import path from 'node:path';

const KEY = /^([a-z0-9][\w.-]*\/[\w.-]+(?:\/[\w.-]+)*)@([0-9a-f]{40})$/i;
const fileFor = (dir, key) => {
    const m = KEY.exec(key);
    if (!m || m[1].split('/').some(part => part === '.' || part === '..')) throw new Error(`invalid extension cache key: ${key}`);
    return path.join(dir, `${m[1].replace(/\//g, '__')}@${m[2]}.json`);
};

export function fileExtensionCache (dir) {
    return {
        async get (key) {
            try { return JSON.parse(fs.readFileSync(fileFor(dir, key), 'utf8')); } catch { return null; }
        },
        async set (key, value) {
            fs.mkdirSync(dir, {recursive: true});
            fs.writeFileSync(fileFor(dir, key), JSON.stringify(value, null, 1));
        }
    };
}
