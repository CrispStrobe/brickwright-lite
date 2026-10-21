import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {admitInputRepository} from '../scripts/private-assessment/admit-input.mjs';

const gitExecutable = process.env.PRIVATE_ADMISSION_TEST_GIT || '/usr/bin/git';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const blobOid = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const git = (repository, args) => {
    const result = spawnSync(gitExecutable, ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false',
        '-C', repository, ...args], {encoding: 'utf8', env: {PATH: path.dirname(gitExecutable),
        LANG: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_AUTHOR_NAME: 'Synthetic input control', GIT_AUTHOR_EMAIL: 'synthetic@example.invalid',
        GIT_COMMITTER_NAME: 'Synthetic input control', GIT_COMMITTER_EMAIL: 'synthetic@example.invalid'}});
    assert.equal(result.status, 0, 'Owned synthetic Git setup must succeed');
    return result.stdout.trim();
};
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'private-assessment-input-'));
const repository = path.join(root, 'repository'); fs.mkdirSync(repository);
const source = 'let value = 1\n';
const originalOutcome = JSON.stringify({success: false, diagnostics: [{message: 'synthetic original failure retained'}]});
const rawInputs = Array.from({length: 184}, (_, index) => `corpus/raw/${String(index).padStart(3, '0')}.ts`);
const files = new Map(rawInputs.map(name => [name, Buffer.from(source)]));
files.set('corpus/context/source.txt', Buffer.from(source));
files.set('corpus/context/outcome.json', Buffer.from(originalOutcome));
const pxt = JSON.stringify({name: 'synthetic', dependencies: {device: '*'}, files: ['main.ts']});
const catalogue = {schema: 'brickwright/conversion-context-catalogue/v1', blobs: {
    source: {root: 'data', path: 'source.txt', encoding: 'utf8', bytes: Buffer.byteLength(source), sha256: sha(Buffer.from(source))},
    outcome: {root: 'data', path: 'outcome.json', encoding: 'json', bytes: Buffer.byteLength(originalOutcome), sha256: sha(Buffer.from(originalOutcome))}
}, subjects: Array.from({length: 41}, (_, index) => ({id: `context-${index}`, kind: 'RAW_BASELINE',
    target: 'arcade', name: 'synthetic', source: {blob: 'source'}, originalCompile: {blob: 'outcome'},
    rootFiles: [{name: 'main.ts', bytes: Buffer.byteLength(source), sha256: sha(Buffer.from(source))},
        {name: 'pxt.json', bytes: Buffer.byteLength(pxt), sha256: sha(Buffer.from(pxt))}]}))};
files.set('corpus/catalogue.json', Buffer.from(JSON.stringify(catalogue)));
for (const [name, bytes] of files) {
    const filename = path.join(repository, name); fs.mkdirSync(path.dirname(filename), {recursive: true}); fs.writeFileSync(filename, bytes);
}
fs.chmodSync(path.join(repository, rawInputs[0]), 0o755);
git(repository, ['init', '--quiet', '-b', 'main']); git(repository, ['add', '--all']);
git(repository, ['commit', '--quiet', '-m', 'Complete synthetic 225 inputs']);
const commit = git(repository, ['rev-parse', 'HEAD']);
const base = {schema: 'brickwright/private-assessment-input/v1', scope: 'corpus',
    files: [...files].map(([name, bytes]) => ({path: name, bytes: bytes.length, sha256: sha(bytes), gitBlobOid: blobOid(bytes)})),
    logicalSubjects: [...rawInputs.map((input, index) => ({id: `raw-${index}`, kind: 'raw', input})),
        ...catalogue.subjects.map(subject => ({id: subject.id, kind: 'context'}))],
    audit: {rawTarget: 'arcade', rawInputs, contextCatalogue: 'corpus/catalogue.json', contextRoots: {data: 'corpus/context'}},
    metadata: {synthetic: true, originalOutcomes: 'Opaque provided data, never rewritten'}};
let serial = 0;
const invoke = (manifest = structuredClone(base), overrides = {}) => {
    const id = serial++; const manifestPath = path.join(root, `manifest-${id}.json`);
    const bytes = Buffer.from(JSON.stringify(manifest)); fs.writeFileSync(manifestPath, bytes);
    return admitInputRepository({repositoryPath: repository, commit, manifestPath,
        expectedManifestSHA256: sha(bytes), stageRoot: path.join(root, `stage-${id}`), gitExecutable, ...overrides});
};
const refuses = (change, code, overrides) => {
    const manifest = structuredClone(base); change(manifest);
    assert.throws(() => invoke(manifest, overrides), error => error.code === code &&
        error.message === `Private input admission: ${code}` && !own(error, 'cause'));
};
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

test.after(() => {fs.rmSync(root, {recursive: true, force: true});});

test('complete actual Git 184+41 admission preserves bytes, original outcomes, order and CLI arguments', () => {
    const result = invoke(); const stage = result.proof.stageRoot;
    assert.equal(result.proof.fileCount, files.size); assert.equal(result.proof.commit, commit);
    assert.equal(result.proof.stagedBytes, [...files.values()].reduce((sum, bytes) => sum + bytes.length, 0));
    assert.equal(result.proof.inputBytes, result.proof.stagedBytes + result.proof.manifestBytes);
    assert.deepEqual(result.proof.logicalSubjects, base.logicalSubjects);
    assert.equal(result.proof.files[0].gitMode, '100755');
    for (const [name, bytes] of files) {
        const filename = path.join(stage, name); assert.deepEqual(fs.readFileSync(filename), bytes);
        assert.equal(fs.statSync(filename).mode & 0o777, 0o600);
        assert.equal(fs.statSync(path.dirname(filename)).mode & 0o777, 0o700);
    }
    const expected = ['--target', 'arcade', '--corpus-commit', commit, '--context-catalogue',
        path.join(stage, 'corpus/catalogue.json'), '--context-root', `data=${path.join(stage, 'corpus/context')}`,
        ...rawInputs.map(name => path.join(stage, name))];
    assert.deepEqual(result.auditArgs, expected);
    const opened = JSON.parse(fs.readFileSync(path.join(stage, 'corpus/catalogue.json'), 'utf8'));
    assert.deepEqual(opened, catalogue);
    assert.equal(opened.subjects.length, 41);
    for (let index = 0; index < 41; index++) {
        const subject = opened.subjects[index];
        const original = opened.blobs[subject.originalCompile.blob];
        assert.equal(fs.readFileSync(path.join(stage, base.audit.contextRoots[original.root], original.path), 'utf8'), originalOutcome);
        const sourceSpec = opened.blobs[subject.source.blob];
        assert.equal(fs.readFileSync(path.join(stage, base.audit.contextRoots[sourceSpec.root], sourceSpec.path), 'utf8'), source);
    }
    assert.equal(result.proof.executionGuardRequired, true);
});

test('Git bytes have no worktree, untracked, dirty-source or stale manifest fallback', () => {
    const filename = path.join(repository, rawInputs[1]); fs.writeFileSync(filename, 'PRIVATE_DIRTY_SENTINEL');
    const result = invoke(); assert.equal(fs.readFileSync(path.join(result.proof.stageRoot, rawInputs[1]), 'utf8'), source);
    fs.writeFileSync(filename, source);
    fs.writeFileSync(path.join(repository, 'corpus/raw/untracked.ts'), 'untracked');
    refuses(manifest => {const bytes = Buffer.from('untracked'); manifest.files.push({path: 'corpus/raw/untracked.ts', bytes: bytes.length, sha256: sha(bytes), gitBlobOid: blobOid(bytes)});}, 'GIT_FILE');
    refuses(manifest => {manifest.files[0].gitBlobOid = '1'.repeat(40);}, 'GIT_FILE');
    refuses(manifest => {manifest.files[0].sha256 = '0'.repeat(64);}, 'GIT_BYTES');
    refuses(() => {}, 'MANIFEST_HASH', {expectedManifestSHA256: '0'.repeat(64)});
    refuses(() => {}, 'IDENTITY', {commit: 'HEAD'});
    refuses(() => {}, 'GIT_REFUSED', {commit: '1'.repeat(40)});
});

test('literal path, prefix, count, size, duplicate identity and complete ordering controls refuse', () => {
    refuses(manifest => {manifest.files[0].path = 'corpus/../outside.ts';}, 'PATH');
    refuses(manifest => {manifest.files[0].path = '/outside.ts';}, 'PATH');
    refuses(manifest => {manifest.files[0].path = 'elsewhere/input.ts';}, 'FILE_PATH');
    refuses(manifest => {manifest.files.push({...manifest.files[0]});}, 'FILE_PATH');
    refuses(manifest => {manifest.files = Array(4097).fill(manifest.files[0]);}, 'FILE_COUNT');
    refuses(manifest => {manifest.files[0].bytes = 8 * 1024 ** 2 + 1;}, 'FILE_IDENTITY');
    refuses(manifest => {for (let index = 0; index < 9; index++) manifest.files[index].bytes = 8 * 1024 ** 2;}, 'INPUT_BOUND');
    refuses(manifest => {manifest.logicalSubjects.pop();}, 'SUBJECT_COUNT');
    refuses(manifest => {manifest.logicalSubjects[184].id = manifest.logicalSubjects[0].id;}, 'SUBJECT_ID');
    refuses(manifest => {manifest.logicalSubjects[0].kind = 'context';}, 'SUBJECT_ORDER');
    refuses(manifest => {manifest.audit.rawInputs.reverse();}, 'SUBJECT_ORDER');
    refuses(manifest => {manifest.logicalSubjects[184].id = 'different-context';}, 'CONTEXT_SUBJECT');
    refuses(manifest => {manifest.audit.limit = 1;}, 'SCHEMA');
});

test('context roots, original blob bindings and actual mixed-target CLI conflict fail closed', () => {
    refuses(manifest => {delete manifest.audit.contextRoots.data;}, 'CONTEXT_BLOB');
    refuses(manifest => {manifest.audit.contextRoots.data = 'corpus/missing';}, 'CONTEXT_ROOT');
    refuses(manifest => {manifest.audit.contextRoots['invalid=root'] = 'corpus/context';}, 'ROOT_ID');
    refuses(manifest => {manifest.audit.rawTarget = 'microbit';}, 'CURRENT_CLI_TARGET_CONFLICT');
    refuses(manifest => {manifest.files = manifest.files.filter(file => file.path !== 'corpus/context/source.txt');}, 'CONTEXT_BLOB');
});

test('actual Git symlink and submodule modes refuse without following targets', () => {
    const link = path.join(repository, 'corpus/link.ts'); fs.symlinkSync('raw/000.ts', link);
    git(repository, ['add', '--all']); git(repository, ['commit', '--quiet', '-m', 'Synthetic symlink negative']);
    const linkedCommit = git(repository, ['rev-parse', 'HEAD']); const linkBytes = Buffer.from('raw/000.ts');
    refuses(manifest => {
        manifest.files.push({path: 'corpus/link.ts', bytes: linkBytes.length, sha256: sha(linkBytes), gitBlobOid: blobOid(linkBytes)});
    }, 'GIT_FILE', {commit: linkedCommit});
    git(repository, ['update-index', '--add', '--cacheinfo', `160000,${commit},corpus/submodule.ts`]);
    git(repository, ['commit', '--quiet', '-m', 'Synthetic gitlink negative']);
    const submoduleCommit = git(repository, ['rev-parse', 'HEAD']);
    refuses(manifest => {manifest.files.push({path: 'corpus/submodule.ts', bytes: 0, sha256: sha(Buffer.alloc(0)), gitBlobOid: commit});},
        'GIT_FILE', {commit: submoduleCommit});
});

test('fresh private staging cannot overwrite existing paths, symlinks or a later mutated stage', () => {
    const existing = path.join(root, 'existing'); fs.mkdirSync(existing); fs.writeFileSync(path.join(existing, 'sentinel'), 'preserve');
    refuses(() => {}, 'STAGE_NOT_FRESH', {stageRoot: existing}); assert.equal(fs.readFileSync(path.join(existing, 'sentinel'), 'utf8'), 'preserve');
    const link = path.join(root, 'linked-stage'); fs.symlinkSync(existing, link);
    refuses(() => {}, 'STAGE_NOT_FRESH', {stageRoot: link});
    const nested = path.join(root, 'linked-parent'); fs.symlinkSync(existing, nested);
    refuses(() => {}, 'DIRECTORY', {stageRoot: path.join(nested, 'new-stage')});
    const result = invoke(); const selected = result.proof.files[0]; fs.writeFileSync(selected.stagedPath, 'after-return mutation');
    assert.notEqual(sha(fs.readFileSync(selected.stagedPath)), selected.sha256, 'Caller pre-execution guards must detect later edits');
    refuses(() => {}, 'STAGE_NOT_FRESH', {stageRoot: result.proof.stageRoot});
});

test('a pinned manifest is bounded regular data; parser uncertainty and Git errors expose no raw details', () => {
    const filename = path.join(root, 'duplicate-keys.json'); const bytes = Buffer.from('{"schema":1,"schema":2}'); fs.writeFileSync(filename, bytes);
    refuses(() => {}, 'ADMISSION_REFUSED', {manifestPath: filename, expectedManifestSHA256: sha(bytes)});
    const linked = path.join(root, 'linked-manifest'); fs.symlinkSync(filename, linked);
    refuses(() => {}, 'ADMISSION_REFUSED', {manifestPath: linked});
    // Call ORIGINAL native functions and append actual bytes after the admitted fstat.
    // This models a writer racing the read without manufacturing a stat/read result.
    const changing = path.join(root, 'growing-manifest.json');
    const initial = Buffer.from(JSON.stringify(base)); fs.writeFileSync(changing, initial);
    const identity = fs.statSync(changing); const originalFstat = fs.fstatSync; const originalRead = fs.readSync;
    let appended = false; let selectedFd = null; let actuallyRead = 0;
    try {
        fs.fstatSync = function (fd, ...args) {
            const observed = originalFstat.call(this, fd, ...args);
            if (!appended && observed.ino === identity.ino && observed.dev === identity.dev) {
                appended = true; selectedFd = fd; fs.appendFileSync(changing, Buffer.alloc(1024 * 1024, 32));
            }
            return observed;
        };
        fs.readSync = function (fd, ...args) {
            const count = originalRead.call(this, fd, ...args);
            if (fd === selectedFd) actuallyRead += count;
            return count;
        };
        refuses(() => {}, 'FILE_CHANGED', {manifestPath: changing, expectedManifestSHA256: sha(initial)});
    } finally {fs.fstatSync = originalFstat; fs.readSync = originalRead;}
    assert.equal(appended, true);
    assert.equal(actuallyRead, initial.length + 1, 'Read allocation/IO is bounded to initial admitted size plus one EOF probe');
    assert.ok(fs.statSync(changing).size > initial.length);
    const invalidRepository = path.join(root, 'PRIVATE_REPOSITORY_SENTINEL'); fs.mkdirSync(invalidRepository);
    const manifest = structuredClone(base);
    assert.throws(() => invoke(manifest, {repositoryPath: invalidRepository}), error =>
        error.message === 'Private input admission: GIT_REFUSED' && !String(error.stack).includes('PRIVATE_REPOSITORY_SENTINEL') &&
        !own(error, 'stdout') && !own(error, 'stderr') && !own(error, 'cause'));
});
