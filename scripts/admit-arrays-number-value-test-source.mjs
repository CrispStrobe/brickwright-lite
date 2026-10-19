// Explicit offline input for the native Arrays tests. This decodes data only;
// it never imports/evaluates the supplier or substitutes an unreviewed source.
import {ARRAYS_PREFIX as PREFIX, ARRAYS_SUFFIX as SUFFIX} from './lib/arrays-carrier.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
export const ARRAYS_INPUT = Object.freeze({
    repo: 'CrispStrobe/extensions',
    commit: '1c7eb396173673c858e6c80a66529cb9dce87553',
    path: 'extensions/CrispStrobe/arrays.js',
    bytes: 108862,
    sha256: '28e88ecfbb26feedea25baaaffc9c9bc552c3d9c621c7c38eec71e334e71cca3',
    licence: 'MPL-2.0',
    outputDirectory: 'test-results/arrays-number-value-input',
    outputSource: 'test-results/arrays-number-value-input/arrays.js'
});
const CARRIER = 'overlay/scratch-vm/src/extensions/crispstrobe/arrays/index.js';
const MIRROR = 'packages/scratch-gui/node_modules/scratch-vm/src/extensions/crispstrobe/arrays/index.js';
const PINS = 'vendor-pins.json';
const RECEIPT = 'overlay/scratch-vm/src/extension-support/bundled-upstream-pins.json';
const NOTICE = 'THIRD-PARTY-NOTICES.md';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const requireFact = (ok, message) => {if (!ok) throw new Error(message);};

function heldRead(root, relative) {
    requireFact(Number.isInteger(fs.constants.O_NOFOLLOW), 'ARRAY_INPUT_NOFOLLOW_UNAVAILABLE');
    const fd = fs.openSync(path.join(root, relative), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const before = fs.fstatSync(fd, {bigint: true});
        requireFact(before.isFile() && before.size <= 1024n * 1024n, 'ARRAY_INPUT_REGULAR_SIZE');
        const bytes = fs.readFileSync(fd), after = fs.fstatSync(fd, {bigint: true});
        requireFact(BigInt(bytes.length) === before.size && ['dev', 'ino', 'mode', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs']
            .every(key => before[key] === after[key]), 'ARRAY_INPUT_CHANGED_DURING_READ');
        const text = bytes.toString('utf8');
        requireFact(Buffer.from(text, 'utf8').equals(bytes), 'ARRAY_INPUT_INVALID_UTF8');
        return {relativePath: relative, bytes, text, sha256: sha(bytes)};
    } finally {fs.closeSync(fd);}
}

export function admitArraysNumberValueTestSource(root = REPO) {
    const output = path.join(root, ARRAYS_INPUT.outputDirectory);
    try {fs.lstatSync(output); throw new Error('ARRAY_INPUT_OUTPUT_REUSE');}
    catch (error) {if (error.code !== 'ENOENT') throw error;}
    const pins = heldRead(root, PINS), record = heldRead(root, RECEIPT);
    requireFact(JSON.parse(pins.text)['arrays-values'] === ARRAYS_INPUT.commit, 'ARRAY_INPUT_PIN_MISMATCH');
    const actual = JSON.parse(record.text).files?.arrays;
    requireFact(actual && ['repo', 'commit', 'path', 'bytes', 'sha256'].every(key => actual[key] === ARRAYS_INPUT[key]),
        'ARRAY_INPUT_RECEIPT_MISMATCH');
    const carrier = heldRead(root, CARRIER), mirror = heldRead(root, MIRROR);
    requireFact(carrier.bytes.equals(mirror.bytes), 'ARRAY_INPUT_INSTALLED_MIRROR_MISMATCH');
    requireFact(carrier.text.startsWith(PREFIX) && carrier.text.endsWith(SUFFIX), 'ARRAY_INPUT_WRAPPER_SHAPE');
    const encoded = carrier.text.slice(PREFIX.length, -SUFFIX.length);
    let source;
    try {source = JSON.parse(encoded);} catch {throw new Error('ARRAY_INPUT_WRAPPER_JSON');}
    requireFact(typeof source === 'string' && JSON.stringify(source) === encoded &&
        carrier.text === PREFIX + JSON.stringify(source) + SUFFIX, 'ARRAY_INPUT_WRAPPER_CANONICAL_JSON');
    const body = Buffer.from(source, 'utf8');
    requireFact(body.length === ARRAYS_INPUT.bytes && sha(body) === ARRAYS_INPUT.sha256, 'ARRAY_INPUT_SOURCE_HASH');
    requireFact(/^\/\/ License: MPL-2\.0$/m.test(source), 'ARRAY_INPUT_SOURCE_LICENCE');
    const notice = heldRead(root, NOTICE), section = notice.text.split('## arrays-values — MPL-2.0\n')[1]?.split('\n## ')[0];
    const url = `https://github.com/${ARRAYS_INPUT.repo}/blob/${ARRAYS_INPUT.commit}/${ARRAYS_INPUT.path}`;
    requireFact(section && section.includes(url) && section.includes('Its declared\nlicense is MPL-2.0.') &&
        section.includes('https://www.mozilla.org/en-US/MPL/2.0/'), 'ARRAY_INPUT_NOTICE_LICENCE');
    // All source, pin, licence and installed-mirror checks precede output writes.
    const results = path.join(root, 'test-results');
    try {requireFact(fs.lstatSync(results).isDirectory() && !fs.lstatSync(results).isSymbolicLink(), 'ARRAY_INPUT_RESULTS_DIRECTORY');}
    catch (error) {if (error.code !== 'ENOENT') throw error; fs.mkdirSync(results);}
    fs.mkdirSync(output); // No recursive/reuse path: preserve partial output on failure.
    const provenance = {
        schema: 'brickwright.arrays-number-value-test-input.v1',
        supplier: {repo: ARRAYS_INPUT.repo, commit: ARRAYS_INPUT.commit, path: ARRAYS_INPUT.path,
            bytes: body.length, sha256: sha(body), licence: ARRAYS_INPUT.licence, sourceURL: url},
        outputSource: ARRAYS_INPUT.outputSource,
        inputs: [pins, record, carrier, mirror, notice].map(row => ({path: row.relativePath,
            bytes: row.bytes.length, sha256: row.sha256})),
        installedCanonicalMirrorEqual: true,
        scope: 'Explicit decoded pinned source input only; not supplier execution or native test qualification.'
    };
    fs.writeFileSync(path.join(output, 'arrays.js'), body, {flag: 'wx', mode: 0o444});
    fs.writeFileSync(path.join(output, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n', {flag: 'wx', mode: 0o444});
    requireFact(sha(fs.readFileSync(path.join(output, 'arrays.js'))) === ARRAYS_INPUT.sha256, 'ARRAY_INPUT_OUTPUT_READBACK');
    return provenance;
}

// Source policy for the actual fast-shard consumer, including its prerequisite
// and retained receipt. A passing decoder alone cannot wire a missing env input.
export function assertArraysNumberValueWorkflow(source) {
    const unit = [...source.matchAll(/^  unit:\n([\s\S]*?)(?=^  [a-z][\w-]*:|$(?![\s\S]))/gm)];
    requireFact(unit.length === 1, 'ARRAY_INPUT_WORKFLOW_UNIT');
    const body = unit[0][1], starts = [...body.matchAll(/^      - name: ([^\n]+)$/gm)];
    const steps = starts.map((m, index) => ({name: m[1], text: body.slice(m.index, starts[index + 1]?.index ?? body.length)}));
    const one = name => {const rows = steps.filter(s => s.name === name); requireFact(rows.length === 1, 'ARRAY_INPUT_WORKFLOW_STEP:' + name); return rows[0];};
    const overlay = one('Apply the scratch-vm overlay (built-in extensions)'),
        admission = one('Admit the pinned Arrays source for native unit inputs'), run = one('Run unit tests'), evidence = one('Preserve unit shard evidence');
    requireFact(steps.indexOf(overlay) < steps.indexOf(admission) && steps.indexOf(admission) < steps.indexOf(run), 'ARRAY_INPUT_WORKFLOW_ORDER');
    requireFact(admission.text.includes('id: arrays_number_value_source') &&
        admission.text.includes("if: ${{ !cancelled() && steps.overlays.outcome == 'success' }}") &&
        admission.text.includes('run: node scripts/admit-arrays-number-value-test-source.mjs'), 'ARRAY_INPUT_WORKFLOW_ADMISSION');
    requireFact(run.text.includes("steps.arrays_number_value_source.outcome == 'success'") &&
        run.text.includes('BW_ARRAY_NUMBER_VALUE_SOURCE: ${{ github.workspace }}/' + ARRAYS_INPUT.outputSource) &&
        run.text.includes('npm run test:fast:shard'), 'ARRAY_INPUT_WORKFLOW_ENV_OR_PREREQUISITE');
    requireFact(evidence.text.includes(ARRAYS_INPUT.outputDirectory + '/'), 'ARRAY_INPUT_WORKFLOW_RECEIPT_UPLOAD');
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
    requireFact(process.argv.length === 2, 'Usage: node scripts/admit-arrays-number-value-test-source.mjs');
    const receipt = admitArraysNumberValueTestSource();
    process.stdout.write(JSON.stringify({source: receipt.outputSource, sha256: receipt.supplier.sha256,
        bytes: receipt.supplier.bytes, licence: receipt.supplier.licence}) + '\n');
}
