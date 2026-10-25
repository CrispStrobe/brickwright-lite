import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url));
const text = file => read(file).toString('utf8');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('the App Store frontend carries the complete LGPL text and exact corresponding-source coordinates', () => {
    const overlayLicence = read('overlay/scratch-gui/static/licenses/free-386-firmware.LGPL-2.1.txt');
    const packageLicence = read('packages/scratch-gui/static/licenses/free-386-firmware.LGPL-2.1.txt');
    assert.deepEqual(packageLicence, overlayLicence);
    assert.equal(sha256(overlayLicence), 'dc626520dcd53a22f727af3ee42c770e56c97a64fe3adb063799d8ab032fe551');
    assert.match(overlayLicence.toString('utf8'), /GNU LESSER GENERAL PUBLIC LICENSE\s+Version 2\.1/);

    const sourceBytes = read('overlay/scratch-gui/static/licenses/free-386-firmware.sources.json');
    assert.deepEqual(read('packages/scratch-gui/static/licenses/free-386-firmware.sources.json'), sourceBytes);
    const sources = JSON.parse(sourceBytes);
    const provenance = JSON.parse(text('overlay/scratch-gui/static/roms/free-386-bios.provenance.json'));
    assert.equal(sources.firmware.length, 2);
    assert.deepEqual(sources.firmware.map(entry => entry.artifactSha256),
        provenance.roms.map(entry => entry.sha256));
    for (const entry of sources.firmware) {
        assert.match(entry.sourceArchive, /^https:\/\//);
        assert.match(entry.sourceArchiveSha256, /^[0-9a-f]{64}$/);
    }
});

test('the in-app About screen exposes LGPL and MPL obligations without a network dependency', () => {
    for (const root of ['overlay/scratch-gui', 'packages/scratch-gui']) {
        const about = text(`${root}/src/components/menu-bar/bw-about.jsx`);
        const data = text(`${root}/src/components/menu-bar/about-data.js`);
        assert.match(about, /free-386-firmware\.LGPL-2\.1\.txt/);
        assert.match(about, /bw-circuit-ui\.MPL-2\.0\.txt/);
        assert.match(about, /nqc\.MPL-2\.0\.txt/);
        assert.match(data, /free-386-firmware\.sources\.json/);
        assert.match(data, /bw-circuit-ui\.MPL-2\.0\.txt/);
        assert.match(data, /jverne\/nqc\/tree\/21c24ec1e520c736ce78e33e4c0dafca887fc2b7/);
    }
    const tauri = JSON.parse(text('apps/tauri/src-tauri/tauri.conf.json'));
    assert.equal(tauri.build.frontendDist, '../../../packages/scratch-gui/build');
});
