import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, copyFileSync, statSync} from 'node:fs';
import {join, isAbsolute} from 'node:path';
import {tmpdir, homedir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const path = 'apps/tauri/src-tauri/src/embedded_asset_audit.rs';
const source = readFileSync(join(root, path), 'utf8');
const lib = readFileSync(join(root, 'apps/tauri/src-tauri/src/lib.rs'), 'utf8');

function boundary(module, entry) {
    assert.match(module, /#\[cfg\(all\(target_os = "ios", target_abi = "sim", not\(dev\)\)\)\]\s*pub\(crate\) fn observe/);
    assert.match(module, /var_os\("BW_EMBEDDED_ASSET_AUDIT_PATH"\) else \{\s*return;\s*\}/);
    assert.match(module, /create_new\(true\)/);
    assert.match(module, /let resolver = app\.asset_resolver\(\)/);
    assert.match(module, /collect\(\s*resolver\.iter\(\),/);
    assert.match(module, /resolver\.get\(key\)/);
    assert.match(module, /asset_config_projection\(config\.as_deref\(\)\)/);
    assert.match(module, /brickwright\.installed-asset-envelope\.v2/);
    assert.doesNotMatch(module, /generate_context!|tauri::Context::|std::fs::read\(/);
    assert.match(entry, /#\[cfg\(all\(target_os = "ios", target_abi = "sim", not\(dev\)\)\)\]\s*if matches!\(&_event, tauri::RunEvent::Ready\) \{\s*embedded_asset_audit::observe\(_app\);/);
    assert.equal((entry.match(/generate_context!\(\)/g) || []).length, 1);
    assert.match(entry, /if let tauri::RunEvent::Opened \{ urls \} = _event/);
}

test('actual installed resolver hook preserves context and excludes development/device triggers', () => boundary(source, lib));
test('boundary controls reject a second provider, weakened cfg and missing hook', () => {
    for (const [module, entry] of [
        [source.replace('app.asset_resolver()', 'fake.asset_resolver()'), lib],
        [source.replace('not(dev)', 'all()'), lib],
        [source.replace('create_new(true)', 'create(true)'), lib],
        [source, lib.replace('embedded_asset_audit::observe(_app);', '')],
        [source, lib.replace('matches!(&_event', 'matches!(_event')]
    ]) assert.throws(() => boundary(module, entry));
});

test('actual Rust collector controls compile and execute without building Tauri', {timeout: 120000}, () => {
    const dir = mkdtempSync(join(tmpdir(), 'bw-asset-audit-'));
    try {
        mkdirSync(join(dir, 'src'));
        // Reuse the application's exact lock rather than introducing a dependency pin.
        copyFileSync(join(root, 'apps/tauri/src-tauri/Cargo.lock'), join(dir, 'Cargo.lock'));
        writeFileSync(join(dir, 'Cargo.toml'), `[package]\nname="bw-asset-audit-controls"\nversion="0.0.0"\nedition="2021"\n[dependencies]\nserde={version="1",features=["derive"]}\nserde_json="1"\nsha2="0.10"\n[lints.rust]\nunexpected_cfgs="allow"\n`);
        copyFileSync(join(root, path), join(dir, 'src/lib.rs'));
        // Bind the control compiler to the explicit Cargo installation, preserving
        // the rustup proxy basename/toolchain selection. A PATH shadow must not
        // substitute a different program. This does not pin its version or prove
        // which compiler built an installed app; those joins remain external.
        const cargoHome = process.env.CARGO_HOME || join(homedir(), '.cargo');
        assert.ok(isAbsolute(cargoHome), 'Cargo installation root must be absolute');
        const cargo = join(cargoHome, 'bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo');
        assert.ok(statSync(cargo).isFile(), 'explicit Cargo executable must exist');
        const args = ['test', '--manifest-path', join(dir, 'Cargo.toml'), '--quiet'];
        if (process.env.BW_RUST_OFFLINE === '1') args.push('--offline');
        const result = spawnSync(cargo, args, {encoding: 'utf8', timeout: 110000,
            env: {...process.env, CARGO_TARGET_DIR: join(dir, 'target'), CARGO_BUILD_JOBS: '1'}, maxBuffer: 1024 * 1024});
        assert.equal(result.status, 0, `${result.error || ''}\n${result.stdout}\n${result.stderr}`);
        assert.match(result.stdout, /12 passed; 0 failed/);
        for (const [anchor, replacement] of [
            ['Ok(format!("{:x}", digest.finalize()))', 'Ok("0".repeat(64))'],
            ['!canonical_key(&key)', 'false'],
            ['if !absent(security, "csp")', 'if false']
        ]) {
            assert.equal(source.split(anchor).length, 2, 'actual source mutation anchor');
            writeFileSync(join(dir, 'src/lib.rs'), source.replace(anchor, replacement));
            const mutant = spawnSync(cargo, args, {encoding: 'utf8', timeout: 30000,
                env: {...process.env, CARGO_TARGET_DIR: join(dir, 'target'), CARGO_BUILD_JOBS: '1'}, maxBuffer: 1024 * 1024});
            assert.equal(mutant.status, 101, `${mutant.error || ''}\n${mutant.stdout}\n${mutant.stderr}`);
            assert.match(mutant.stdout, /test result: FAILED\./, 'a compile error cannot count as mutant detection');
            assert.doesNotMatch(mutant.stderr, /error\[E[0-9]+\]/);
        }
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});
