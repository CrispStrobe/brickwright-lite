/** Private local Git input admission. No fetch, converter, credential or logging API. */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {parsePrivateJSON} from './parse-json.mjs';

const LEAF = 8 * 1024 ** 2;
const TOTAL = 64 * 1024 ** 2;
const MAX_FILES = 4096;
const oid = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const blobOid = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const text = bytes => new TextDecoder('utf-8', {fatal: true}).decode(bytes);
const fail = code => {const error = new Error(`Private input admission: ${code}`); error.code = code; throw error;};
const requireFact = (value, code) => {if (!value) fail(code);};
const keys = (value, required, optional = []) => {
    requireFact(record(value) && required.every(key => own(value, key)) &&
        Object.keys(value).every(key => required.includes(key) || optional.includes(key)), 'SCHEMA');
};
const relative = value => {
    requireFact(typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= 1024 &&
        !/[\\\x00-\x1f\x7f]/.test(value) && !path.posix.isAbsolute(value) &&
        value.split('/').every(part => part && part !== '.' && part !== '..'), 'PATH');
    return value;
};
const inside = (prefix, name) => name.startsWith(prefix + '/');
const absolute = value => {
    requireFact(typeof value === 'string' && path.isAbsolute(value) && path.resolve(value) === value &&
        !/[\x00-\x1f\x7f]/.test(value), 'LOCAL_PATH');
    return value;
};
const directoryChain = value => {
    let current = path.parse(value).root;
    for (const part of value.slice(current.length).split('/').filter(Boolean)) {
        current = path.join(current, part);
        const stat = fs.lstatSync(current);
        requireFact(stat.isDirectory() && !stat.isSymbolicLink(), 'DIRECTORY');
    }
};
const regularRead = (filename, maximum) => {
    const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const before = fs.fstatSync(fd);
        requireFact(before.isFile() && before.size <= maximum, 'FILE_BOUND');
        const bytes = Buffer.alloc(before.size);
        let offset = 0;
        while (offset < bytes.length) {
            const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
            requireFact(count > 0, 'FILE_CHANGED'); offset += count;
        }
        const eof = Buffer.alloc(1);
        requireFact(fs.readSync(fd, eof, 0, 1, before.size) === 0, 'FILE_CHANGED');
        const after = fs.fstatSync(fd);
        requireFact(after.size === before.size &&
            before.dev === after.dev && before.ino === after.ino &&
            before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs, 'FILE_CHANGED');
        return bytes;
    } finally {fs.closeSync(fd);}
};

/** This function never authenticates a Git binary; the parent must admit the exact executable.
 * All returned paths/proofs are PRIVATE. Callers must not print this return value to Actions.
 * File ownership is not immutability: execution still needs independent before/after guards.
 */
export function admitInputRepository ({repositoryPath, commit, manifestPath,
    expectedManifestSHA256, stageRoot, gitExecutable}) {
    try {
        absolute(repositoryPath); absolute(manifestPath); absolute(stageRoot); absolute(gitExecutable);
        requireFact(oid(commit) && digest(expectedManifestSHA256), 'IDENTITY');
        directoryChain(repositoryPath); directoryChain(path.dirname(manifestPath));
        directoryChain(path.dirname(stageRoot)); directoryChain(path.dirname(gitExecutable));
        requireFact(fs.lstatSync(gitExecutable).isFile(), 'GIT_EXECUTABLE');
        requireFact(!fs.existsSync(stageRoot) && !fs.lstatSync(path.dirname(stageRoot)).isSymbolicLink(), 'STAGE_NOT_FRESH');
        // An existing dangling symlink also fails mkdir's exclusive admission below.
        const manifestBytes = regularRead(manifestPath, LEAF);
        requireFact(sha(manifestBytes) === expectedManifestSHA256, 'MANIFEST_HASH');
        const manifest = parsePrivateJSON(text(manifestBytes));
        keys(manifest, ['schema', 'scope', 'files', 'logicalSubjects', 'audit'], ['metadata']);
        requireFact(manifest.schema === 'brickwright/private-assessment-input/v1', 'SCHEMA');
        const scope = relative(manifest.scope);
        requireFact(Array.isArray(manifest.files) && manifest.files.length > 0 &&
            manifest.files.length <= MAX_FILES, 'FILE_COUNT');
        const declared = new Map(); let total = manifestBytes.length;
        for (const file of manifest.files) {
            keys(file, ['path', 'bytes', 'sha256', 'gitBlobOid']);
            relative(file.path);
            requireFact(inside(scope, file.path) && !declared.has(file.path), 'FILE_PATH');
            requireFact(Number.isSafeInteger(file.bytes) && file.bytes >= 0 && file.bytes <= LEAF &&
                digest(file.sha256) && oid(file.gitBlobOid), 'FILE_IDENTITY');
            total += file.bytes; requireFact(total <= TOTAL, 'INPUT_BOUND');
            declared.set(file.path, file);
        }
        keys(manifest.audit, ['rawTarget', 'rawInputs', 'contextCatalogue', 'contextRoots'], ['inputMode']);
        const audit = manifest.audit;
        const inputMode = own(audit, 'inputMode') ? audit.inputMode : 'positional-context';
        requireFact(['positional-context', 'catalogue'].includes(inputMode), 'INPUT_MODE');
        const catalogueOnly = inputMode === 'catalogue';
        requireFact(['microbit', 'arcade', 'calliopemini', 'ev3', 'adafruit'].includes(audit.rawTarget), 'RAW_TARGET');
        requireFact(Array.isArray(audit.rawInputs) && audit.rawInputs.length === (catalogueOnly ? 0 : 184) &&
            new Set(audit.rawInputs).size === audit.rawInputs.length && audit.rawInputs.every(name =>
                typeof name === 'string' && declared.has(name) &&
                ['.ts', '.hex', '.uf2', '.elf', '.sb3', '.mkcd', '.pxt', '.png'].includes(path.posix.extname(name).toLowerCase())), 'RAW_INPUTS');
        requireFact(typeof audit.contextCatalogue === 'string' && declared.has(audit.contextCatalogue) &&
            record(audit.contextRoots) && Object.keys(audit.contextRoots).length <= 64, 'CATALOGUE');
        for (const [id, directory] of Object.entries(audit.contextRoots)) {
            requireFact(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id), 'ROOT_ID');
            relative(directory);
            requireFact((directory === scope || inside(scope, directory)) &&
                [...declared.keys()].some(name => inside(directory, name)) && !declared.has(directory), 'CONTEXT_ROOT');
        }
        requireFact(Array.isArray(manifest.logicalSubjects) && manifest.logicalSubjects.length === 225, 'SUBJECT_COUNT');
        const ids = new Set();
        manifest.logicalSubjects.forEach((subject, index) => {
            keys(subject, !catalogueOnly && index < 184 ? ['id', 'kind', 'input'] : ['id', 'kind']);
            const identity = JSON.stringify([subject.kind, subject.id]);
            requireFact(typeof subject.id === 'string' && subject.id.length > 0 && subject.id.length <= 256 &&
                !/[\x00-\x1f\x7f]/.test(subject.id) && !ids.has(identity), 'SUBJECT_ID');
            ids.add(identity);
            requireFact(subject.kind === (catalogueOnly ? (index < 184 ? 'RAW_BASELINE' : 'RETAINED_CONTEXT') :
                (index < 184 ? 'raw' : 'context')) &&
                (catalogueOnly || index >= 184 || subject.input === audit.rawInputs[index]), 'SUBJECT_ORDER');
        });
        // Only fixed Git operations, never a revision:path expression or a caller pathspec.
        // These commands do not invoke hooks, filters, textconv, a shell or a remote.
        const git = (args, input, maximum) => {
            const result = spawnSync(gitExecutable, ['--no-replace-objects', '--no-optional-locks',
                '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false',
                '-c', 'core.attributesFile=/dev/null', '-c', 'core.pager=cat',
                '-c', 'protocol.allow=never', '-C', repositoryPath, ...args], {
                input, encoding: null, maxBuffer: maximum, timeout: 5000,
                windowsHide: true, shell: false,
                env: {PATH: path.dirname(gitExecutable), LANG: 'C', LC_ALL: 'C',
                    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_GLOBAL: '/dev/null',
                    GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1',
                    GIT_OPTIONAL_LOCKS: '0'}
            });
            // Do not attach raw stderr/stdout, paths, input text or cause to a thrown error.
            requireFact(!result.error && result.status === 0 && !result.signal, 'GIT_REFUSED');
            return result.stdout;
        };
        const actualCommit = text(git(['rev-parse', '--verify', `${commit}^{commit}`], undefined, 4096)).trim();
        requireFact(actualCommit === commit, 'COMMIT');
        const tree = git(['ls-tree', '-rz', '--full-tree', commit], undefined, LEAF);
        const entries = new Map();
        for (const line of text(tree).split('\0')) {
            if (!line) continue;
            const tab = line.indexOf('\t'); requireFact(tab > 0, 'GIT_TREE');
            const header = line.slice(0, tab).split(' '); const name = line.slice(tab + 1);
            requireFact(header.length === 3 && !entries.has(name), 'GIT_TREE');
            entries.set(name, {mode: header[0], type: header[1], oid: header[2]});
        }
        for (const file of manifest.files) {
            const entry = entries.get(file.path);
            requireFact(entry && entry.type === 'blob' && ['100644', '100755'].includes(entry.mode) &&
                entry.oid === file.gitBlobOid, 'GIT_FILE');
        }
        const batch = git(['cat-file', '--batch'], Buffer.from(manifest.files.map(file => file.gitBlobOid).join('\n') + '\n'),
            TOTAL + 1900000);
        let at = 0; const bodies = new Map();
        for (const file of manifest.files) {
            const newline = batch.indexOf(10, at); requireFact(newline >= at && newline - at < 128, 'GIT_BATCH');
            const header = text(batch.subarray(at, newline)).split(' ');
            requireFact(header.length === 3 && header[0] === file.gitBlobOid && header[1] === 'blob' &&
                header[2] === String(file.bytes), 'GIT_BATCH');
            at = newline + 1; const bytes = batch.subarray(at, at + file.bytes); at += file.bytes;
            requireFact(bytes.length === file.bytes && batch[at++] === 10 &&
                sha(bytes) === file.sha256 && blobOid(bytes) === file.gitBlobOid, 'GIT_BYTES');
            bodies.set(file.path, bytes);
        }
        requireFact(at === batch.length, 'GIT_BATCH');
        const catalogue = parsePrivateJSON(text(bodies.get(audit.contextCatalogue)));
        requireFact(record(catalogue) && catalogue.schema === 'brickwright/conversion-context-catalogue/v1' &&
            Array.isArray(catalogue.subjects) && catalogue.subjects.length === (catalogueOnly ? 225 : 41) && record(catalogue.blobs), 'CATALOGUE');
        catalogue.subjects.forEach((subject, index) => {
            const logical = manifest.logicalSubjects[(catalogueOnly ? 0 : 184) + index];
            requireFact(record(subject) && subject.id === logical.id &&
                (catalogueOnly ? subject.kind === logical.kind : ['RAW_BASELINE', 'RETAINED_CONTEXT'].includes(subject.kind)) &&
                ['microbit', 'arcade', 'calliopemini', 'ev3', 'adafruit'].includes(subject.target), 'CONTEXT_SUBJECT');
            // Current CLI's explicit --target checks every contextual target too.
            requireFact(subject.target === audit.rawTarget, 'CURRENT_CLI_TARGET_CONFLICT');
        });
        const roots = {catalogue: path.posix.dirname(audit.contextCatalogue), ...audit.contextRoots};
        for (const spec of Object.values(catalogue.blobs)) {
            requireFact(record(spec) && typeof spec.root === 'string' && own(roots, spec.root) &&
                ['utf8', 'json', 'gzip-json'].includes(spec.encoding), 'CONTEXT_BLOB');
            relative(spec.path);
            const name = roots[spec.root] + '/' + spec.path;
            const file = declared.get(name);
            requireFact(file && file.bytes === spec.bytes && file.sha256 === spec.sha256, 'CONTEXT_BLOB');
            if (spec.encoding === 'gzip-json') requireFact(Number.isSafeInteger(spec.decodedBytes) &&
                spec.decodedBytes >= 0 && spec.decodedBytes <= LEAF && digest(spec.decodedSHA256), 'CONTEXT_BLOB');
        }
        // Everything is verified before the first staged byte. On failure leave the owned
        // partial namespace for the root controller; never clean an unknown directory.
        fs.mkdirSync(stageRoot, {mode: 0o700}); fs.chmodSync(stageRoot, 0o700);
        const created = new Map(); const dirs = new Set([stageRoot]);
        for (const file of manifest.files) {
            const filename = path.join(stageRoot, ...file.path.split('/'));
            let parent = stageRoot;
            for (const part of file.path.split('/').slice(0, -1)) {
                parent = path.join(parent, part);
                if (!dirs.has(parent)) {fs.mkdirSync(parent, {mode: 0o700}); fs.chmodSync(parent, 0o700); dirs.add(parent);}
                const stat = fs.lstatSync(parent); requireFact(stat.isDirectory() && !stat.isSymbolicLink() &&
                    (stat.mode & 0o777) === 0o700, 'STAGE_CHANGED');
            }
            const fd = fs.openSync(filename, fs.constants.O_WRONLY | fs.constants.O_CREAT |
                fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
            try {
                fs.fchmodSync(fd, 0o600); fs.writeFileSync(fd, bodies.get(file.path));
                const stat = fs.fstatSync(fd); created.set(filename, {dev: stat.dev, ino: stat.ino});
            } finally {fs.closeSync(fd);}
        }
        const observed = new Set(); const pending = [stageRoot];
        while (pending.length) {
            const directory = pending.pop(); const stat = fs.lstatSync(directory);
            requireFact(dirs.has(directory) && stat.isDirectory() && !stat.isSymbolicLink() &&
                (stat.mode & 0o777) === 0o700, 'STAGE_CHANGED');
            for (const name of fs.readdirSync(directory)) {
                const filename = path.join(directory, name); const identity = created.get(filename);
                if (dirs.has(filename)) {pending.push(filename); continue;}
                requireFact(identity && !observed.has(filename), 'STAGE_CHANGED');
                const info = fs.lstatSync(filename); const relativeName = path.relative(stageRoot, filename).split(path.sep).join('/');
                const file = declared.get(relativeName);
                requireFact(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 &&
                    info.dev === identity.dev && info.ino === identity.ino && (info.mode & 0o777) === 0o600 &&
                    info.size === file.bytes && sha(regularRead(filename, LEAF)) === file.sha256, 'STAGE_CHANGED');
                observed.add(filename);
            }
        }
        requireFact(observed.size === declared.size, 'STAGE_CHANGED');
        const staged = name => path.join(stageRoot, ...name.split('/'));
        const auditArgs = ['--target', audit.rawTarget, '--corpus-commit', commit,
            '--context-catalogue', staged(audit.contextCatalogue)];
        for (const id of Object.keys(audit.contextRoots).sort()) auditArgs.push('--context-root', `${id}=${staged(audit.contextRoots[id])}`);
        auditArgs.push(...audit.rawInputs.map(staged));
        return {proof: {schema: 'brickwright/private-assessment-input-proof/v1',
            boundary: 'Pinned Git bytes verified and private regular files staged; no compiler or original outcome authentication.',
            repositoryPath, commit, expectedManifestSHA256, scope, stageRoot,
            files: manifest.files.map(file => ({...file, gitMode: entries.get(file.path).mode, stagedPath: staged(file.path)})),
            logicalSubjects: manifest.logicalSubjects.map(subject => ({...subject})),
            inputMode, rawInputCount: audit.rawInputs.length, catalogueSubjectCount: catalogue.subjects.length,
            semanticRawBaselineCount: audit.rawInputs.length + catalogue.subjects.filter(subject => subject.kind === 'RAW_BASELINE').length,
            semanticRetainedContextCount: catalogue.subjects.filter(subject => subject.kind === 'RETAINED_CONTEXT').length,
            fileCount: declared.size, inputBytes: total, manifestBytes: manifestBytes.length,
            stagedBytes: total - manifestBytes.length,
            catalogueTargets: catalogue.subjects.map(subject => subject.target),
            cliCommitVerifiedField: 'unchanged; external proof is separate',
            executionGuardRequired: true}, auditArgs};
    } catch (error) {
        if (error && /^[A-Z_]+$/.test(error.code || '') && error.message === `Private input admission: ${error.code}`) throw error;
        fail('ADMISSION_REFUSED');
    }
}
