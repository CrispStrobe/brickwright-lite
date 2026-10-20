/** Execute each actual iOS build block with authored command shims.
 * This checks workflow wiring and failure propagation, not an app or IPA.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const source = readFileSync(new URL('../.github/workflows/mobile.yml', import.meta.url), 'utf8');
const prepare = 'node scripts/prepare-ios-device-build.mjs';
const init = 'npx tauri ios init --ci';
const builds = {
    ios: 'npx tauri ios build --target aarch64-sim',
    'ios-signed': 'npx tauri ios build --export-method app-store-connect',
    'ios-device': 'npx tauri ios build --target aarch64 --export-method release-testing'
};

// This deliberately supports the existing literal job/step shape only. It
// refuses a changed shape rather than treating a comment or another job as
// the executable call path. No YAML package is needed by these source tests.
function buildBlock(text, job) {
    const jobs = [...text.matchAll(/^  ([\w-]+):\n([\s\S]*?)(?=^  [\w-]+:|$(?![\s\S]))/gm)]
        .filter(m => m[1] === job);
    assert.equal(jobs.length, 1, `${job}: exactly one job`);
    const steps = [...jobs[0][2].matchAll(/^      - name: [^\n]+\n([\s\S]*?)(?=^      - |$(?![\s\S]))/gm)];
    const selected = steps.filter(m => /^          npx tauri ios init --ci$/m.test(m[1]));
    assert.equal(selected.length, 1, `${job}: one actual initialization step`);
    const step = selected[0][1];
    assert.equal((step.match(/^        working-directory: apps\/tauri$/gm) || []).length, 1,
        `${job}: Tauri working directory`);
    assert.equal((step.match(/^        run:/gm) || []).length, 1, `${job}: one executable block`);
    const run = step.match(/^        run: \|\n((?:          [^\n]*\n|\n)+)/m);
    assert.ok(run, `${job}: literal shell block`);
    return run[1].replace(/^          /gm, '');
}

// Exact reviewed executable lines, including the existing signed-job shell.
// Unknown shell is rejected before execution. All external commands below are
// authored shims; no Tauri, Node helper, signing tool or profile copy runs.
const allowed = new Set([
    init, prepare, ...Object.values(builds),
    'node scripts/patch-ios-privacy.mjs', 'node scripts/patch-mobile-icons.mjs ios',
    'node scripts/patch-ios-signing.mjs "$APPLE_DEVELOPMENT_TEAM" "$NAME"',
    'set -euo pipefail',
    'for v in IOS_CERTIFICATE IOS_CERTIFICATE_PASSWORD IOS_MOBILE_PROVISION; do',
    '  [ -n "${!v:-}" ] || { echo "::error::$v is not set — cannot sign."; exit 1; }',
    'done',
    'PROFDIR="$HOME/Library/MobileDevice/Provisioning Profiles"',
    'mkdir -p "$PROFDIR"',
    'echo "$IOS_MOBILE_PROVISION" | base64 --decode > "$RUNNER_TEMP/app.mobileprovision"',
    'security cms -D -i "$RUNNER_TEMP/app.mobileprovision" > "$RUNNER_TEMP/app.plist"',
    'UUID=$(plutil -extract UUID raw -o - "$RUNNER_TEMP/app.plist")',
    'NAME=$(plutil -extract Name raw -o - "$RUNNER_TEMP/app.plist")',
    'cp "$RUNNER_TEMP/app.mobileprovision" "$PROFDIR/$UUID.mobileprovision"',
    'echo "installed provisioning profile \'$NAME\' ($UUID)"',
    'plutil -extract ProvisionedDevices xml1 -o - "$RUNNER_TEMP/app.plist" >/dev/null 2>&1 \\',
    '  || { echo "::error::IOS_PROFILE_ADHOC_BASE64 has no ProvisionedDevices — that is an App Store profile, not an ad-hoc one."; exit 1; }'
]);

function execute(script, failPreparation = false) {
    for (const line of script.split('\n')) {
        if (!line.trim() || line.trimStart().startsWith('#')) continue;
        assert.ok(allowed.has(line), `unreviewed executable shell: ${line}`);
    }
    const dir = mkdtempSync(join(tmpdir(), 'ios-workflow-control-'));
    try {
        const bin = join(dir, 'bin'); mkdirSync(bin);
        const shim = `#!/bin/bash
command_name=\${0##*/}
printf '%s|%s\\n' "$command_name" "$*" >> "$TRACE"
case "$command_name" in
  node) if [[ "$1" == scripts/prepare-ios-device-build.mjs && "$FAIL_PREPARATION" == 1 ]]; then exit 37; fi ;;
  base64) printf 'AUTHORED_PROFILE' ;;
  security) printf 'AUTHORED_PLIST' ;;
  plutil) case "$2" in UUID) printf 'AUTHORED_UUID';; Name) printf 'AUTHORED_NAME';; ProvisionedDevices) printf '<array/>';; *) exit 38;; esac ;;
  npx|mkdir|cp) ;;
  *) exit 39 ;;
esac
`;
        for (const name of ['npx', 'node', 'mkdir', 'base64', 'security', 'plutil', 'cp']) {
            writeFileSync(join(bin, name), shim, {mode: 0o755});
        }
        const trace = join(dir, 'trace'); writeFileSync(trace, '');
        const result = spawnSync('/bin/bash', ['-e', '-o', 'pipefail', '-c', script], {
            cwd: dir, encoding: 'utf8', timeout: 5000,
            env: {...process.env, PATH: bin, TRACE: trace, RUNNER_TEMP: dir,
                IOS_CERTIFICATE: 'AUTHORED_CERTIFICATE', IOS_CERTIFICATE_PASSWORD: 'AUTHORED_PASSWORD',
                IOS_MOBILE_PROVISION: 'AUTHORED_PROFILE', APPLE_DEVELOPMENT_TEAM: 'AUTHORED_TEAM',
                FAIL_PREPARATION: failPreparation ? '1' : '0', BASH_ENV: '/dev/null', ENV: '/dev/null'}
        });
        assert.ifError(result.error);
        return {status: result.status, trace: readFileSync(trace, 'utf8').trim().split('\n'), stderr: result.stderr};
    } finally { rmSync(dir, {recursive: true, force: true}); }
}

function assertOrder(result, job) {
    assert.equal(result.status, 0, result.stderr);
    const position = command => {
        const [name, ...args] = command.split(' ');
        const entry = `${name}|${args.join(' ')}`;
        assert.equal(result.trace.filter(s => s === entry).length, 1, `${job}: execute ${command} exactly once`);
        return result.trace.indexOf(entry);
    };
    const initialized = position(init), prepared = position(prepare);
    assert.ok(initialized < prepared, `${job}: prepare after initialization`);
    for (const command of ['node scripts/patch-ios-privacy.mjs', 'node scripts/patch-mobile-icons.mjs ios', builds[job]]) {
        assert.ok(prepared < position(command), `${job}: prepare before ${command}`);
    }
    if (job !== 'ios') {
        assert.ok(prepared < position('node scripts/patch-ios-signing.mjs AUTHORED_TEAM AUTHORED_NAME'),
            `${job}: prepare before signing patch`);
    }
}

for (const job of Object.keys(builds)) {
    test(`${job}: actual build block prepares generated resources in order`, () => {
        assertOrder(execute(buildBlock(source, job)), job);
    });
    test(`${job}: preparation failure stops privacy, icons, signing and build`, () => {
        const result = execute(buildBlock(source, job), true);
        assert.equal(result.status, 37);
        assert.deepEqual(result.trace, ['npx|tauri ios init --ci', 'node|scripts/prepare-ios-device-build.mjs']);
    });
    test(`${job}: per-job removal, comment and before-init mutants are detected`, () => {
        const block = buildBlock(source, job);
        assert.equal(block.split(prepare).length - 1, 1);
        const mutants = [
            block.replace(`${prepare}\n`, ''),
            block.replace(prepare, `# ${prepare}`),
            block.replace(`${prepare}\n`, '').replace(init, `${prepare}\n${init}`)
        ];
        for (const script of mutants) assert.throws(() => assertOrder(execute(script), job));
    });
}

test('a helper call in another job or a comment cannot satisfy a missing build call', () => {
    for (const job of Object.keys(builds)) {
        const changed = source.replace(
            new RegExp(`(^  ${job}:\\n)([\\s\\S]*?)(?=^  [\\w-]+:|$(?![\\s\\S]))`, 'gm'),
            (_, header, body) => header + body.replace(/^          node scripts\/prepare-ios-device-build\.mjs\n/m, ''));
        assert.ok(changed !== source, 'mutant changed the actual selected job');
        assert.throws(() => assertOrder(execute(buildBlock(changed, job)), job));
        for (const other of Object.keys(builds).filter(name => name !== job)) {
            assertOrder(execute(buildBlock(changed, other)), other);
        }
    }
});

test('changed selection or unreviewed shell refuses before command execution', () => {
    assert.throws(() => buildBlock(source.replace(/^  ios:$/m, '  renamed:'), 'ios'));
    assert.throws(() => buildBlock(source.replaceAll('working-directory: apps/tauri', 'working-directory: elsewhere'), 'ios'));
    assert.throws(() => execute(`${buildBlock(source, 'ios')}\nunreviewed-command\n`), /unreviewed executable shell/);
});
