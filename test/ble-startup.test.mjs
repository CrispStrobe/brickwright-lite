import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const cargo = readFileSync(new URL('../apps/tauri/src-tauri/Cargo.toml', import.meta.url), 'utf8');
const app = readFileSync(new URL('../apps/tauri/src-tauri/src/lib.rs', import.meta.url), 'utf8');

test('optional BLE cannot block or panic application startup', () => {
    assert.match(cargo, /CrispStrobe\/tauri-plugin-blec/);
    assert.match(cargo, /rev = "[0-9a-f]{40}"/);
    assert.match(app, /tauri_plugin_blec::init_nonblocking\(\)/);
    assert.doesNotMatch(app, /catch_unwind\(tauri_plugin_blec::init\)/);
});
