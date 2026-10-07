#!/usr/bin/env node
/** Exercise conversion permutations on a pinned corpus, preserving every loss.
 * Usage: node scripts/conversion-roundtrips.mjs --out report.json [--limit N] [--compile] [--corpus-commit SHA] DIR...
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import JSZip from 'jszip';
import {svgToPixels} from '../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js';
import {importProjectFiles} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import {exportToMakeCode} from '../overlay/scratch-gui/src/lib/bw-makecode/export.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {compile, hasRuntime} from './lib/pxt-node.mjs';


// Report identity contains hashes and declared public identities, never host paths.
function snapshotIdentity () {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const git = args => {
        const result = spawnSync('git', args, {cwd: root, encoding: 'utf8'});
        return result.status === 0 ? result.stdout.trim() : null;
    };
    const sha256 = value => createHash('sha256').update(value).digest('hex');
    const diff = git(['diff', '--binary', 'HEAD']);
    const status = git(['status', '--porcelain', '--untracked-files=normal']);
    const readJSON = name => {
        try { return JSON.parse(fs.readFileSync(path.join(root, name), 'utf8')); }
        catch { return null; }
    };
    return {source: {commit: git(['rev-parse', 'HEAD']), dirty: status === null ? null : !!status,
        trackedDiffSha256: diff === null ? null : sha256(diff),
        statusSha256: status === null ? null : sha256(status),
        untrackedInputs: 'contents not covered by trackedDiffSha256 or statusSha256'},
    vendorPins: readJSON('vendor-pins.json'),
    makecodeVersions: readJSON('packages/scratch-gui/static/makecode/VERSIONS.json'),
    node: process.version};
}

// Capture before collecting or processing corpus inputs. Never replace this with
// the final HEAD: a long audit may span unrelated commits in its checkout.
const invocationAt = new Date().toISOString();
const invocationIdentity = snapshotIdentity();

function auditProvenance (files, corpusCommit) {
    const sha256 = value => createHash('sha256').update(value).digest('hex');
    let unreadableFiles = 0;
    const inputHashes = files.map(file => {
        try { return sha256(fs.readFileSync(file)); }
        catch { unreadableFiles++; return 'unreadable'; }
    }).sort();
    return {...invocationIdentity, invocationAt,
        corpus: {declaredCommit: corpusCommit || null, commitVerified: false,
            fileCount: files.length, unreadableFiles, contentMultisetSha256: sha256(JSON.stringify(inputHashes))}};
}

function finishProvenance (provenance) {
    const endIdentity = snapshotIdentity();
    return {...provenance, completedAt: new Date().toISOString(),
        endIdentity,
        changeDetection: {
            sourceChanged: JSON.stringify(provenance.source) !== JSON.stringify(endIdentity.source),
            vendorPinsChanged: JSON.stringify(provenance.vendorPins) !== JSON.stringify(endIdentity.vendorPins),
            makecodeVersionsChanged: JSON.stringify(provenance.makecodeVersions) !== JSON.stringify(endIdentity.makecodeVersions),
            boundary: 'Endpoint comparison only; transient edits and untracked file contents are not verified.'
        }};
}

function rankGaps (rows, elements) {
    const families = new Map();
    for (const [index, row] of rows.entries()) {
        for (const element of elements(row)) {
            const key = String(element);
            if (!families.has(key)) families.set(key, {family: key, projects: new Set(), occurrences: 0});
            const item = families.get(key);
            item.projects.add(index);
            item.occurrences++;
        }
    }
    return [...families.values()].map(item => ({family: item.family,
        affectedProjects: item.projects.size, occurrences: item.occurrences}))
        .sort((a, b) => b.affectedProjects - a.affectedProjects ||
            b.occurrences - a.occurrences || a.family.localeCompare(b.family));
}

const argv = process.argv.slice(2);
let out = null;
let corpusCommit = null;
let limit = Infinity;
let compileExports = false;
const inputs = [];
for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') out = argv[++i];
    else if (argv[i] === '--corpus-commit') corpusCommit = argv[++i];
    else if (argv[i] === '--limit') limit = Number(argv[++i]);
    else if (argv[i] === '--compile') compileExports = true;
    else if (argv[i].startsWith('-')) throw new Error(`unknown option ${argv[i]}`);
    else inputs.push(argv[i]);
}
if (!out || !inputs.length || !Number.isInteger(limit) && limit !== Infinity || limit < 0) {
    console.error('usage: node scripts/conversion-roundtrips.mjs --out report.json [--limit N] [--compile] [--corpus-commit SHA] DIR...');
    process.exit(2);
}
const collect = name => fs.statSync(name).isDirectory() ?
    fs.readdirSync(name).sort().flatMap(child => collect(path.join(name, child))) :
    /\.(ts|sb3)$/i.test(name) ? [name] : [];
if (corpusCommit !== null && !/^[a-f0-9]{40}$/i.test(corpusCommit)) throw new Error('--corpus-commit requires a full immutable commit SHA');
const files = [...new Set(inputs.flatMap(collect))].slice(0, limit);
const provenance = auditProvenance(files, corpusCommit);
const shortError = error => String(error?.message || error).slice(0, 400);
const projectFacts = project => {
    const opcodes = new Map();
    for (const target of project.targets || []) {
        for (const block of Object.values(target.blocks || {})) {
            if (block?.opcode) opcodes.set(block.opcode, (opcodes.get(block.opcode) || 0) + 1);
        }
    }
    return {targets: (project.targets || []).map(t => t.name),
        opcodes: Object.fromEntries([...opcodes].sort()),
        assets: (project.targets || []).flatMap(t => [
            ...(t.costumes || []).map(a => `${t.name}:costume:${a.name}`),
            ...(t.sounds || []).map(a => `${t.name}:sound:${a.name}`)
        ]).sort(),
        extensions: [...(project.extensions || [])].sort(),
        extensionURLs: project.extensionURLs || {}};
};
const differences = (before, after, {ignoreAssetNames = false} = {}) => {
    const lost = (key, extra = () => true) => Object.entries(before[key] || {})
        .filter(([name, n]) => extra(name) && n > (after[key]?.[name] || 0))
        .map(([name, n]) => ({name, before: n, after: after[key]?.[name] || 0}));
    return {missingTargets: before.targets.filter(x => !after.targets.includes(x)),
        lostOpcodes: lost('opcodes'),
        missingAssets: ignoreAssetNames ? [] : before.assets.filter((x, i) =>
            before.assets.indexOf(x) === i && !after.assets.includes(x)),
        missingExtensions: before.extensions.filter(x => !after.extensions.includes(x)),
        missingExtensionURLs: Object.keys(before.extensionURLs)
            .filter(x => !after.extensionURLs[x])};
};
const artworkSignatures = assets => assets.map(asset => {
    // Generated sprite and Image resource template numbers depend on event
    // and expression order in exported TypeScript. Compare their exact pixels
    // as a multiset within each template family; named sprites retain identity.
    const generated = /^(__(?:arcadeTemplate|arcadeBackground))\d+$/.exec(asset.sprite);
    const owner = generated ? generated[1] : asset.sprite;
    const pixels = svgToPixels(asset.svg);
    return pixels ? `${owner}:${pixels.width}x${pixels.height}:` +
        Buffer.from(pixels.pixels).toString('hex') : `${owner}:unreadable:${asset.svg}`;
}).sort();
const stage = (label, fn) => {
    try { return {label, ...fn()}; }
    catch (error) { return {label, error: shortError(error)}; }
};

async function inspect (file) {
    const isTs = file.endsWith('.ts');
    const target = isTs && file.split(path.sep).includes('arcade') ? 'arcade' : 'microbit';
    const row = {file, format: isTs ? 'makecode-ts' : 'sb3', target: isTs ? target : 'scratch', paths: []};
    let project;
    let projectCreator;
    let originalCode;
    let originalAssets;
    if (isTs) {
        const dependencies = target === 'arcade' ? {device: '*'} :
            {core: '*', radio: '*', microphone: '*'};
        const files = {'main.ts': fs.readFileSync(file, 'utf8'),
            'pxt.json': JSON.stringify({name: path.basename(file, '.ts'), dependencies, files: ['main.ts']})};
        row.sourceFiles = files;
        const imported = importProjectFiles(files, {target, name: path.basename(file, '.ts')});
        originalCode = imported.code;
        originalAssets = imported.costumes || [];
        row.importUnsupported = imported.unsupported || [];
        const creator = new SB3Creator();
        creator.parse(originalCode);
        for (const costume of originalAssets) {
            if (costume.mode === 'add') creator.addCustomSVGCostume(costume.sprite, costume.svg, costume.name);
            else creator.applyCustomSVG(costume.sprite, costume.svg);
        }
        projectCreator = creator;
        project = creator.project;
    } else {
        const zip = await JSZip.loadAsync(fs.readFileSync(file));
        project = JSON.parse(await zip.file('project.json').async('string'));
    }
    const before = projectFacts(project);
    row.initial = {targets: before.targets.length, blocks: Object.values(before.opcodes)
        .reduce((a, b) => a + b, 0), assets: before.assets.length};

    // Project -> Brickwright text -> project. For a foreign SB3 this is a
    // deliberately demanding path: unrecognized blocks and art must be named.
    row.paths.push(stage('project -> bw -> project', () => {
        const bw = isTs ? originalCode : new SB3Creator().decompile(project);
        const creator = new SB3Creator();
        const converted = creator.parse(bw);
        return {status: 'converted', differences: differences(before, projectFacts(converted)),
            binaryAssetsNotRepresented: !isTs && before.assets.length > 0,
            warnings: creator.warnings || []};
    }));

    if (isTs) {
        // MakeCode -> BW -> SB3 -> BW. The archive hop catches metadata and
        // block serialization mistakes independently of the text parser.
        const creator = new SB3Creator();
        creator.parse(originalCode);
        for (const costume of originalAssets) {
            if (costume.mode === 'add') creator.addCustomSVGCostume(costume.sprite, costume.svg, costume.name);
            else creator.applyCustomSVG(costume.sprite, costume.svg);
        }
        try {
            const blob = await creator.generateSB3();
            const zip = await JSZip.loadAsync(await blob.arrayBuffer());
            const archived = JSON.parse(await zip.file('project.json').async('string'));
            row.paths.push(stage('makecode -> bw -> sb3 -> bw -> project', () => {
                const bw = new SB3Creator().decompile(archived);
                const result = new SB3Creator().parse(bw);
                return {status: 'converted', differences: differences(projectFacts(archived), projectFacts(result)),
                    binaryAssetsNotRepresented: projectFacts(archived).assets.length > 0,
                    archiveDifferences: differences(projectFacts(creator.project), projectFacts(archived))};
            }));
        } catch (error) { row.paths.push({label: 'makecode -> bw -> sb3 -> bw -> project', error: shortError(error)}); }

        // MakeCode -> BW -> MakeCode -> BW. This checks the reverse translator
        // and identifies code that MakeCode itself rejects after re-export.
        row.paths.push(stage('makecode -> bw -> makecode -> bw', () => {
            const exported = target === 'arcade' ? projectToArcade(project, {name: 'roundtrip',
                costumeSvg: (sprite, costume) => {
                    const asset = projectCreator.assets.get(costume.assetId);
                    return asset?.type === 'svg' ? asset.data : null;
                }}) :
                exportToMakeCode(project, {name: 'roundtrip'});
            const back = importProjectFiles(exported.files, {target, name: 'roundtrip'});
            const converted = new SB3Creator().parse(back.code);
            const loss = differences(before, projectFacts(converted), {ignoreAssetNames: isTs});
            if (isTs && target === 'arcade') {
                const remaining = artworkSignatures(back.costumes || []);
                loss.missingArtwork = artworkSignatures(originalAssets).filter(signature => {
                    const index = remaining.indexOf(signature);
                    if (index < 0) return true;
                    remaining.splice(index, 1);
                    return false;
                });
            }
            return {status: 'converted', differences: loss,
                exportUnsupported: exported.unsupported || [], importUnsupported: back.unsupported || [],
                exportedFiles: exported.files};
        }));
        if (compileExports && hasRuntime(target)) {
            const p = row.paths.find(p => p.label === 'makecode -> bw -> makecode -> bw');
            if (p?.exportedFiles) {
                try {
                    const result = await compile(target, p.exportedFiles);
                    p.compile = {status: result.success ? 'pass' : 'fail',
                        diagnostics: (result.diagnostics || []).slice(0, 3).map(d => d.message)};
                    // A documentation snippet that MakeCode itself rejects (an
                    // undeclared sprite, a missing package or asset) cannot be
                    // re-exported into a valid program: that failure is the source's.
                    if (!result.success) {
                        const original = await compile(target, row.sourceFiles);
                        p.originalCompile = {status: original.success ? 'pass' : 'fail',
                            diagnostics: (original.diagnostics || []).slice(0, 3).map(d => d.message)};
                        if (!original.success) p.compile.status = 'source-invalid';
                    }
                } catch (error) { p.compile = {status: 'fail', error: shortError(error)}; }
            }
        }
    }
    for (const p of row.paths) {
        const loss = p.binaryAssetsNotRepresented || Object.values(p.differences || {}).some(v => v.length);
        const unsupported = row.importUnsupported?.length || p.exportUnsupported?.length || p.importUnsupported?.length;
        p.qualification = {structuralRoundtrip: p.error ? 'failed' : loss ? 'loss' : unsupported ? 'partial' : 'preserved',
            exportedCompile: p.compile?.status === 'source-invalid' ? 'fail' : p.compile?.status || 'not-run',
            originalCompile: p.originalCompile?.status || 'not-run',
            runtime: 'not-measured', behavioralEquivalence: 'not-measured'};
        delete p.exportedFiles;
    }
    delete row.sourceFiles;
    return row;
}

const rows = [];
for (const file of files) {
    try { rows.push(await inspect(file)); }
    catch (error) { rows.push({file, status: 'failed', error: shortError(error)}); }
}
const tally = {};
for (const r of rows) {
    for (const p of r.paths || []) {
        const hasLoss = p.binaryAssetsNotRepresented ||
            p.differences && Object.values(p.differences).some(v => v.length);
        const hasUnsupported = r.importUnsupported?.length || p.exportUnsupported?.length ||
            p.importUnsupported?.length;
        const key = p.error ? 'failed' : p.compile?.status === 'fail' ? 'compile-failed' :
            p.compile?.status === 'source-invalid' ? 'source-invalid' :
            hasLoss ? 'loss' : hasUnsupported ? 'partial' : 'preserved';
        tally[`${p.label}: ${key}`] = (tally[`${p.label}: ${key}`] || 0) + 1;
    }
}
const report = {schema: 'brickwright/conversion-roundtrips/v1', generatedAt: new Date().toISOString(),
    provenance: finishProvenance(provenance),
    qualificationBoundary: 'Preserved describes measured structure and artwork only; runtime and behavioral equivalence are not measured.',
    gapRanking: rankGaps(rows, row => [
        ...(row.importUnsupported || []).map(x => `import: ${x}`),
        ...(row.paths || []).flatMap(p => [
            ...(p.exportUnsupported || []).map(x => `export: ${x}`),
            ...(p.importUnsupported || []).map(x => `reimport: ${x}`),
            ...(p.differences?.lostOpcodes || []).map(x => `lost opcode: ${x.name}`),
            ...(p.binaryAssetsNotRepresented ? ['binary assets absent from plain text'] : []),
            ...(p.error ? [`${p.label}: conversion error`] : [])
        ]), ...(row.error ? ['parse error'] : [])
    ]), count: rows.length, tally, rows};
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({count: rows.length, tally, report: out}, null, 2));
