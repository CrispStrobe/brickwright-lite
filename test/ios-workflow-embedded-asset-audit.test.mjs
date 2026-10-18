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
        const controller = join(dir, 'controls.py');
        writeFileSync(controller, `${prefix}\nSOURCE_PREFIX = ${JSON.stringify(prefix)}\n${lifecycleControls}`);
        const result = spawnSync('/usr/bin/python3', [controller], {
            env: {...process.env, GITHUB_WORKSPACE: dir, RUNNER_TEMP: dir}, encoding: 'utf8', timeout: 15000
        });
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stderr, /Ran 16 tests/);
        assert.match(result.stderr, /OK/);
    } finally { rmSync(dir, {recursive: true, force: true}); }
});

const adapterControls = String.raw`
import functools
import tempfile
import unittest
from unittest import mock
import shutil
import signal
ACTOR = r'''#!/usr/bin/python3
import json,os,sys,time
from pathlib import Path
ROOT=Path(__file__).parent
MODE=__MODE__
(ROOT/'pid.json').write_text(json.dumps({'leader':os.getpid()}))
if MODE in ('hang','orphan-pipes','orphan-closed'):
 if MODE!='hang':
  child=os.fork()
  if child:
   (ROOT/'pid.json').write_text(json.dumps({'leader':os.getpid(),'child':child}));os._exit(0)
  if MODE=='orphan-closed':
   os.close(1);os.close(2)
 time.sleep(30)
elif MODE=='exit':
 sys.stderr.write('AUTHORED-PRIVATE-STDERR');sys.exit(37)
elif MODE=='output':
 sys.stdout.write('a'*40);sys.stdout.flush();sys.stderr.write('b'*40)
elif MODE=='stdin':
 assert sys.stdin.buffer.read()==b'';print('stdin-closed')
elif MODE=='fd':
 try:
  info=os.fstat(__FD__);absent=(info.st_dev,info.st_ino)!=__IDENTITY__
 except OSError:absent=True
 print(json.dumps({'inheritedFileAbsent':absent}))
elif MODE=='replace-set':
 directory=Path(sys.argv[3]);directory.rename(directory.with_suffix('.old'));directory.mkdir();print('replaced')
elif MODE=='lifecycle':
 runtime='com.apple.CoreSimulator.SimRuntime.iOS-18-0';uid='11111111-1111-1111-1111-111111111111'
 statefile=ROOT/'state.json';state=json.loads(statefile.read_text()) if statefile.exists() else {}
 args=sys.argv[4:];command=args[0];out=''
 if command=='list':out=json.dumps({'devices':{runtime:list(state.values())}})
 elif command=='create':
  state[uid]={'udid':uid,'name':args[1],'deviceTypeIdentifier':args[2],'state':'Shutdown','isAvailable':True};out=uid
 elif command=='boot':state[uid]['state']='Booted'
 elif command=='launch':out='com.example.authored: 1234'
 elif command=='shutdown':state[uid]['state']='Shutdown'
 elif command=='delete':del state[uid]
 else:assert command in ('bootstatus','install','terminate')
 statefile.write_text(json.dumps(state));sys.stdout.write(out)
else:
 print(json.dumps({'args':sys.argv[1:],'clean':all(x not in os.environ for x in ('SIMCTL_CHILD_AUTHORED_SECRET','BW_AUTHORED_SECRET'))}))
'''
ARGS=('list','devices','--json')
class AdapterControls(unittest.TestCase):
    def setUp(self):
        self.root=Path(tempfile.mkdtemp(prefix='bw-ios-command-'))
        self.directory=self.root/('bw-ios-assets-'+'a'*32+'.deviceset');self.directory.mkdir()
        self.actor=self.root/'xcrun';self.write_actor('normal')
        self.environment=mock.patch.dict(os.environ,{'PATH':str(self.root)+os.pathsep+os.environ['PATH'],
            'SIMCTL_CHILD_AUTHORED_SECRET':'AUTHORED-SECRET','BW_AUTHORED_SECRET':'AUTHORED-SECRET'})
        self.environment.start()
    def tearDown(self):
        self.environment.stop();shutil.rmtree(self.root)
    def write_actor(self,mode):
        self.actor.write_text(ACTOR.replace('__MODE__',repr(mode)).replace('__FD__',str(getattr(self,'inherited_fd',-1))).replace('__IDENTITY__',repr(getattr(self,'inherited_identity',(-1,-1)))));self.actor.chmod(0o755)
    def run_command(self,args=ARGS,**kwargs):
        options=dict(device_set=self.directory,deadline=time.monotonic()+2,output_limit=1024)
        options.update(kwargs);return bounded_simulator_command(args,**options)
    def inactive(self,pid):
        # Linux test-host observation only: a zombie has stopped executing. Only
        # the direct leader is ours to reap; this is not a whole-descendant census.
        file=Path('/proc')/str(pid)/'stat'
        if file.exists():return file.read_text().split(') ',1)[1][0]=='Z'
        try:os.kill(pid,0)
        except ProcessLookupError:return True
        return False
    def assert_child_stopped(self):
        pid=json.loads((self.root/'pid.json').read_text())['child']
        until=time.monotonic()+2
        while time.monotonic()<until and not self.inactive(pid):time.sleep(0.01)
        self.assertTrue(self.inactive(pid),'owned test-group child stopped')
    def test_exact_namespace_argv_and_environment_filter(self):
        raw=self.run_command();value=json.loads(raw)
        self.assertEqual(value['args'],['simctl','--set',str(self.directory),*ARGS]);self.assertTrue(value['clean'])
    def test_stdin_is_closed_and_fd_count_is_stable(self):
        self.write_actor('stdin');before=len(os.listdir('/dev/fd'))
        for _ in range(5):self.assertEqual(self.run_command(),b'stdin-closed\n')
        self.assertEqual(len(os.listdir('/dev/fd')),before)
        fd=os.open(self.root/'private-input',os.O_CREAT|os.O_RDWR,0o600)
        try:
            os.set_inheritable(fd,True);info=os.fstat(fd);self.inherited_fd=fd;self.inherited_identity=(info.st_dev,info.st_ino)
            self.write_actor('fd');self.assertTrue(json.loads(self.run_command())['inheritedFileAbsent'])
            namespace={};cut='close_fds=True, env=environment';self.assertTrue(cut in SOURCE_PREFIX)
            exec(compile(SOURCE_PREFIX.replace(cut,'close_fds=False, env=environment'),'authored-fd-mutant','exec'),namespace)
            raw=namespace['bounded_simulator_command'](ARGS,device_set=self.directory,deadline=time.monotonic()+2,output_limit=1024)
            self.assertFalse(json.loads(raw)['inheritedFileAbsent'])
        finally:os.close(fd)
    def test_stdout_and_stderr_share_the_output_budget(self):
        self.write_actor('output')
        with self.assertRaises(SimulatorCommandRefused) as caught:self.run_command(output_limit=64)
        self.assertEqual(caught.exception.reason,'output')
    def test_exit_refusal_does_not_expose_stderr(self):
        self.write_actor('exit')
        with self.assertRaises(SimulatorCommandRefused) as caught:self.run_command()
        self.assertEqual(caught.exception.reason,'exit');self.assertNotIn('AUTHORED-PRIVATE',str(caught.exception))
    def test_absolute_deadline_kills_and_reaps_the_owned_leader(self):
        self.write_actor('hang')
        with self.assertRaises(SimulatorCommandRefused) as caught:self.run_command(deadline=time.monotonic()+0.3)
        self.assertEqual(caught.exception.reason,'deadline');pid=json.loads((self.root/'pid.json').read_text())['leader']
        with self.assertRaises(ChildProcessError):os.waitpid(pid,os.WNOHANG)
        self.assertTrue(self.inactive(pid))
    def test_exited_leader_with_inherited_pipes_still_times_out_and_cleans_group(self):
        self.write_actor('orphan-pipes')
        with self.assertRaises(SimulatorCommandRefused):self.run_command(deadline=time.monotonic()+0.4)
        self.assert_child_stopped()
    def test_same_group_child_is_signaled_even_after_both_pipes_close(self):
        self.write_actor('orphan-closed');self.run_command();self.assert_child_stopped()
    def test_group_signal_precedes_any_leader_reap(self):
        original_popen=subprocess.Popen;original_killpg=os.killpg;children=[]
        def spawn(*a,**k):
            child=original_popen(*a,**k);children.append(child);return child
        def signal_group(pid,sig):
            self.assertIsNone(children[0].returncode)
            os.waitid(os.P_PID,pid,os.WEXITED|os.WNOHANG|os.WNOWAIT)
            return original_killpg(pid,sig)
        with mock.patch.object(subprocess,'Popen',side_effect=spawn),mock.patch.object(os,'killpg',side_effect=signal_group):
            self.run_command()
        self.assertEqual(children[0].returncode,0)
        children.clear()
        with mock.patch.object(subprocess,'Popen',side_effect=spawn),mock.patch.object(os,'killpg',side_effect=signal_group):
            bounded_inventory()
        self.assertEqual(children[0].returncode,0)
    def test_stop_and_keyboard_interrupt_still_release_owned_resources(self):
        self.write_actor('hang');calls=[]
        def stop():calls.append(True);return len(calls)>2
        with self.assertRaises(SimulatorCommandRefused) as caught:self.run_command(stopped=stop)
        self.assertEqual(caught.exception.reason,'stop')
        original=selectors.DefaultSelector
        class InterruptingSelector(original):
            def select(self,*args,**kwargs):raise KeyboardInterrupt()
        children=[];popen=subprocess.Popen
        def spawn(*args,**kwargs):
            child=popen(*args,**kwargs);children.append(child);return child
        with mock.patch.object(selectors,'DefaultSelector',InterruptingSelector),mock.patch.object(subprocess,'Popen',side_effect=spawn):
            with self.assertRaises(KeyboardInterrupt):self.run_command()
        self.assertIsNotNone(children[0].returncode);self.assertTrue(children[0].stdout.closed)
    def test_argument_capability_and_namespace_failures_happen_before_spawn(self):
        for args in (('delete','all'),('boot','booted'),('erase','11111111-1111-1111-1111-111111111111'),('list','devices'),('launch','bad','com.example.authored')):
            with mock.patch.object(subprocess,'Popen') as spawn:
                with self.assertRaises(SimulatorCommandRefused):self.run_command(args)
                spawn.assert_not_called()
        for change in ({'output_limit':True},{'output_limit':1024*1024+1},{'deadline':float('nan')},
                       {'deadline':time.monotonic()-1},{'deadline':time.monotonic()+100}):
            with mock.patch.object(subprocess,'Popen') as spawn:
                with self.assertRaises(SimulatorCommandRefused):self.run_command(**change)
                spawn.assert_not_called()
        link=self.root/('bw-ios-assets-'+'b'*32+'.deviceset');link.symlink_to(self.directory,target_is_directory=True)
        with self.assertRaises(SimulatorCommandRefused):self.run_command(device_set=link)
        with mock.patch.object(os,'waitid',None),mock.patch.object(subprocess,'Popen') as spawn:
            with self.assertRaises(SimulatorCommandRefused):self.run_command()
            spawn.assert_not_called()
        with mock.patch.object(os,'waitid',create=True) as waitid:
            with mock.patch.object(signal,'getsignal',return_value=signal.SIG_IGN),mock.patch.object(subprocess,'Popen') as spawn:
                with self.assertRaises(SimulatorCommandRefused):self.run_command()
                spawn.assert_not_called()
        self.write_actor('replace-set')
        with self.assertRaises(SimulatorCommandRefused) as caught:self.run_command()
        self.assertEqual(caught.exception.reason,'device-set')
    def test_primary_failure_survives_cleanup_failure(self):
        self.write_actor('exit')
        with mock.patch.object(os,'killpg',side_effect=PermissionError('AUTHORED-PRIVATE')):
            with self.assertRaises(SimulatorCommandRefused) as caught:self.run_command()
        self.assertEqual(caught.exception.reason,'exit');self.assertIn('group-signal',caught.exception.cleanup_failures)
        original=os.waitid
        def interrupt_after_exit(*args):
            info=original(*args)
            if info is not None:raise KeyboardInterrupt()
            return info
        with mock.patch.object(os,'waitid',side_effect=interrupt_after_exit),mock.patch.object(os,'killpg',side_effect=PermissionError('AUTHORED-PRIVATE')):
            with self.assertRaises(KeyboardInterrupt) as caught:self.run_command()
        self.assertIn('group-signal',caught.exception.__notes__[0])
    def test_lifecycle_core_uses_real_subprocess_adapter_with_authored_commands_only(self):
        self.write_actor('lifecycle')
        plan={'schema':'brickwright.ios-owned-simulator-plan.v1','runtimeIdentifier':'com.apple.CoreSimulator.SimRuntime.iOS-18-0',
            'deviceTypeIdentifier':'com.apple.CoreSimulator.SimDeviceType.iPhone-16','name':'bw-asset-audit-'+'c'*32,
            'bundleIdentifier':'com.example.authored','appPath':str(self.root/'Authored.app'),'sourceSHA256':'d'*64,
            'executableSHA256':'e'*64,'runtimeArchitectureAdmitted':True,'deviceModelAdmitted':True,'processEnvelopeAdmitted':True}
        result,raw=owned_simulator_transaction(plan,functools.partial(bounded_simulator_command,device_set=self.directory),
            lambda *a,**k:b'{"authoredOnly":true}')
        self.assertEqual(result['status'],'observed-transaction-only');self.assertEqual(raw,b'{"authoredOnly":true}')
        self.assertTrue(result['cleanupAbsenceObserved']);self.assertIs(result['actualAppQualified'],False)
        self.assertEqual(json.loads((self.root/'state.json').read_text()),{})
    def test_runtime_output_budget_mutant_is_detected(self):
        namespace={};cut='need(used <= output_limit)';self.assertIn(cut,SOURCE_PREFIX)
        exec(compile(SOURCE_PREFIX.replace(cut,'need(True)'),'authored-output-mutant','exec'),namespace)
        self.write_actor('output')
        raw=namespace['bounded_simulator_command'](ARGS,device_set=self.directory,deadline=time.monotonic()+2,output_limit=64)
        self.assertEqual(len(raw),40) # Original rejects the 80 combined output bytes.
unittest.main(argv=['authored-command-adapter-controls'],verbosity=2)
`;

test('unwired bounded simctl adapter controls execute real owned subprocesses', () => {
    const prefix = retention.slice(0, retention.lastIndexOf('\ntry:\n'));
    const dir = mkdtempSync(join(tmpdir(), 'bw-ios-adapter-controls-'));
    try {
        const controller = join(dir, 'controls.py');
        writeFileSync(controller, `${prefix}\nimport selectors\nSOURCE_PREFIX = ${JSON.stringify(prefix)}\n${adapterControls}`);
        const result = spawnSync('/usr/bin/python3', [controller], {
            env: {...process.env, GITHUB_WORKSPACE: dir, RUNNER_TEMP: dir, TMPDIR: dir}, encoding: 'utf8', timeout: 20000
        });
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stderr, /Ran 13 tests/);
        assert.match(result.stderr, /OK/);
        assert.equal((retention.match(/bounded_simulator_command\(/g) || []).length, 1, 'adapter definition only');
    } finally { rmSync(dir, {recursive: true, force: true}); }
});

const receiverControls = String.raw`
import tempfile
import shutil
import unittest
import copy
from unittest import mock
PROFILE='tauri-2.11.5-utils-2.9.3-codegen-2.6.3-asset-config.v1'
def envelope():
    return {'schema':'brickwright.installed-asset-envelope.v2',
        'observation':{'schema':'brickwright.installed-asset-observation.v1','status':'complete-observation-only','refusal':None},
        'asset_config_projection':{'schema':'brickwright.asset-config-projection.v1','status':'complete-projection-only','refusal':None,
            'profile':PROFILE,'runtime_config_sha256':'c'*64,'values':{'dev_url_absent':True,'csp_absent':True,'dev_csp_absent':True,
            'pattern':'brownfield','freeze_prototype':False,'disable_asset_csp_modification':False,'asset_protocol_enabled':False},
            'full_configuration_joined':False,'raw_configuration_exposed':False,'compiler_inputs_proved':False},
        'source_label':'a'*40,'source_label_is_build_proof':False,'effective_config_sha256':'c'*64,'base_config_sha256':'b'*64,
        'executable_and_artifact_join':'required-external-independent-qualification','development_filesystem_fallback':False,
        'resolver_internal_fallback_excluded':False,'signed_target_map_joined':False,'resource_and_process_lifetime_admitted':False}
class ReceiverControls(unittest.TestCase):
    def setUp(self):
        self.root=Path(tempfile.mkdtemp(prefix='bw-ios-receiver-'));self.app=self.root/'Authored.app';self.app.mkdir()
        self.parent=self.root/'Documents';self.parent.mkdir();self.target=self.parent/'bw-embedded-asset-observation.json'
        self.exe=b'AUTHORED-NOT-AN-APPLE-EXECUTABLE';(self.app/'authored').write_bytes(self.exe)
        self.plist=plistlib.dumps({'CFBundleExecutable':'authored','CFBundleIdentifier':'com.example.authored','CFBundleSupportedPlatforms':['iPhoneSimulator']})
        (self.app/'Info.plist').write_bytes(self.plist);self.time=0.;self.samples=0;self.action=lambda:None
        self.spec={'schema':'brickwright.ios-installed-observation-plan.v1','appDirectory':str(self.app),'bundleIdentifier':'com.example.authored',
            'executableSHA256':hashlib.sha256(self.exe).hexdigest(),'plistSHA256':hashlib.sha256(self.plist).hexdigest(),
            'receiptPath':str(self.target),'sourceCommit':'a'*40,'baseConfigSHA256':'b'*64}
    def tearDown(self):shutil.rmtree(self.root)
    def prepare(self,cls=PreparedInstalledObservation):return cls(self.spec,deadline=self.time+10,now=lambda:self.time)
    def write(self,value=None):
        raw=json.dumps(envelope() if value is None else value,separators=(',',':')).encode();self.target.write_bytes(raw);return raw
    def sample(self,pid):
        self.samples+=1;self.action();return {'pid':pid,'identitySHA256':'e'*64,'rssBytes':4096}
    def pause(self,seconds):self.time+=seconds
    def capture(self,receiver,**kwargs):
        args=dict(deadline=self.time+1,output_limit=8*1024*1024,pause=self.pause);args.update(kwargs)
        return receiver.capture(55,'e'*64,self.sample,**args)
    def test_ready_header_is_retained_without_content_or_app_qualification(self):
        before=len(os.listdir('/dev/fd'));receiver=self.prepare();raw=self.write();meta,got=self.capture(receiver)
        self.assertEqual(got,raw);self.assertEqual(meta['status'],'captured-header-only');self.assertTrue(meta['installedFilesStable'])
        self.assertEqual(meta['rawSHA256'],hashlib.sha256(raw).hexdigest());self.assertEqual(meta['sampledPeakRSSBytes'],4096)
        for key in ('samplerAuthenticated','hardMemoryLimitQualified','runningExecutableJoined','assetContentsJoined','actualAppQualified'):self.assertIs(meta[key],False)
        self.assertTrue(meta['receiverClosed']);self.assertEqual(len(os.listdir('/dev/fd')),before)
        self.assertNotIn('AUTHORED',json.dumps(meta));self.assertNotIn(str(self.root),json.dumps(meta))
    def test_absent_and_partial_original_can_grow_to_complete(self):
        receiver=self.prepare();calls=[]
        def grow(seconds):
            self.pause(seconds);calls.append(True)
            if len(calls)==1:self.target.write_bytes(b'{')
            elif len(calls)==2:self.write()
        meta,raw=self.capture(receiver,pause=grow);self.assertEqual(meta['status'],'captured-header-only');self.assertEqual(meta['polls'],2)
    def test_timeout_and_stop_preserve_partial_raw_and_close_descriptors(self):
        receiver=self.prepare();self.target.write_bytes(b'{');meta,raw=self.capture(receiver)
        self.assertEqual(meta['status'],'partial');self.assertEqual(meta['refusal'],'deadline');self.assertEqual(raw,b'{');self.assertTrue(meta['receiverClosed'])
        self.target.unlink();receiver=self.prepare();meta,raw=self.capture(receiver,stopped=lambda:True)
        self.assertEqual(meta['refusal'],'stop');self.assertIsNone(raw);self.assertTrue(meta['receiverClosed'])
    def test_prepare_refuses_existing_output_and_changed_installed_inputs(self):
        self.target.write_bytes(b'old')
        with self.assertRaises(ValueError):self.prepare()
        self.target.unlink();(self.app/'authored').write_bytes(b'changed');before=len(os.listdir('/dev/fd'))
        with self.assertRaises(ValueError):self.prepare()
        self.assertEqual(len(os.listdir('/dev/fd')),before)
    def test_symlink_fifo_and_hardlink_outputs_are_refused_without_blocking(self):
        for kind in ('symlink','fifo','hardlink'):
            receiver=self.prepare();other=self.root/'other';other.write_bytes(json.dumps(envelope()).encode())
            if kind=='symlink':self.target.symlink_to(other)
            elif kind=='fifo':os.mkfifo(self.target)
            else:os.link(other,self.target)
            meta,raw=self.capture(receiver);self.assertEqual(meta['refusal'],'receipt-read');self.assertIsNone(raw);self.assertTrue(meta['receiverClosed'])
            self.target.unlink();other.unlink()
    def test_replaced_original_inode_or_parent_is_not_a_new_receipt(self):
        receiver=self.prepare();self.target.write_bytes(b'{')
        def replace(seconds):self.pause(seconds);self.target.unlink();self.write()
        meta,raw=self.capture(receiver,pause=replace);self.assertEqual(meta['refusal'],'receipt-read');self.assertEqual(raw,b'{')
        self.target.unlink();receiver=self.prepare();self.parent.rename(self.root/'old-documents');self.parent.mkdir();self.write()
        meta,raw=self.capture(receiver);self.assertEqual(meta['refusal'],'receipt-read');self.assertIsNone(raw)
    def test_pid_identity_and_sampled_rss_threshold_refuse(self):
        for snapshot in ({'pid':56,'identitySHA256':'e'*64,'rssBytes':1},{'pid':55,'identitySHA256':'f'*64,'rssBytes':1},
            {'pid':55,'identitySHA256':'e'*64,'rssBytes':True},{'pid':55,'identitySHA256':'e'*64,'rssBytes':1024*1024*1024+1}):
            receiver=self.prepare();self.write();meta,raw=receiver.capture(55,'e'*64,lambda _:snapshot,deadline=self.time+1,output_limit=8192,pause=self.pause)
            self.assertEqual(meta['refusal'],'process-sample');self.assertIsNone(raw);self.target.unlink()
    def test_changed_installed_file_or_late_sample_remains_partial(self):
        receiver=self.prepare();raw=self.write()
        def change():
            if self.samples==2:(self.app/'authored').write_bytes(b'changed')
        self.action=change;meta,got=self.capture(receiver);self.assertEqual(meta['refusal'],'installed-files');self.assertEqual(got,raw)
        (self.app/'authored').write_bytes(self.exe);self.target.unlink();self.samples=0;receiver=self.prepare();raw=self.write()
        def late():
            if self.samples==2:self.time+=2
        self.action=late;meta,got=self.capture(receiver);self.assertEqual(meta['refusal'],'process-sample');self.assertEqual(got,raw)
    def test_complete_partial_or_wrong_header_and_typed_profile_refuse(self):
        edits=[lambda v:v.update(source_label='f'*40),lambda v:v.update(extra=False),lambda v:v.update(base_config_sha256='f'*64),
            lambda v:v.update(source_label_is_build_proof=True),lambda v:v['observation'].update(status='partial'),
            lambda v:v['asset_config_projection'].update(status='partial',values=None),
            lambda v:v['asset_config_projection']['values'].update(csp_absent=1),lambda v:v['asset_config_projection'].update(runtime_config_sha256='f'*64)]
        for edit in edits:
            receiver=self.prepare();value=envelope();edit(value);raw=self.write(value);meta,got=self.capture(receiver)
            self.assertEqual(meta['refusal'],'receipt-header');self.assertEqual(got,raw);self.target.unlink()
    def test_nonfinite_duplicate_and_output_budget_refuse(self):
        for raw in (b'{"schema":1,"schema":2}',b'{"value":NaN}',b'{"value":1.5}'):
            receiver=self.prepare();self.target.write_bytes(raw);meta,_=self.capture(receiver);self.assertEqual(meta['refusal'],'receipt-header');self.target.unlink()
        receiver=self.prepare();self.write();meta,raw=self.capture(receiver,output_limit=8)
        self.assertEqual(meta['refusal'],'receipt-read');self.assertIsNone(raw)
    def test_closed_receiver_and_double_close_cannot_close_a_reused_fd(self):
        receiver=self.prepare();self.write();self.capture(receiver)
        fd=os.open(self.root/'other',os.O_CREAT|os.O_RDWR,0o600)
        try:receiver.close();os.fstat(fd)
        finally:os.close(fd)
        self.target.unlink();receiver=self.prepare()
        def close():receiver.close()
        self.action=close;meta,_=self.capture(receiver);self.assertEqual(meta['refusal'],'process-sample');self.assertTrue(meta['receiverClosed'])
    def test_keyboard_interrupt_closes_owned_descriptors(self):
        receiver=self.prepare();before=len(os.listdir('/dev/fd'))
        def interrupt(_):raise KeyboardInterrupt()
        with self.assertRaises(KeyboardInterrupt):receiver.capture(55,'e'*64,interrupt,deadline=1,output_limit=8192,pause=self.pause)
        self.assertTrue(receiver._closed);self.assertEqual(len(os.listdir('/dev/fd')),before-1)
    def test_plan_copy_and_end_of_read_fingerprint_are_live(self):
        receiver=self.prepare();self.spec['sourceCommit']='f'*40;raw=self.write();meta,got=self.capture(receiver)
        self.assertEqual(meta['status'],'captured-header-only');self.assertEqual(got,raw)
        self.target.unlink();self.spec['sourceCommit']='a'*40;self.samples=0;receiver=self.prepare();raw=self.write()
        def replace_contents():
            if self.samples==2:self.target.write_bytes(b'{"changed":true}')
        self.action=replace_contents;meta,got=self.capture(receiver);self.assertEqual(meta['refusal'],'receipt-readback');self.assertEqual(got,raw)
    def test_capture_is_one_shot_and_reentrant_calls_cannot_take_descriptors(self):
        receiver=self.prepare();raw=self.write()
        def nested():
            with self.assertRaises(ValueError):self.capture(receiver)
        self.action=nested;meta,got=self.capture(receiver);self.assertEqual(got,raw)
        self.assertEqual(meta['status'],'captured-header-only')
        with self.assertRaises(ValueError):self.capture(receiver)
    def test_cleanup_uncertainty_keeps_original_bytes_and_partial_status(self):
        receiver=self.prepare();raw=self.write();held=[];original=os.close
        def remember():
            if self.samples==2:held.append(receiver._receipt)
        self.action=remember
        def close(fd):
            original(fd)
            if held and fd==held[0]:raise OSError('AUTHORED-PRIVATE-CLOSE-ERROR')
        with mock.patch.object(os,'close',side_effect=close):meta,got=self.capture(receiver)
        self.assertEqual(got,raw);self.assertEqual(meta['status'],'partial');self.assertEqual(meta['refusal'],'receiver-cleanup')
        self.assertIn('_receipt-close',meta['cleanupFailures']);self.assertFalse(meta['receiverClosed'])
    def test_stop_during_final_sample_or_installed_readback_stays_partial(self):
        for boundary in ('sample','readback'):
            receiver=self.prepare();raw=self.write();stop=[False];self.samples=0
            if boundary=='sample':
                def request_stop():
                    if self.samples==2:stop[0]=True
                self.action=request_stop
            else:
                self.action=lambda:None;original=receiver._file
                def request_stop(path,*args,**kwargs):
                    value=original(path,*args,**kwargs)
                    if path==receiver._executable:stop[0]=True
                    return value
                receiver._file=request_stop
            meta,got=self.capture(receiver,stopped=lambda:stop[0]);self.assertEqual(meta['refusal'],'stop')
            self.assertEqual(meta['status'],'partial');self.assertEqual(got,raw);self.assertTrue(meta['receiverClosed']);self.target.unlink()
    def test_runtime_header_and_fingerprint_mutations_are_detected(self):
        cuts=[("value['source_label'] == self._spec['sourceCommit'] and",'True and'),
              ('need(self._identity(os.fstat(self._receipt)) == self._last_receipt_identity)','need(True)')]
        for index,(cut,replacement) in enumerate(cuts):
            self.assertTrue(cut in SOURCE_PREFIX);namespace={};exec(compile(SOURCE_PREFIX.replace(cut,replacement),'authored-receiver-mutant','exec'),namespace)
            receiver=self.prepare(namespace['PreparedInstalledObservation']);value=envelope()
            if index==0:value['source_label']='f'*40
            self.write(value);self.samples=0
            def alter():
                if index==1 and self.samples==2:self.target.write_bytes(b'{"changed":true}')
            self.action=alter;meta,_=self.capture(receiver);self.assertEqual(meta['status'],'captured-header-only');self.target.unlink()
        import re
        mutant,count=re.subn(r'(?m)^(\s*)self\._check\(deadline\)\n\1check_stop\(\)$',r'\1self._check(deadline)\n\1pass',SOURCE_PREFIX)
        self.assertEqual(count,2);namespace={};exec(compile(mutant,'authored-stop-fence-mutant','exec'),namespace)
        receiver=self.prepare(namespace['PreparedInstalledObservation']);self.write();self.samples=0;stop=[False]
        def request_stop():
            if self.samples==2:stop[0]=True
        self.action=request_stop;meta,_=self.capture(receiver,stopped=lambda:stop[0])
        self.assertTrue(stop[0]);self.assertEqual(meta['status'],'captured-header-only')
unittest.main(argv=['authored-installed-receiver-controls'],verbosity=2)
`;

test('unwired installed observation receiver binds real file descriptors and supplied samples', () => {
    const prefix = retention.slice(0, retention.lastIndexOf('\ntry:\n'));
    const dir = mkdtempSync(join(tmpdir(), 'bw-ios-receiver-controls-'));
    try {
        const controller = join(dir, 'controls.py');
        writeFileSync(controller, `${prefix}\nSOURCE_PREFIX = ${JSON.stringify(prefix)}\n${receiverControls}`);
        const result = spawnSync('/usr/bin/python3', [controller], {
            env: {...process.env, GITHUB_WORKSPACE: dir, RUNNER_TEMP: dir, TMPDIR: dir}, encoding: 'utf8', timeout: 15000
        });
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stderr, /Ran 17 tests/);
        assert.match(result.stderr, /OK/);
        assert.equal((retention.match(/PreparedInstalledObservation\(/g) || []).length, 0, 'no receiver constructor caller');
    } finally { rmSync(dir, {recursive: true, force: true}); }
});
