#!/usr/bin/env node
/** Recover authentic project context without changing a corpus input.
 * Usage: node scripts/recover-makecode-context.mjs --manifest manifest.json
 *   --audit import-report.json --corpus-dir corpus-root --out new-directory
 * Fetches only the immutable documentation URLs declared in the manifest.
 * Does not fetch packages, execute code or claim that a fragment is a game.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {tutorialProjectFiles, hasTutorialJres} from '../overlay/scratch-gui/src/lib/bw-makecode/tutorial-project.js';
import {getTutorialTilemapGenerator} from './lib/pxt-node.mjs';
import {makeCodeProjectFile} from '../overlay/scratch-gui/src/lib/bw-makecode/project-file.js';

const args = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!['--manifest', '--audit', '--corpus-dir', '--out'].includes(key) || !args[i + 1] || args[i + 1].startsWith('--')) {
        throw new Error(`Expected --manifest, --audit, --corpus-dir and --out; invalid argument ${key}`);
    }
    if (options[key]) throw new Error(`Duplicate option ${key}`);
    options[key] = args[++i];
}
for (const key of ['--manifest', '--audit', '--corpus-dir', '--out']) {
    if (!options[key]) throw new Error(`Missing ${key}`);
}
const manifest = JSON.parse(await fs.readFile(options['--manifest'], 'utf8'));
const audit = JSON.parse(await fs.readFile(options['--audit'], 'utf8'));
if (!Array.isArray(manifest.entries) || !Array.isArray(audit.rows)) throw new Error('Manifest entries and audit rows are required.');
const root = await fs.realpath(options['--corpus-dir']);
const out = path.resolve(options['--out']);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const partial = audit.rows.filter(row => row.stage === 'partial');
const selected = [];
// Preflight all original hashes before creating output or accessing the network.
for (const row of partial) {
    const name = path.basename(row.file);
    const entries = manifest.entries.filter(entry => path.basename(entry.file) === name);
    if (entries.length !== 1) throw new Error(`Expected one manifest entry for ${name}, got ${entries.length}`);
    const entry = entries[0];
    const originalPath = await fs.realpath(path.resolve(root, entry.file));
    if (!originalPath.startsWith(`${root}${path.sep}`)) throw new Error(`Original escapes corpus root: ${entry.file}`);
    const bytes = await fs.readFile(originalPath);
    if (hash(bytes) !== entry.sha256) throw new Error(`Original manifest hash mismatch: ${entry.file}`);
    const match = String(entry.source).match(/^https:\/\/github\.com\/microsoft\/pxt-arcade\/blob\/([a-f0-9]{40})\/(docs\/[^#]+\.md)(?:#.*)?$/);
    if (!match) throw new Error(`Expected pinned PXT Arcade Markdown source: ${entry.source}`);
    selected.push({entry, name, bytes, revision: match[1], document: match[2]});
}
// Never replace a previous receipt or a source directory.
await fs.mkdir(out);
const report = {schema: 'brickwright/arcade-context-recovery/v1', generatedAt: new Date().toISOString(),
    tool: {node: process.version, scriptSha256: hash(await fs.readFile(fileURLToPath(import.meta.url))),
        assemblerSha256: hash(await fs.readFile(new URL('../overlay/scratch-gui/src/lib/bw-makecode/tutorial-project.js', import.meta.url)))},
    baseline: {source: audit.provenance?.source, corpus: audit.provenance?.corpus},
    boundary: 'Original bytes unchanged; authentic tutorial context only. Compilation, package recovery, execution and GUI support require separate qualification.',
    rows: []};
await fs.writeFile(path.join(out, 'recovery.json'), JSON.stringify(report, null, 2) + '\n');
const documents = new Map();
for (const {entry, name, bytes, revision, document} of selected) {
    const record = {original: entry.file, originalSha256: hash(bytes), source: entry.source,
        revision, license: entry.license, diagnostics: partial.find(row => path.basename(row.file) === name).unsupported};
    try {
        const url = `https://raw.githubusercontent.com/microsoft/pxt-arcade/${revision}/${document}`;
        if (!documents.has(url)) {
            const response = await fetch(url, {signal: AbortSignal.timeout(30000)});
            if (!response.ok) throw new Error(`Documentation fetch returned HTTP ${response.status}`);
            documents.set(url, await response.text());
        }
        const markdown = documents.get(url);
        const directory = name.replace(/\.ts$/, '');
        await fs.mkdir(path.join(out, directory));
        await fs.writeFile(path.join(out, directory, 'tutorial.md'), markdown);
        Object.assign(record, {documentationUrl: url, documentationSha256: hash(Buffer.from(markdown))});
        const jresToTypeScript = hasTutorialJres(markdown) ? await getTutorialTilemapGenerator('arcade') : undefined;
        const project = tutorialProjectFiles(markdown, bytes.toString('utf8'), {target: 'arcade', name: name.replace(/\.ts$/, ''), jresToTypeScript});
        if (project.files['main.ts'] !== bytes.toString('utf8')) throw new Error('Recovered project changed original main.ts');
        await fs.writeFile(path.join(out, directory, 'project.mkcd'), makeCodeProjectFile(project.files, {target: 'arcade', name: directory}));
        const packageJson = JSON.parse(project.files['pxt.json']);
        Object.assign(record, {status: 'context-recovered', documentationUrl: url,
            documentationSha256: hash(Buffer.from(markdown)), project: `${directory}/project.mkcd`,
            files: Object.keys(project.files), dependencies: packageJson.dependencies,
            packageSourcesFetched: false, originalMainPreserved: true,
            ...(jresToTypeScript ? {jresGeneration: jresToTypeScript.provenance} : {})});
    } catch (error) {
        Object.assign(record, {status: 'recovery-failed', error: error.message});
        process.exitCode = 1;
    }
    report.rows.push(record);
    await fs.writeFile(path.join(out, 'recovery.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(`${record.status}: ${name}`);
}
console.log(JSON.stringify({selected: selected.length, recovered: report.rows.filter(row => row.status === 'context-recovered').length,
    failed: report.rows.filter(row => row.status === 'recovery-failed').length}));
