import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Only the runner's known Ubuntu mirror changes. Suites, components, signing
// keys, package lists and unrelated repositories keep their original authority.
export function officialUbuntuArchive(text) {
    let uris = false;
    return text.split(/(?<=\n)/).map(line => {
        if (/^\s*#/.test(line)) return line;
        if (!line.trim()) uris = false;
        else if (/^[A-Za-z][\w-]*:/.test(line)) uris = /^URIs:/.test(line);
        if (!/^\s*deb(?:-src)?\s/.test(line) && !uris) return line;
        return line.replace(/https?:\/\/azure\.archive\.ubuntu\.com\/ubuntu(?=\/?(?:\s|$))/g,
            'https://archive.ubuntu.com/ubuntu');
    }).join('');
}

export async function prepareUbuntuArchives(files) {
    const changed = [];
    for (const file of files) {
        let before;
        try {before = await readFile(file, 'utf8');} catch (error) {
            if (error.code === 'ENOENT') continue;
            throw error;
        }
        const after = officialUbuntuArchive(before);
        if (after !== before) {await writeFile(file, after); changed.push(file);}
    }
    return changed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.platform !== 'linux') throw new Error('Ubuntu browser setup requires a Linux runner');
    const changed = await prepareUbuntuArchives(['/etc/apt/sources.list', '/etc/apt/sources.list.d/ubuntu.sources']);
    console.log(`Prepared official Ubuntu archive: ${changed.length} source file(s) changed`);
}
