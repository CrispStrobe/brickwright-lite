#!/usr/bin/env node
/** Inventory pinned MakeCode public declaration candidates. Does not measure compatibility. */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {censusTarget, verifyTargetVersions} from './lib/makecode-api-census.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
let runtimeRoot = path.join(ROOT, 'packages/scratch-gui/static/makecode');
let targets = ['arcade', 'microbit'], out, markdown;
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--runtime-root') runtimeRoot = args[++i];
    else if (args[i] === '--targets') targets = args[++i].split(',');
    else if (args[i] === '--out') out = args[++i];
    else if (args[i] === '--markdown') markdown = args[++i];
    else throw new Error(`Unknown option ${args[i]}`);
}
if (!out || !targets.length || targets.some(target => !/^[a-z0-9-]+$/.test(target))) {
    throw new Error('usage: node scripts/makecode-api-census.mjs --out report.json [--markdown report.md] [--targets arcade,microbit] [--runtime-root DIR]');
}
// Never substitute installed npm versions or fetch a different target implicitly.
if (!fs.existsSync(path.join(runtimeRoot, 'VERSIONS.json')) ||
    targets.some(target => !fs.existsSync(path.join(runtimeRoot, target, 'target.json')))) {
    throw new Error('Pinned MakeCode target bundle/versions missing; run npm run sync:makecode before the census.');
}
const guiRequire = createRequire(path.join(process.env.BW_INTEGRATED_ROOT || ROOT, 'packages/scratch-gui/package.json'));
const ts = guiRequire('typescript');
const versions = JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'VERSIONS.json'), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const report = {schema: 'brickwright/makecode-public-api-census/v1', generatedAt: new Date().toISOString(),
    parser: {name: 'typescript', version: ts.version},
    generator: {cliSha256: hash(fs.readFileSync(fileURLToPath(import.meta.url))),
        walkerSha256: hash(fs.readFileSync(new URL('./lib/makecode-api-census.mjs', import.meta.url)))},
    boundary: 'Declaration syntax only. Includes optional and mutually exclusive board packages; not a native capability or behavioural coverage denominator until visibility/dependencies are resolved.',
    limits: [
        'Publicness of top-level global script declarations requires review; locals inside callable bodies and private/protected class members are excluded.',
        'Only manifest files are visited; testFiles are excluded. Conditional file/dependency selection and target/project reachability are not evaluated.',
        'Overload declarations and implementation signatures remain separate labelled records; declaration counts are not distinct callable API counts. Exported helper/internal APIs are retained for review, not silently equated to user-facing blocks.',
        'PXT //% editor annotations are retained as raw lines and parsed scalar key entries; ambiguous annotation syntax remains named. Types are syntax, not compiler inference. Inheritance, alias/reexport expansion and implicit enum values are not resolved.',
        'No import, native pseudocode, Blocks, graphics editor, runtime or original export compatibility is inferred.'
    ], targets: []};
for (const target of targets) {
    if (!versions[target]?.target || !versions[target]?.core) throw new Error(`Pinned versions missing for ${target}`);
    const bytes = fs.readFileSync(path.join(runtimeRoot, target, 'target.json'));
    const bundle = JSON.parse(bytes);
    const bundleVersions = verifyTargetVersions(target, bundle, versions[target]);
    const result = censusTarget(ts, target, bundle, versions[target]);
    result.bundleVersions = bundleVersions;
    result.targetBundleSha256 = hash(bytes);
    report.targets.push(result);
}
fs.mkdirSync(path.dirname(path.resolve(out)), {recursive: true});
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
if (markdown) {
    const escape = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
    const lines = ['# Pinned MakeCode declaration census', '',
        `Generated ${report.generatedAt}; TypeScript parser ${report.parser.version}.`, '',
        report.boundary, '',
        'These are declaration records, including overload implementations and global-publicness candidates. They are not a percentage of MakeCode support.', '',
        '| Target | Target / core pins | Bundled packages | Source files | Declaration records | Callable records | Editor-annotated records | Global visibility candidates | Unresolved records |',
        '|---|---|---:|---:|---:|---:|---:|---:|---:|'];
    for (const result of report.targets) {
        const s = result.summary;
        lines.push(`| ${result.target} | ${result.versions.target} / ${result.versions.core} | ${s.packages} | ${s.sourceFiles} | ${s.declarations} | ${s.callableDeclarations} | ${s.metadataAnnotatedDeclarations} | ${s.globalPublicnessCandidates} | ${s.unresolved} |`);
    }
    for (const result of report.targets) {
        const families = new Map(), unresolved = new Map();
        for (const row of result.declarations) {
            const family = row.qualifiedName.split('.')[0] || '(unnamed)';
            families.set(family, (families.get(family) || 0) + 1);
        }
        for (const row of result.unresolved) unresolved.set(row.kind, (unresolved.get(row.kind) || 0) + 1);
        const sorted = map => [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        lines.push('', `## ${result.target}: declaration families`, '',
            `Target bundle SHA-256: \`${result.targetBundleSha256}\`.`, '',
            `Bundle target/core versions agree with the runtime manifest. Upstream source: ${escape(result.bundleVersions.sourceCommits || 'not recorded by bundle')}; tag \`${escape(result.bundleVersions.tag || 'not recorded')}\`.`, '',
            '| Qualified root family | Declaration records |', '|---|---:|',
            ...sorted(families).map(([family, count]) => `| ${escape(family)} | ${count} |`), '',
            '### Unresolved boundaries', '', '| Kind | Records |', '|---|---:|',
            ...sorted(unresolved).map(([kind, count]) => `| ${escape(kind)} | ${count} |`));
    }
    lines.push('', '## Interpretation and remaining census work', '',
        ...report.limits.map(limit => `- ${limit}`), '',
        'The core Arcade apiInfo table can be empty; this census reads the actual bundled manifest-listed TypeScript/declarations. Resolve candidates and package combinations before joining original signatures to native words, block schemas, resource editors, runtime and export evidence.', '',
        'Generator: [makecode-api-census.mjs](../../scripts/makecode-api-census.mjs). Authoring closure: [capability ledger](../CONVERSION-CAPABILITIES-AND-GUI-GAPS.md).', '');
    fs.mkdirSync(path.dirname(path.resolve(markdown)), {recursive: true});
    fs.writeFileSync(markdown, lines.join('\n'));
}
console.log(JSON.stringify({targets: report.targets.map(({target, summary}) => ({target, ...summary}))}));
