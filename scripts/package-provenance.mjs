// Offline, explicit content verification. Lock metadata is not installed proof.
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readdirSync, lstatSync, readFileSync, writeFileSync, realpathSync, rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';

export function githubIdentityMatches(value, owner, name, sha) {
    const suffix = sha === undefined ? '' : `#${sha}`;
    return [
        `github:${owner}/${name}${suffix}`,
        `git+ssh://git@github.com/${owner}/${name}.git${suffix}`,
        `git+https://github.com/${owner}/${name}.git${suffix}`,
        `https://github.com/${owner}/${name}.git${suffix}`,
        ...(sha === undefined ? [`git@github.com:${owner}/${name}.git`] : [])
    ].includes(value);
}

/** Narrow architectural check, not verification of arbitrary dependencies. */
export function verifySingleEngineResolution(installedRoot) {
    const root = path.resolve(installedRoot);
    const expected = realpathSync(path.join(root, 'bw-board', 'package.json'));
    const fromUI = createRequire(realpathSync(path.join(root, 'bw-circuit-ui', 'package.json')));
    const actual = realpathSync(fromUI.resolve('bw-board/package.json'));
    if (actual !== expected) throw new Error(`bw-circuit-ui resolves a shadow bw-board: ${actual}; expected sibling ${expected}`);
    return Object.freeze({verified: 'single-engine-resolution', engineManifest: expected});
}

function files(dir, prefix = '', skipDependencies = false) {
    if (!lstatSync(dir).isDirectory() || lstatSync(dir).isSymbolicLink()) throw new Error(`unsupported package directory: ${dir}`);
    const result = [];
    for (const entry of readdirSync(dir).sort()) {
        // npm owns dependency installs separately; they are not this package's payload.
        if (!prefix && skipDependencies && entry === 'node_modules') continue;
        const relative = prefix ? `${prefix}/${entry}` : entry;
        const absolute = path.join(dir, entry), stat = lstatSync(absolute);
        if (stat.isSymbolicLink()) throw new Error(`unsupported package symlink: ${relative}`);
        if (stat.isDirectory()) result.push(...files(absolute, relative));
        else if (stat.isFile()) result.push(relative);
        else throw new Error(`unsupported package file: ${relative}`);
    }
    return result;
}

/** Trusted local Git object store + reviewed full commit, never the worktree.
 * Does not fetch, install dependencies, or execute package lifecycle scripts.
 * Throws on unavailable provenance, unsupported layouts, or any payload mismatch.
 */
export function verifyInstalledPackage({repoDir, installedDir, owner = 'CrispStrobe', name, sha}) {
    if (!/^[0-9a-f]{40}$/.test(sha || '') || !/^[a-z0-9-]+$/.test(name || '')) throw new Error('invalid package provenance identity');
    const git = args => execFileSync('git', ['--no-replace-objects', '-C', repoDir, ...args], {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024}).trim();
    if (!githubIdentityMatches(git(['remote', 'get-url', 'origin']), owner, name)) throw new Error(`source origin does not match ${owner}/${name}`);
    if (git(['rev-parse', '--verify', `${sha}^{commit}`]) !== sha) throw new Error('source is not the exact pinned commit');
    const tree = git(['ls-tree', '-rz', sha]);
    for (const item of tree.split('\0').filter(Boolean)) {
        if (!/^100(644|755) blob /.test(item)) throw new Error('source symlinks/submodules are unsupported');
    }
    const temp = mkdtempSync(path.join(tmpdir(), 'package-provenance-'));
    try {
        const source = path.join(temp, 'source'), expected = path.join(temp, 'expected');
        mkdirSync(source); mkdirSync(expected);
        git(['archive', '--format=tar', `--output=${path.join(temp, 'source.tar')}`, sha]);
        execFileSync('tar', ['-xf', path.join(temp, 'source.tar'), '-C', source]);
        const manifestBytes = readFileSync(path.join(source, 'package.json'));
        const manifest = JSON.parse(manifestBytes);
        if (manifest.name !== name) throw new Error(`pinned source package name is not ${name}`);
        // Some npm versions invoke prepare despite ignore-scripts. Remove lifecycle
        // definitions in the disposable pack input, then restore the exact pinned
        // manifest bytes in the expected payload. Never edit the source repository.
        delete manifest.scripts;
        writeFileSync(path.join(source, 'package.json'), JSON.stringify(manifest));
        const packed = JSON.parse(execFileSync('npm', ['pack', '--offline', '--ignore-scripts', '--json', '--pack-destination', temp], {
            cwd: source, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
            env: {...process.env, npm_config_ignore_scripts: 'true', npm_config_offline: 'true'}
        }));
        if (packed.length !== 1 || path.basename(packed[0].filename) !== packed[0].filename) throw new Error('unexpected npm pack result');
        execFileSync('tar', ['-xf', path.join(temp, packed[0].filename), '-C', expected]);
        const payload = path.join(expected, 'package');
        writeFileSync(path.join(payload, 'package.json'), manifestBytes);
        const wanted = files(payload), actual = files(installedDir, '', true);
        const wantedSet = new Set(wanted), actualSet = new Set(actual);
        const problems = [];
        for (const file of wanted) {
            if (!actualSet.has(file)) problems.push(`missing ${file}`);
            else if (!readFileSync(path.join(payload, file)).equals(readFileSync(path.join(installedDir, file)))) problems.push(`modified ${file}`);
        }
        for (const file of actual) if (!wantedSet.has(file)) problems.push(`unexpected ${file}`);
        if (problems.length) throw new Error(`${name}@${sha}: installed payload mismatch: ${problems.join(', ')}`);
        return Object.freeze({name, sha, files: wanted.length, verified: 'pinned-git-npm-pack-bytes', dependenciesVerified: false});
    } finally {
        rmSync(temp, {recursive: true, force: true});
    }
}
