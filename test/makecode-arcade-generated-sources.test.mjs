// The Arcade runtime's MakeCode-derived files are what their generators make
// from the pinned pxt-arcade 4.2.1 bundle (`npm run sync:makecode`), byte for
// byte. THIRD-PARTY-NOTICES.md and static/licenses/ describe them as exactly
// that (pxt-arcade device images, pxt-common-packages image/speech code and
// font8 under MIT, font12 under SIL OFL 1.1), so a hand edit or a pin bump
// without regeneration would make those records describe other bytes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

for (const script of ['generate-arcade-builtin-images.mjs', 'generate-arcade-image-operations.mjs', 'generate-arcade-speech.mjs', 'generate-arcade-particles.mjs']) {
    test(`${script} --check: the committed file is the pinned bundle's`, () => {
        const run = spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), '--check'], {cwd: ROOT, encoding: 'utf8'});
        assert.equal(run.status, 0, run.stderr || run.stdout);
        assert.match(run.stdout, /^Verified /);
    });
}
