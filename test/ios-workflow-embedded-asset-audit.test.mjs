import test from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const workflow = readFileSync(new URL('../.github/workflows/mobile.yml', import.meta.url), 'utf8');
test('ad-hoc diagnostics print only device count and preserve the actual assertion', () => {
    assert.match(workflow, /DEVICE_COUNT=\$\(plutil -extract ProvisionedDevices xml1 -o - "\$WORK\/embedded.plist" \| grep -c '<string>'\)/);
    assert.match(workflow, /\[ "\$DEVICE_COUNT" -gt 0 \]/);
    assert.match(workflow, /plutil -extract ProvisionedDevices xml1 -o - \"\$WORK\/embedded.plist\" >\/dev\/null/);
    assert.doesNotMatch(workflow, /^\s*plutil -extract ProvisionedDevices[^\n]+\| grep '<string>'/m);
    assert.equal((workflow.match(/^\s*node scripts\/prepare-ios-device-build\.mjs$/gm) || []).length, 3);
});
test('asset source preparation adds no runtime download or delivery event', () => {
    assert.doesNotMatch(workflow, /simctl.*download|downloadPlatform|BW_EMBEDDED_ASSET_AUDIT_PATH/);
    assert.match(workflow, /if: startsWith\(github.ref, 'refs\/tags\/'\)/);
});
test('actual device-count shell keeps assertions and does not print authored identifiers', () => {
    const start = workflow.indexOf('          plutil -extract ProvisionedDevices xml1 -o - "$WORK/embedded.plist" >/dev/null');
    assert.ok(start > 0);
    const end = workflow.indexOf('          [ -f "$APP/PrivacyInfo.xcprivacy" ]', start);
    assert.ok(end > start);
    const script = workflow.slice(start, end).replace(/^          /gm, '');
    const dir = mkdtempSync(join(tmpdir(), 'bw-profile-count-'));
    try {
        writeFileSync(join(dir, 'plutil'), '#!/bin/sh\nprintf "%s\\n" "$PROFILE_XML"\nexit "${PROFILE_RC:-0}"\n', {mode: 0o755});
        const run = (text, xml, code = '0') => spawnSync('/bin/bash', ['-c', `set -euo pipefail\n${text}`], {
            encoding: 'utf8', env: {...process.env, PATH: `${dir}:${process.env.PATH}`, WORK: dir,
                PROFILE_XML: xml, PROFILE_RC: code}
        });
        const xml = '<array>\n<string>AUTHORED-DEVICE-A</string>\n<string>AUTHORED-DEVICE-B</string>\n</array>';
        const positive = run(script, xml);
        assert.equal(positive.status, 0, positive.stderr);
        assert.match(positive.stdout, /provisioned device count=2/);
        assert.doesNotMatch(positive.stdout + positive.stderr, /AUTHORED-DEVICE/);
        assert.notEqual(run(script, '<array/>').status, 0);
        assert.notEqual(run(script, '', '37').status, 0);
        const originalLeak = run(script.replace(' >/dev/null', ''), xml);
        assert.equal(originalLeak.status, 0);
        assert.match(originalLeak.stdout, /AUTHORED-DEVICE/, 'privacy control detects the original stdout leak');
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

const retentionBlock = workflow.match(/# BEGIN IOS INPUT RETENTION\n          cat > "\$RUNNER_TEMP\/bw-ios-audit-capture.py" <<'PY'\n([\s\S]*?)          PY\n          # END IOS INPUT RETENTION/);
assert.ok(retentionBlock, 'exact embedded retention producer');
const retention = retentionBlock[1].replace(/^          /gm, '');
const enabled = "github.event_name == 'workflow_dispatch' && inputs.retain_ios_audit_inputs && !inputs.sign_ios && !inputs.device_ipa && (github.ref == 'refs/heads/main' || github.ref == 'refs/heads/lane/ios-active-asset-source-20261018')";

function authoredRetention(source = retention) {
    const dir = mkdtempSync(join(tmpdir(), 'bw-ios-retention-'));
    const root = join(dir, 'checkout');
    const temp = join(dir, 'scratch');
    const bin = join(dir, 'bin');
    for (const path of [root, temp, bin]) mkdirSync(path);
    const put = (path, raw) => {
        const file = join(root, path);
        mkdirSync(join(file, '..'), {recursive: true});
        writeFileSync(file, raw);
    };
    const originals = {'apps/tauri/src-tauri/Cargo.lock': 'authored-lock', 'apps/tauri/src-tauri/src/lib.rs': 'authored-source'};
    for (const [path, raw] of Object.entries(originals)) put(path, raw);
    put('packages/scratch-gui/build/index.html', '<html>authored</html>');
    const app = 'apps/tauri/src-tauri/gen/apple/build/Authored.app';
    const plist = '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>authored</string><key>CFBundleSupportedPlatforms</key><array><string>iPhoneSimulator</string></array></dict></plist>';
    put(`${app}/Info.plist`, plist);
    put(`${app}/authored`, 'AUTHORED-NOT-A-REAL-EXECUTABLE');
    const codegen = 'target/aarch64-apple-ios-sim/release/build/brickwright-tauri-authored/out/tauri-codegen-assets';
    put(`${codegen}/authored.html`, 'AUTHORED-COMPRESSED-BYTES-NOT-ACTUAL-CODEGEN');
    for (const name of ['rustc', 'cargo', 'clang', 'xcodebuild']) put(`authored-tools/${name}`, `AUTHORED-${name}`);
    put('authored-sdk/SDKSettings.json', '{"Version":"18.0"}');
    const shim = `#!/usr/bin/python3
import json,os,pathlib,sys
name=pathlib.Path(sys.argv[0]).name
args=sys.argv[1:]
with open(os.environ['AUTHORED_COMMAND_LOG'],'a') as stream: stream.write(name+' '+str(args)+'\\n')
if os.environ.get('AUTHORED_FAIL') == name:
 print('PRIVATE-ERROR-MUST-NOT-LEAK',file=sys.stderr);sys.exit(37)
originals=json.loads(${JSON.stringify(JSON.stringify(originals))})
if name=='git':
 if args[0]=='ls-files': sys.stdout.buffer.write(('\\0'.join(sorted(originals))+'\\0').encode())
 elif args[0]=='show': sys.stdout.write(originals[args[1][5:]])
 elif args==['rev-parse','HEAD']: print('a'*40)
 elif args==['rev-parse','HEAD^{tree}']: print('b'*40)
 else: sys.exit(38)
elif name=='cargo' and args[0]=='metadata': print(json.dumps({'target_directory':str(pathlib.Path(os.environ['GITHUB_WORKSPACE'])/'target')}))
elif name=='rustup': print(str(pathlib.Path(os.environ['GITHUB_WORKSPACE'])/'authored-tools'/args[1]))
elif name=='xcrun' and args==['simctl','list','runtimes','--json']:
 import time
 time.sleep(float(os.environ.get('AUTHORED_INVENTORY_DELAY','0')))
 sys.stdout.write('x'*(2*1024*1024) if os.environ.get('AUTHORED_INVENTORY_OVERSIZED') else os.environ.get('AUTHORED_RUNTIME_JSON','{}'))
elif name=='xcrun' and '--find' in args: print(str(pathlib.Path(os.environ['GITHUB_WORKSPACE'])/'authored-tools'/args[-1]))
elif name=='xcrun' and '--show-sdk-path' in args: print(str(pathlib.Path(os.environ['GITHUB_WORKSPACE'])/'authored-sdk'))
elif name=='rustc': print('rustc authored\\nhost: authored-target')
elif name=='cargo': print('cargo authored')
elif name=='xcodebuild': print('Xcode authored\\nBuild version authored')
elif name=='xcrun': print('18.0')
else: sys.exit(39)
`;
    for (const name of ['git', 'cargo', 'rustc', 'rustup', 'xcodebuild', 'xcrun']) {
        writeFileSync(join(bin, name), shim, {mode: 0o755});
    }
    const script = join(dir, 'capture.py'); writeFileSync(script, source);
    const commandLog = join(dir, 'commands.log');
    const env = {...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_WORKSPACE: root, RUNNER_TEMP: temp,
        GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: 'CrispStrobe/brickwright-lite',
        GITHUB_REF: 'refs/heads/lane/ios-active-asset-source-20261018', GITHUB_SHA: 'a'.repeat(40),
        GITHUB_RUN_ID: '100', GITHUB_RUN_ATTEMPT: '2', GITHUB_JOB: 'ios', BW_RETAIN_IOS_INPUTS: 'true',
        BW_SIGN_IOS: 'false', BW_DEVICE_IPA: 'false', AUTHORED_COMMAND_LOG: commandLog};
    const run = (phase, overrides = {}) => spawnSync('/usr/bin/python3', [script, phase], {
        env: {...env, ...overrides}, encoding: 'utf8', timeout: 15000
    });
    return {dir, root, temp, app, codegen, put, run, commandLog, script,
        output: join(temp, 'bw-ios-audit-inputs'), clean: () => rmSync(dir, {recursive: true, force: true})};
}

function withRetention(body, source) {
    const fixture = authoredRetention(source);
    try { return body(fixture); } finally { fixture.clean(); }
}

function succeeded(result) {
    assert.equal(result.status, 0, result.stderr + result.stdout);
}
function refused(result) {
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /input retention refused/);
    assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE-ERROR-MUST-NOT-LEAK/);
}

test('retention input defaults off and every optional step has the unsigned exact-branch guard', () => {
    assert.match(workflow, /retain_ios_audit_inputs:\n[\s\S]*?type: boolean\n        default: false/);
    assert.equal(workflow.split(`if: ${enabled}`).length - 1, 2);
    assert.equal(workflow.split(`if: always() && (${enabled})`).length - 1, 2);
    const ios = workflow.slice(workflow.indexOf('\n  ios:\n'), workflow.indexOf('\n  ios-signed:\n'));
    assert.ok(ios.indexOf('Retain unsigned iOS inputs before build') < ios.indexOf('npx tauri ios init --ci'));
    assert.match(ios, /name: brickwright-ios-toolchain-inputs/);
    assert.ok(ios.indexOf('name: brickwright-ios-sim') < ios.indexOf('Retain unsigned iOS products after build'));
    assert.match(ios, /name: brickwright-ios-audit-inputs[\s\S]*?include-hidden-files: true[\s\S]*?if-no-files-found: error/);
    assert.doesNotMatch(retention, /devicectl|downloadPlatform|BW_EMBEDDED_ASSET_AUDIT_PATH/);
    assert.match(retention, /\['xcrun', 'simctl', 'list', 'runtimes', '--json'\]/);
});

test('actual embedded producer retains authored inputs and products with limited claims', () => withRetention(f => {
    succeeded(f.run('before')); succeeded(f.run('after'));
    const manifest = JSON.parse(readFileSync(join(f.output, 'completed.json')));
    assert.equal(manifest.status, 'retained-candidates-only');
    assert.equal(manifest.rawCodegenCandidates, 1);
    assert.equal(manifest.rawCodegenFiles, 1);
    assert.equal(manifest.commit, 'a'.repeat(40));
    for (const field of ['completeBuildInputGraphQualified', 'effectiveConfigurationJoined', 'compilerUsedInputsProved',
        'activeCodegenReferencesJoined', 'actualAppObserved', 'signedTargetJoined', 'resourceLifetimeQualified']) {
        assert.equal(manifest[field], false, field);
    }
    assert.ok(manifest.entries.some(row => row.path === 'native/executable'));
    assert.equal(readFileSync(join(f.output, 'web/index.html'), 'utf8'), '<html>authored</html>');
    assert.doesNotMatch(JSON.stringify(manifest), new RegExp(f.dir));
}));

test('disabled, signing, device, wrong-repository and tag requests refuse before reading inputs', () => {
    for (const overrides of [{BW_RETAIN_IOS_INPUTS: 'false'}, {BW_SIGN_IOS: 'true'}, {BW_DEVICE_IPA: 'true'},
        {GITHUB_EVENT_NAME: 'push'}, {GITHUB_REPOSITORY: 'upstream/repo'}, {GITHUB_REF: 'refs/tags/v0.0.0'},
        {GITHUB_REF: 'refs/heads/unreviewed'}]) {
        withRetention(f => {
            refused(f.run('before', overrides));
            assert.throws(() => readFileSync(f.commandLog));
        });
    }
});

test('retention refuses overwrite, command failure and changed or extra build inputs', () => {
    withRetention(f => { succeeded(f.run('before')); refused(f.run('before')); });
    withRetention(f => { refused(f.run('before', {AUTHORED_FAIL: 'rustc'})); });
    for (const [path, raw] of [['packages/scratch-gui/build/index.html', 'changed'],
        ['packages/scratch-gui/build/extra.js', 'new'], ['apps/tauri/src-tauri/src/lib.rs', 'changed']]) {
        withRetention(f => { succeeded(f.run('before')); f.put(path, raw); refused(f.run('after')); });
    }
});

test('missing, linked, ambiguous and non-simulator outputs refuse', () => {
    for (const edit of ['missing', 'symlink', 'directory-link', 'two-apps', 'device']) {
        withRetention(f => {
            succeeded(f.run('before'));
            if (edit === 'missing') rmSync(join(f.root, 'target'), {recursive: true});
            if (edit === 'symlink') symlinkSync(join(f.root, f.app, 'authored'), join(f.root, f.codegen, 'linked'));
            if (edit === 'directory-link') symlinkSync(join(f.root, f.codegen), join(f.root, f.codegen, 'linked-directory'));
            if (edit === 'two-apps') f.put('apps/tauri/src-tauri/gen/apple/build/Other.app/unused', 'x');
            if (edit === 'device') f.put(`${f.app}/Info.plist`, readFileSync(join(f.root, f.app, 'Info.plist'), 'utf8').replace('iPhoneSimulator', 'iPhoneOS'));
            refused(f.run('after'));
        });
    }
});

test('changed manifests, hidden private inputs and authored byte caps refuse', () => {
    withRetention(f => {
        succeeded(f.run('before'));
        const file = join(f.output, 'manifest.json');
        const manifest = JSON.parse(readFileSync(file)); manifest.actualAppObserved = true;
        writeFileSync(file, JSON.stringify(manifest)); refused(f.run('after'));
    });
    withRetention(f => { f.put('packages/scratch-gui/build/.env', 'AUTHORED-PRIVATE'); refused(f.run('before')); });
    withRetention(f => { refused(f.run('before')); }, retention.replace('TOTAL = 512 * 1024 * 1024', 'TOTAL = 8'));
});

test('post-build retention refuses changed launched producer bytes', () => withRetention(f => {
    succeeded(f.run('before'));
    writeFileSync(f.script, readFileSync(f.script, 'utf8') + '\n# authored changed controller\n');
    refused(f.run('after'));
}));

test('toolchain observations retain hashes only and bind stable before/after identities', () => withRetention(f => {
    succeeded(f.run('before')); succeeded(f.run('after'));
    const directory = join(f.temp, 'bw-ios-toolchain-inputs');
    const raw = readFileSync(join(directory, 'before.json'));
    const before = JSON.parse(raw);
    const after = JSON.parse(readFileSync(join(directory, 'after.json')));
    assert.equal(after.beforeSHA256, createHash('sha256').update(raw).digest('hex'));
    assert.equal(after.phase, 'after'); assert.equal(before.phase, 'before');
    assert.deepEqual(Object.keys(before.tools).sort(), ['appleClang', 'cargo', 'rustc', 'simulatorSDKSettings', 'xcodeBuild']);
    for (const [role, file] of [['rustc', 'authored-tools/rustc'], ['cargo', 'authored-tools/cargo'],
        ['appleClang', 'authored-tools/clang'], ['xcodeBuild', 'authored-tools/xcodebuild'],
        ['simulatorSDKSettings', 'authored-sdk/SDKSettings.json']]) {
        const bytes = readFileSync(join(f.root, file));
        assert.deepEqual(before.tools[role], {bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')});
    }
    assert.deepEqual(before.tools, after.tools);
    for (const flag of ['compilerUsedInputsProved', 'completeToolchainClosureQualified', 'sdkContentsQualified',
        'effectiveConfigurationJoined', 'actualAppObserved', 'resourceLifetimeQualified']) {
        assert.equal(before[flag], false); assert.equal(after[flag], false);
    }
    const manifest = JSON.parse(readFileSync(join(f.output, 'completed.json')));
    assert.equal(before.producerSHA256, manifest.entries.find(r => r.path === 'producer/capture.py').sha256);
    assert.doesNotMatch(raw.toString(), new RegExp(f.dir));
}));

test('changed tools, SDK settings, before identities and failed resolution refuse', () => {
    for (const path of ['authored-tools/rustc', 'authored-tools/clang', 'authored-sdk/SDKSettings.json']) {
        withRetention(f => { succeeded(f.run('before')); f.put(path, 'changed'); refused(f.run('after')); });
    }
    withRetention(f => {
        succeeded(f.run('before'));
        const file = join(f.temp, 'bw-ios-toolchain-inputs/before.json');
        const value = JSON.parse(readFileSync(file)); value.compilerUsedInputsProved = true;
        writeFileSync(file, JSON.stringify(value)); refused(f.run('after'));
    });
    withRetention(f => { refused(f.run('before', {AUTHORED_FAIL: 'rustup'})); });
});

test('runtime mutations expose changed-web and signing guard defects', () => {
    const old = 'need(read_file(local) == original)'; assert.ok(retention.includes(old));
    withRetention(f => {
        succeeded(f.run('before')); f.put('packages/scratch-gui/build/index.html', 'changed');
        succeeded(f.run('after'));
    }, retention.replace(old, 'need(True)'));
    const guard = "os.environ.get('BW_SIGN_IOS') == 'false'"; assert.ok(retention.includes(guard));
    withRetention(f => { succeeded(f.run('before', {BW_SIGN_IOS: 'true'})); }, retention.replace(guard, 'True'));
});

const runtimeID = 'com.apple.CoreSimulator.SimRuntime.iOS-18-0';
const runtimeRecord = {identifier: runtimeID, version: '18.0', buildversion: '22A3354', isAvailable: true,
    bundlePath: 'AUTHORED-PRIVATE-RUNTIME-PATH'};
function macho({cpu = 0x0100000c, platform = 7, minimum = 0x120000, commandSize = 24, count = 1} = {}) {
    const bytes = Buffer.alloc(56);
    [0xfeedfacf, cpu, 0, 2, count, 24, 0, 0, 0x32, commandSize, platform, minimum, 0x120000, 0]
        .forEach((n, index) => bytes.writeUInt32LE(n, index * 4));
    return bytes;
}
function withRuntime(body, source = retention, executable = macho()) {
    withRetention(f => {
        writeFileSync(join(f.dir, 'platform.py'), 'def system(): return "Darwin"\ndef machine(): return "arm64"\n');
        f.put(`${f.app}/authored`, executable);
        f.put(`${f.app}/Info.plist`, readFileSync(join(f.root, f.app, 'Info.plist'), 'utf8')
            .replace('</dict>', '<key>MinimumOSVersion</key><string>18.0</string></dict>'));
        succeeded(f.run('before')); succeeded(f.run('after'));
        const runtime = (overrides = {}) => f.run('runtime', {BW_IOS_AUDIT_RUNTIME: runtimeID,
            BW_IOS_AUDIT_RUNTIME_BUILD: '22A3354', AUTHORED_RUNTIME_JSON: JSON.stringify({runtimes: [runtimeRecord]}), ...overrides});
        const candidate = () => JSON.parse(readFileSync(join(f.temp, 'bw-ios-runtime-admission/candidate.json')));
        body({...f, runtime, candidate});
    }, source);
}

test('runtime admission is an optional guarded inventory step after retained products', () => {
    assert.match(workflow, /ios_audit_runtime:\n[\s\S]*?type: string\n        default: ''/);
    assert.match(workflow, /if: \(github.event_name[^\n]+inputs.ios_audit_runtime != ''/);
    assert.match(workflow, /if: always\(\) && inputs.ios_audit_runtime != '' && \(github.event_name/);
    assert.ok(workflow.indexOf('Retain unsigned iOS products after build') < workflow.indexOf('Admit installed unsigned iOS runtime candidate'));
    assert.match(workflow, /name: brickwright-ios-runtime-admission/);
    const runtimeBody = retention.slice(retention.indexOf('def runtime_admission()'), retention.indexOf('def owned_simulator_transaction('));
    assert.doesNotMatch(runtimeBody, /owned_simulator_transaction|(?:create|boot|install|launch|shutdown|delete)\(/);
    assert.equal((retention.match(/owned_simulator_transaction\(/g) || []).length, 1, 'definition only; no workflow caller');
});

test('actual runtime admission binds authored simulator header and retained inputs without launching', () => withRuntime(f => {
    succeeded(f.runtime());
    const value = f.candidate();
    assert.equal(value.status, 'runtime-candidate-only-launch-refused');
    assert.equal(value.runtimeIdentifier, runtimeID);
    assert.equal(value.runtimeBuild, '22A3354');
    assert.equal(value.executableSHA256, createHash('sha256').update(macho()).digest('hex'));
    assert.deepEqual(value.executableMinimumOS, [18, 0, 0]);
    for (const key of ['launchAllowed', 'actualAppObserved', 'deviceAdmitted', 'runtimeArchitectureQualified',
        'resourceLifetimeQualified', 'executableLoadabilityQualified', 'officialArtifactAuthenticated']) assert.equal(value[key], false);
    assert.doesNotMatch(JSON.stringify(value), /AUTHORED-PRIVATE|bundlePath/);
    const commands = readFileSync(f.commandLog, 'utf8');
    assert.equal(commands.split("['simctl', 'list', 'runtimes', '--json']").length - 1, 1);
    assert.doesNotMatch(commands, /'launch'|'install'|'boot'|'create'|'delete'|'shutdown'/);
    refused(f.runtime()); // Existing admission originals are never overwritten.
}));

test('runtime admission rejects missing, duplicate, unavailable, changed-build and too-old runtimes', () => {
    for (const runtimes of [[], [runtimeRecord, runtimeRecord], [{...runtimeRecord, isAvailable: false}],
        [{...runtimeRecord, isAvailable: 1}], [{...runtimeRecord, availabilityError: 'AUTHORED-PRIVATE-ERROR'}],
        [{...runtimeRecord, buildversion: '22A9999'}], [{...runtimeRecord, version: '17.0'}], [{...runtimeRecord, version: '19.0'}]]) {
        withRuntime(f => { refused(f.runtime({AUTHORED_RUNTIME_JSON: JSON.stringify({runtimes})})); assert.equal(f.candidate().status, 'partial'); });
    }
    withRuntime(f => refused(f.runtime({AUTHORED_RUNTIME_JSON: '{"runtimes":[],"runtimes":[]}'})));
    withRuntime(f => refused(f.runtime({AUTHORED_RUNTIME_JSON: 'not-json'})));
});

test('runtime admission rejects malformed requests and incompatible or malformed executable metadata', () => {
    for (const overrides of [{BW_IOS_AUDIT_RUNTIME: ''}, {BW_IOS_AUDIT_RUNTIME: '../unreviewed'},
        {BW_IOS_AUDIT_RUNTIME_BUILD: ''}, {BW_IOS_AUDIT_RUNTIME_BUILD: 'AUTHORED-PRIVATE'}]) {
        withRuntime(f => { refused(f.runtime(overrides)); assert.doesNotMatch(readFileSync(f.commandLog, 'utf8'), /'simctl'/); });
    }
    for (const binary of [Buffer.from('not-a-Mach-O'), macho({cpu: 0x01000007}), macho({platform: 2}),
        macho({commandSize: 8}), macho({count: 2}), macho({minimum: 0x110000})]) {
        withRuntime(f => { refused(f.runtime()); assert.doesNotMatch(readFileSync(f.commandLog, 'utf8'), /'simctl'/); }, retention, binary);
    }
});

test('runtime admission refuses changed originals, manifest identity, host architecture and failed inventory', () => {
    for (const name of ['native/executable', 'native/Info.plist', 'producer/capture.py']) {
        withRuntime(f => { writeFileSync(join(f.output, name), 'changed'); refused(f.runtime()); });
    }
    withRuntime(f => {
        const file = join(f.output, 'completed.json');const value = JSON.parse(readFileSync(file));
        value.job = 'other';writeFileSync(file, JSON.stringify(value));refused(f.runtime());
    });
    withRuntime(f => {
        writeFileSync(join(f.dir, 'platform.py'), 'def system(): return "Darwin"\ndef machine(): return "x86_64"\n');
        refused(f.runtime());
    });
    withRuntime(f => {
        const result = f.runtime({AUTHORED_FAIL: 'xcrun'});refused(result);
        assert.doesNotMatch(result.stdout + result.stderr + JSON.stringify(f.candidate()), /PRIVATE-ERROR-MUST-NOT-LEAK/);
    });
});

test('bounded runtime inventory refuses oversized command output', () => {
    withRuntime(f => refused(f.runtime({AUTHORED_INVENTORY_OVERSIZED: 'true'})));
    withRuntime(f => refused(f.runtime({AUTHORED_INVENTORY_DELAY: '0.5'})),
        retention.replace('deadline = time.monotonic() + 15', 'deadline = time.monotonic() + 0.05'));
});

test('runtime mutations demonstrate build and simulator-platform guards are live', () => {
    const buildGuard = "runtime['buildversion'] == build and ";assert.ok(retention.includes(buildGuard));
    withRuntime(f => { succeeded(f.runtime({BW_IOS_AUDIT_RUNTIME_BUILD: '22A9999'})); }, retention.replace(buildGuard, ''));
    const platformGuard = 'platform_id == 7 and ';assert.ok(retention.includes(platformGuard));
    withRuntime(f => { succeeded(f.runtime()); }, retention.replace(platformGuard, ''), macho({platform: 2}));
});

const lifecycleControls = String.raw`
import copy
import unittest
NEW = '11111111-1111-1111-1111-111111111111'
OLD = '22222222-2222-2222-2222-222222222222'
RUNTIME = 'com.apple.CoreSimulator.SimRuntime.iOS-18-0'
TYPE = 'com.apple.CoreSimulator.SimDeviceType.iPhone-16'
PLAN = {'schema':'brickwright.ios-owned-simulator-plan.v1','runtimeIdentifier':RUNTIME,
        'deviceTypeIdentifier':TYPE,'name':'bw-asset-audit-'+'a'*32,'bundleIdentifier':'com.example.authored',
        'appPath':'AUTHORED-PRIVATE-APP-PATH','sourceSHA256':'b'*64,'executableSHA256':'c'*64,
        'runtimeArchitectureAdmitted':True,'deviceModelAdmitted':True,'processEnvelopeAdmitted':True}
RAW = b'{"authoredOnly":true,"notAnAppObservation":true}'
class World:
    def __init__(self):
        self.time=0.;self.commands=[];self.fail=set();self.after_fail=set();self.created=NEW
        self.devices={OLD:{'udid':OLD,'name':'AUTHORED-OTHER-DEVICE','deviceTypeIdentifier':TYPE,'state':'Booted','isAvailable':True}}
        self.observer=lambda:RAW;self.bad_create=None;self.huge=False
    def now(self):return self.time
    def invoke(self,args,*,deadline,output_limit):
        assert self.time < deadline and output_limit==1024*1024
        self.time+=0.001;self.commands.append(args);op=args[0]
        if op in self.fail:raise RuntimeError('AUTHORED-PRIVATE-ERROR')
        value=b''
        if op=='list':
            value=json.dumps({'devices':{RUNTIME:list(self.devices.values())}}).encode()
            if self.huge:value=b'x'*(1024*1024+1)
        elif op=='create':
            self.devices[self.created]={'udid':self.created,'name':args[1],'deviceTypeIdentifier':args[2],'state':'Shutdown','isAvailable':True}
            value=(self.bad_create or self.created).encode()
        else:
            assert args[1] in self.devices and args[1] not in ('all','booted','unavailable')
            if op=='boot':self.devices[args[1]]['state']='Booted'
            elif op=='shutdown':self.devices[args[1]]['state']='Shutdown'
            elif op=='delete':del self.devices[args[1]]
            elif op=='launch':value=b'com.example.authored: 1234\n'
            else:assert op in ('bootstatus','install','terminate')
        if op in self.after_fail:raise RuntimeError('AUTHORED-PRIVATE-ERROR-AFTER-EFFECT')
        return value
    def observe(self,device,pid,*,deadline,output_limit):
        assert device==NEW and pid==1234 and self.time<deadline and output_limit==8*1024*1024
        return self.observer()
    def run(self,fn=owned_simulator_transaction,plan=None):
        return fn(copy.deepcopy(PLAN) if plan is None else plan,self.invoke,self.observe,self.now)
    def ops(self):return [a[0] for a in self.commands]
class LifecycleControls(unittest.TestCase):
    def test_normal_transaction_keeps_other_device_and_limited_claims(self):
        w=World();old=copy.deepcopy(w.devices[OLD]);r,raw=w.run()
        self.assertEqual(r['status'],'observed-transaction-only');self.assertEqual(raw,RAW)
        self.assertEqual(r['observationSHA256'],hashlib.sha256(RAW).hexdigest())
        self.assertEqual(w.devices,{OLD:old});self.assertTrue(r['cleanupAbsenceObserved'])
        self.assertLessEqual(r['activeCommands'],32);self.assertEqual(r['cleanupCommands'],7)
        for key in ('suppliedAdmissionAuthenticated','callbackBoundsQualified','resourceLifetimeQualified','actualAppQualified'):self.assertIs(r[key],False)
        self.assertEqual([op for op in w.ops() if op!='list'],['create','boot','bootstatus','install','launch','terminate','shutdown','delete'])
        self.assertNotIn('AUTHORED-PRIVATE',json.dumps(r));self.assertNotIn(NEW,json.dumps(r))
    def test_unadmitted_or_malformed_plan_never_calls_an_adapter(self):
        for field in ('runtimeArchitectureAdmitted','deviceModelAdmitted','processEnvelopeAdmitted'):
            for value in (False,1,None,'true'):
                w=World();p=copy.deepcopy(PLAN);p[field]=value
                with self.assertRaises(ValueError):w.run(plan=p)
                self.assertEqual(w.commands,[])
        for field,value in (('sourceSHA256','x'),('name','all'),('bundleIdentifier','../bad'),('appPath','bad\npath')):
            w=World();p=copy.deepcopy(PLAN);p[field]=value
            with self.assertRaises(ValueError):w.run(plan=p)
            self.assertEqual(w.commands,[])
    def test_unknown_or_reused_created_identity_never_becomes_a_cleanup_target(self):
        for identifier in ('all','booted','unavailable','invalid'):
            w=World();w.bad_create=identifier;r,_=w.run()
            self.assertTrue(r['creationUncertain']);self.assertNotIn('delete',w.ops());self.assertFalse(r['ownershipEstablished'])
        w=World();w.created=OLD;r,_=w.run()
        self.assertEqual(r['primaryFailure'],'create');self.assertNotIn('boot',w.ops());self.assertNotIn('delete',w.ops())
    def test_name_collision_refuses_before_create(self):
        w=World();w.devices[OLD]['name']=PLAN['name'];r,_=w.run()
        self.assertFalse(r['creationAttempted']);self.assertEqual(w.ops(),['list'])
    def test_failed_create_acknowledgement_retains_ownership_uncertainty(self):
        w=World();w.after_fail={'create'};r,_=w.run()
        self.assertEqual(r['primaryFailure'],'create');self.assertIn(NEW,w.devices)
        self.assertTrue(r['creationUncertain']);self.assertNotIn('delete',w.ops())
    def test_primary_failures_still_attempt_owned_cleanup(self):
        for op in ('boot','bootstatus','install','launch'):
            w=World();w.after_fail={op};r,raw=w.run()
            self.assertEqual(r['primaryFailure'],{'bootstatus':'boot-ready'}.get(op,op))
            self.assertIsNone(raw);self.assertTrue(r['cleanupAbsenceObserved']);self.assertNotIn(NEW,w.devices)
            self.assertEqual(w.devices[OLD]['name'],'AUTHORED-OTHER-DEVICE')
            if op=='launch':self.assertIn('terminate',w.ops())
    def test_cleanup_failures_do_not_skip_later_cleanup_or_erase_observation(self):
        for op in ('terminate','shutdown','delete'):
            w=World();w.fail={op};r,raw=w.run()
            self.assertEqual(r['status'],'partial');self.assertIn(op,r['cleanupFailures']);self.assertIsNone(r['primaryFailure'])
            self.assertEqual(raw,RAW);self.assertIn('delete',w.ops())
            self.assertEqual(r['cleanupAbsenceObserved'],op!='delete')
    def test_primary_and_cleanup_failures_are_both_preserved(self):
        w=World();w.fail={'terminate'}
        def fail():raise RuntimeError('AUTHORED-PRIVATE-OBSERVE-ERROR')
        w.observer=fail;r,raw=w.run();self.assertEqual(r['primaryFailure'],'observe')
        self.assertIn('terminate',r['cleanupFailures']);self.assertIsNone(raw);self.assertIn('delete',w.ops())
    def test_changed_identity_refuses_each_destructive_cleanup_operation(self):
        w=World()
        def replace():w.devices[NEW]['name']='AUTHORED-OTHER-OWNER';return RAW
        w.observer=replace;r,raw=w.run()
        self.assertEqual(raw,RAW);self.assertFalse(r['cleanupAbsenceObserved'])
        self.assertEqual([op for op in w.ops() if op in ('terminate','shutdown','delete')],[])
        self.assertEqual(r['cleanupFailures'],['terminate','shutdown','delete','absence-readback'])
    def test_late_observation_is_retained_as_partial_and_cleanup_has_its_own_budget(self):
        w=World()
        def late():w.time=91.;return RAW
        w.observer=late;r,raw=w.run();self.assertEqual(raw,RAW);self.assertEqual(r['primaryFailure'],'observe')
        self.assertTrue(r['cleanupAbsenceObserved']);self.assertEqual(r['status'],'partial')
    def test_backward_and_nonfinite_clocks_refuse_further_mutation(self):
        for tick in (-1.,float('nan'),float('inf')):
            w=World()
            def broken():w.time=tick;return RAW
            w.observer=broken;r,raw=w.run();self.assertEqual(r['primaryFailure'],'observe')
            self.assertIn('cleanup-clock',r['cleanupFailures']);self.assertNotIn('delete',w.ops())
            self.assertFalse(r['cleanupAbsenceObserved']);self.assertEqual(raw,RAW)
    def test_caller_mutation_cannot_retarget_cleanup(self):
        w=World();p=copy.deepcopy(PLAN)
        def mutate():p['name']='OTHER';p['bundleIdentifier']='other.app';return RAW
        w.observer=mutate;r,_=w.run(plan=p);self.assertTrue(r['cleanupAbsenceObserved'])
        self.assertIn(('terminate',NEW,'com.example.authored'),w.commands)
    def test_oversized_catalog_or_observation_remains_partial(self):
        w=World();w.huge=True;r,_=w.run();self.assertFalse(r['creationAttempted'])
        w=World();w.observer=lambda:b'x'*(8*1024*1024+1);r,raw=w.run()
        self.assertEqual(r['primaryFailure'],'observe');self.assertIsNone(raw);self.assertTrue(r['cleanupAbsenceObserved'])
    def test_adapter_deadlines_are_checked_on_return(self):
        w=World();original=w.invoke
        def late(args,**kwargs):
            raw=original(args,**kwargs);w.time=16.;return raw
        w.invoke=late;r,_=w.run();self.assertEqual(r['primaryFailure'],'initial-catalog')
        self.assertFalse(r['creationAttempted'])
        w=World()
        def late_observation():w.time=31.;return RAW
        w.observer=late_observation;r,raw=w.run();self.assertEqual(raw,RAW)
        self.assertEqual(r['primaryFailure'],'observe');self.assertTrue(r['cleanupAbsenceObserved'])
    def test_keyboard_interrupt_propagates_after_owned_cleanup(self):
        w=World()
        def interrupt():raise KeyboardInterrupt()
        w.observer=interrupt
        with self.assertRaises(KeyboardInterrupt):w.run()
        self.assertNotIn(NEW,w.devices);self.assertIn(OLD,w.devices)
    def test_runtime_mutants_expose_identity_guard_and_cleanup_continuation(self):
        source=SOURCE_PREFIX
        cut='need(identifier not in before)';self.assertIn(cut,source)
        namespace={};exec(compile(source.replace(cut,'need(True)'),'authored-mutant','exec'),namespace)
        w=World();w.created=OLD
        # The intentionally bad create callback already changed its row; the core
        # must still refuse to boot/delete a UUID that existed before this attempt.
        w.observe=lambda *a,**k:RAW
        r,_=w.run(namespace['owned_simulator_transaction']);self.assertNotIn(OLD,w.devices)
        self.assertTrue(r['ownershipEstablished'])
        cut="except Exception:\n                        result['cleanupFailures'].append(command)";self.assertTrue(cut in source,'cleanup continuation mutation anchor')
        namespace={};exec(compile(source.replace(cut,cut+'\n                        break'),'authored-mutant','exec'),namespace)
        w=World();w.fail={'terminate'};r,raw=w.run(namespace['owned_simulator_transaction'])
        self.assertNotIn('delete',w.ops());self.assertFalse(r['cleanupAbsenceObserved']);self.assertEqual(raw,RAW)
unittest.main(argv=['authored-lifecycle-controls'],verbosity=2)
`;

test('unwired owned simulator transaction core preserves identity, failures and cleanup', () => {
    const end = retention.lastIndexOf('\ntry:\n');
    assert.ok(end > 0, 'exclude the actual workflow entry point');
    const prefix = retention.slice(0, end);
    const dir = mkdtempSync(join(tmpdir(), 'bw-ios-owned-core-'));
    try {
        const result = spawnSync('/usr/bin/python3', ['-c', `${prefix}\nSOURCE_PREFIX = ${JSON.stringify(prefix)}\n${lifecycleControls}`], {
            env: {...process.env, GITHUB_WORKSPACE: dir, RUNNER_TEMP: dir}, encoding: 'utf8', timeout: 15000
        });
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stderr, /Ran 16 tests/);
        assert.match(result.stderr, /OK/);
    } finally { rmSync(dir, {recursive: true, force: true}); }
});
