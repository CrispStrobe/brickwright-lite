import assert from 'node:assert/strict';
import path from 'node:path';
import {accessSync, constants, readFileSync, realpathSync, statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

// The caller binds a concrete source-inspection tool. Never search PATH and
// never manufacture a source SHA from an environment or build-success label.
export function inspectGuiHarnessSource({root, executable}) {
    assert.ok(typeof executable === 'string' && path.isAbsolute(executable),
        'BW_GUI_GIT_EXECUTABLE must explicitly name an absolute Git executable');
    const absolutePath = realpathSync(executable);
    assert.ok(statSync(absolutePath).isFile(), 'Explicit Git binding must be a regular file');
    accessSync(absolutePath, constants.X_OK);
    const sha256 = createHash('sha256').update(readFileSync(absolutePath)).digest('hex');
    const env = {...process.env};
    // These commands inspect this checkout, not another repository selected by
    // a developer shell's Git overrides. Optional index writes are disabled.
    for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
    env.GIT_OPTIONAL_LOCKS = '0';
    const options = {cwd: root, encoding: 'utf8', env};
    const version = execFileSync(absolutePath, ['--version'], options).trim();
    assert.match(version, /^git version \d+\./, 'Explicit tool must identify its Git version');
    const observedRoot = execFileSync(absolutePath, ['rev-parse', '--show-toplevel'], options).trim();
    assert.equal(realpathSync(observedRoot), realpathSync(root), 'Git must inspect the actual harness root');
    const sourceSha = execFileSync(absolutePath, ['rev-parse', 'HEAD'], options).trim();
    assert.match(sourceSha, /^[0-9a-f]{40}$/, 'Actual harness checkout must have a complete commit ID');
    const dirty = execFileSync(absolutePath, ['status', '--porcelain', '--untracked-files=no'], options);
    assert.equal(dirty, '', 'Harness tracked source must match its reviewed checkout');
    return {sourceSha, tool: {absolutePath, sha256, version}};
}
