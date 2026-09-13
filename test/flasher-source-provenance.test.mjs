import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PIN = '30f43384a9f226de3c3cb753e119dd93ca2e81ff';
const FILE_HASH = 'c6477c6ebb62e0c6316ad1b03099e7a9261f3b880abd737e4e3d6cac2d62e595';
const BODY_HASH = '31f9a0086df24df9821528af46aa391b0892a302bde58c7d3f42f3eee888a530';
const BANNER = '// VENDORED from CrispStrobe/stc-compiler docs/flash.js — do NOT edit here.\n'
    + '// Change it there (it has the mock-bootloader tests), then `npm run sync:flasher`.\n';
const sha256 = text => createHash('sha256').update(text).digest('hex');
const read = rel => readFileSync(path.join(ROOT, rel), 'utf8');

test('the flasher pin is the approved full stc-compiler source identity', () => {
    const pins = JSON.parse(read('vendor-pins.json'));
    assert.equal(pins['stc-compiler-flasher'], PIN);
    assert.match(PIN, /^[0-9a-f]{40}$/);
});

test('both shipped flasher mirrors are exact, byte-identical generated copies', () => {
    const overlay = read('overlay/scratch-gui/src/lib/flasher.js');
    const packaged = read('packages/scratch-gui/src/lib/flasher.js');
    assert.equal(packaged, overlay);
    assert.ok(overlay.startsWith(BANNER));
    assert.equal(sha256(overlay), FILE_HASH);
    assert.equal(sha256(overlay.slice(BANNER.length)), BODY_HASH);
});

test('the sync binds local and remote sources to one SHA and one repository before writes', () => {
    const sync = read('scripts/sync-flasher.mjs');
    assert.match(sync, /const sha = srcDir \? await localSha\(srcDir\) : \(await resolveRef\(REPO, REF\)\)\.sha/);
    assert.match(sync, /CrispStrobe\/stc-compiler\.git/);
    assert.match(sync, /refusing flasher source from/);
    const firstWrite = sync.indexOf('writeFile(dest');
    assert.ok(sync.indexOf("remote', 'get-url', 'origin") < firstWrite);
    assert.ok(sync.indexOf("assertPinMoveAllowed('stc-compiler-flasher', sha)") < firstWrite);
    assert.match(sync, /raw\.githubusercontent\.com\/\$\{REPO\}\/\$\{sha\}\/\$\{REL\}/);
});
