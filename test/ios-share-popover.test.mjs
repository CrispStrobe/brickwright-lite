import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const cargoUrl = new URL('../apps/tauri/src-tauri/Cargo.toml', import.meta.url);
const swiftUrl = new URL(
    '../apps/tauri/src-tauri/vendor/tauri-plugin-share/ios/Sources/SharePlugin.swift',
    import.meta.url
);

test('the mobile share dependency is patched by the repository', async () => {
    const cargo = await readFile(cargoUrl, 'utf8');
    assert.match(cargo, /\[patch\.crates-io\][\s\S]*tauri-plugin-share\s*=\s*\{\s*path\s*=\s*"vendor\/tauri-plugin-share"\s*\}/);
});

test('the iOS share sheet is anchored before UIKit presents it', async () => {
    const swift = await readFile(swiftUrl, 'utf8');
    const anchor = swift.indexOf('popover.sourceView = presenter.view');
    const rect = swift.indexOf('popover.sourceRect = CGRect(');
    const present = swift.indexOf('presenter.present(activityVC');

    assert.ok(anchor >= 0, 'iPad share popover needs a source view');
    assert.ok(rect > anchor, 'iPad share popover needs a source rectangle');
    assert.ok(present > rect, 'the anchor must be configured before presentation');
    assert.match(swift, /while let presented = presenter\.presentedViewController/);
});
