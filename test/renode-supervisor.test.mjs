import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const rust = () => readFileSync(path.join(root,
    'apps/tauri/src-tauri/src/renode_supervisor.rs'), 'utf8');
const lib = () => readFileSync(path.join(root,
    'apps/tauri/src-tauri/src/lib.rs'), 'utf8');
const cargo = () => readFileSync(path.join(root,
    'apps/tauri/src-tauri/Cargo.toml'), 'utf8');

const audit = ({source, entry, manifest}) => {
    assert.match(entry, /#\[cfg\(desktop\)\]\s*mod renode_supervisor;/,
        'mobile builds must not carry the native Renode supervisor');
    assert.match(entry, /manage\(renode_supervisor::RenodeSupervisor::new\(\)\)/,
        'the desktop app must own exactly one supervisor');
    assert.match(entry, /TeardownReason::AppExit/,
        'destroying the main window must tear down Renode');
    assert.match(manifest, /command-group\s*=\s*"5\.0\.1"/,
        'process-tree ownership must use the reviewed exact command-group version');
    assert.match(source, /option_env!\("BW_RENODE_EXECUTABLE"\)/);
    assert.match(source, /option_env!\("BW_RENODE_SHA256"\)/);
    assert.match(source, /actual_digest\.eq_ignore_ascii_case\(expected_digest\)/,
        'the executable must be verified before spawn');
    assert.match(source, /Command::new\(&executable\)/,
        'launch must execute the verified path directly');
    assert.doesNotMatch(source, /Command::new\((?:"|r#")?(?:sh|bash|cmd|powershell)/,
        'production launch must never invoke a command shell');
    assert.match(source, /TcpListener::bind\(\(Ipv4Addr::LOCALHOST, 0\)\)/,
        'the endpoint must be chosen by a loopback-only ephemeral bind');
    assert.doesNotMatch(source, /Ipv4Addr::UNSPECIFIED/,
        'no Renode endpoint may bind beyond loopback');
    for (const pin of [
        'BW_RENODE_SPIKE_ROOT', 'BW_RENODE_SPIKE_SCENARIO',
        'BW_RENODE_SPIKE_SCENARIO_SHA256', 'BW_RENODE_SPIKE_FIRMWARE',
        'BW_RENODE_SPIKE_FIRMWARE_SHA256', 'BW_RENODE_SPIKE_STATE_SCRIPT',
        'BW_RENODE_SPIKE_STATE_SCRIPT_SHA256', 'BW_RENODE_SPIKE_STATE_CONFIG',
        'BW_RENODE_SPIKE_STATE_CONFIG_SHA256'
    ]) assert.match(source, new RegExp(`option_env!\\("${pin}"\\)`));
    assert.match(source, /machine StartGdbServer \{BW_GDB_PORT\}/);
    assert.match(source, /spike_state_start \\\"127\.0\.0\.1\\\" \{BW_STATE_PORT\}/);
    assert.match(source, /BW_RENODE_SESSION_TOKEN/);
    assert.match(source, /getrandom::getrandom\(&mut bytes\)/,
        'the session token must come from the OS CSPRNG');
    assert.match(source, /MAX_OUTPUT_BYTES:\s*usize\s*=\s*1024 \* 1024/);
    assert.match(source, /MAX_SESSION_TIME:\s*Duration\s*=\s*Duration::from_secs\(120\)/);
    assert.match(source, /command\s*\.\s*group_spawn\(\)/,
        'Renode must be launched as a process group/job object');
    assert.doesNotMatch(source, /#\[tauri::command\]/,
        'the raw process supervisor must not be exposed to editor content');
    assert.match(source, /child\.kill\(\)/);
    for (const reason of ['Reset', 'ProjectClose', 'AppExit']) {
        assert.match(source, new RegExp(`TeardownReason::${reason}`),
            `${reason} must use the same process-tree teardown path`);
    }
    assert.match(source, /impl Drop for RenodeSupervisor[\s\S]*TeardownReason::AppExit/,
        'dropping app state must be a final teardown backstop');
};

test('Renode supervisor is pinned, loopback-only, bounded and lifecycle-owned', () => {
    audit({source: rust(), entry: lib(), manifest: cargo()});
});

test('Renode supervisor gate rejects independent boundary weakening', () => {
    const mutations = [
        input => { input.source = input.source.replace('Command::new(&executable)', 'Command::new("sh")'); },
        input => { input.source = input.source.replace('Ipv4Addr::LOCALHOST, 0', 'Ipv4Addr::UNSPECIFIED, 0'); },
        input => { input.source = input.source.replace(/command\s*\.\s*group_spawn\(\)/, 'command.spawn()'); },
        input => { input.source = input.source.replace('getrandom::getrandom(&mut bytes)', 'Ok(())'); },
        input => { input.source = input.source.replaceAll('let _ = child.kill();', ''); },
        input => { input.entry = input.entry.replace('TeardownReason::AppExit', 'TeardownReason::Reset'); },
        input => { input.manifest = input.manifest.replace('command-group = "5.0.1"', ''); }
    ];
    const survivors = [];
    mutations.forEach((mutate, index) => {
        const input = {source: rust(), entry: lib(), manifest: cargo()};
        mutate(input);
        try { audit(input); survivors.push(index); } catch { /* red as required */ }
    });
    assert.deepEqual(survivors, [], `mutations that did not turn the gate red: ${survivors}`);
});
