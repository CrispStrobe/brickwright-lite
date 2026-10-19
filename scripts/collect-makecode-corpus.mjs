#!/usr/bin/env node
/** Extract lesson/project code fences from a pinned PXT target corpus.
 *
 * Outputs source files and a provenance manifest; never copies them into the
 * shipped app. Use --snippets to include every API fragment as well.
 *
 * --projects additionally preserves customts/assetjson/package/jres fences as
 * separate .mkcd projects. It does not replace the original code fragments.
 * node scripts/collect-makecode-corpus.mjs --out DIR [--arcade-docs DIR] [--snippets] [--projects]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {untar, CACHE_DIR} from './sync-makecode-runtime.mjs';
import {tutorialProjectFiles, hasTutorialJres} from '../overlay/scratch-gui/src/lib/bw-makecode/tutorial-project.js';
import {getTutorialTilemapGenerator} from './lib/pxt-node.mjs';
import {makeCodeProjectFile} from '../overlay/scratch-gui/src/lib/bw-makecode/project-file.js';

const argv = process.argv.slice(2);
const opt = name => { const i = argv.indexOf(name); return i < 0 ? null : argv[i + 1]; };
const out = opt('--out');
const arcadeDocs = opt('--arcade-docs');
const snippets = argv.includes('--snippets');
const projects = argv.includes('--projects');
if (!out || argv.some(a => a.startsWith('--') && !['--out', '--arcade-docs', '--snippets', '--projects'].includes(a))) {
    console.error('usage: node scripts/collect-makecode-corpus.mjs --out DIR [--arcade-docs DIR] [--snippets] [--projects]');
    process.exit(2);
}

const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const entries = [];
const collectionFailures = [];
const seen = new Set();
async function add (target, source, text, origin, license) {
    const blocks = [...text.matchAll(/```(?:blocks|typescript|block)\s*\n([\s\S]*?)```/g)];
    if (!blocks.length) return;
    const selected = snippets ? blocks.map((m, i) => [m[1], i]) :
        /^docs\/(projects|lessons|courses|tutorials|examples)\//.test(source) ?
            [[blocks[blocks.length - 1][1], blocks.length - 1]] : [];
    for (const [code, index] of selected) {
        const key = `${target}:${code.replace(/\s+/g, ' ').trim()}`;
        if (!key.trim() || seen.has(key)) continue;
        seen.add(key);
        const id = hash(Buffer.from(`${source}#${index}`)).slice(0, 16);
        const name = `${target}-${id}.ts`;
        fs.mkdirSync(path.join(out, target), {recursive: true});
        fs.writeFileSync(path.join(out, target, name), `${code.trim()}\n`);
        entries.push({file: `${target}/${name}`, target, source: `${origin}/${source}#${index}`,
            sourceSha256: hash(Buffer.from(code)), license});
    }
    if (projects && selected.length) {
        const [code, index] = selected.at(-1);
        const id = hash(Buffer.from(`${source}#${index}`)).slice(0, 16);
        try {
            const jresToTypeScript = hasTutorialJres(text) ? await getTutorialTilemapGenerator(target) : undefined;
            const project = tutorialProjectFiles(text, `${code.trim()}\n`, {target, name: `${target}-${id}`, jresToTypeScript});
            const envelope = makeCodeProjectFile(project.files, {target, name: `${target}-${id}`});
            const projectKey = `${target}:project:${JSON.stringify(project.files)}`;
            if (seen.has(projectKey)) return;
            seen.add(projectKey);
            const name = `${target}-${id}.mkcd`, dir = `${target}-projects`;
            fs.mkdirSync(path.join(out, dir), {recursive: true});
            fs.writeFileSync(path.join(out, dir, name), envelope);
            entries.push({file: `${dir}/${name}`, target, source: `${origin}/${source}`,
                sourceSha256: hash(Buffer.from(text)), sha256: hash(Buffer.from(envelope)),
                mainKind: 'selected-code-fence', companionFiles: Object.keys(project.files),
                boundary: 'Selected source with tutorial context; not a complete-game or execution claim.', license,
                ...(jresToTypeScript ? {jresGeneration: jresToTypeScript.provenance} : {})});
        } catch (error) {
            collectionFailures.push({target, source: `${origin}/${source}`, projectCollection: 'failed',
                reason: error.message, license});
        }
    }
}

const microbitTar = path.join(CACHE_DIR, 'pxt-microbit-9.1.1.tgz');
if (!fs.existsSync(microbitTar)) throw new Error('pinned micro:bit docs absent; run npm run sync:makecode');
for (const [name, bytes] of untar(fs.readFileSync(microbitTar))) {
    if (!name.startsWith('docs/') || !name.endsWith('.md')) continue;
    await add('microbit', name, bytes.toString('utf8'),
        'https://registry.npmjs.org/pxt-microbit/-/pxt-microbit-9.1.1.tgz', 'MIT');
}
// pxt-arcade's own docs/ tree (the source label in the manifest), not Lite's docs/.
const PXT_DOCS = 'docs/';
if (arcadeDocs) {
    const rev = execFileSync('git', ['-C', arcadeDocs, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
    async function walk (dir) {
        for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
            const f = path.join(dir, e.name);
            if (e.isDirectory()) await walk(f);
            else if (e.name.endsWith('.md')) {
                const rel = path.relative(arcadeDocs, f).replaceAll(path.sep, '/');
                await add('arcade', PXT_DOCS + rel, fs.readFileSync(f, 'utf8'),
                    `https://github.com/microsoft/pxt-arcade/blob/${rev}`, 'MIT');
            }
        }
    }
    await walk(arcadeDocs);
}
entries.sort((a, b) => a.file.localeCompare(b.file));
fs.mkdirSync(out, {recursive: true});
fs.writeFileSync(path.join(out, 'manifest.json'), `${JSON.stringify({schema: 'brickwright/makecode-corpus/v1',
    generatedAt: new Date().toISOString(), snippets, projects, count: entries.length, entries, collectionFailures}, null, 2)}\n`);
console.log(`${entries.length} MakeCode files written to ${out}; ${collectionFailures.length} project collections failed`);
if (collectionFailures.length) process.exitCode = 1;
