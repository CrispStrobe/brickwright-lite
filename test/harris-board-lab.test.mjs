import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {demo, load} from '../overlay/scratch-gui/src/lib/bw-286-lab/runtime.js';
import {getDevice} from '../overlay/scratch-gui/src/lib/bw-286-lab/engine/devices.js';
import {getDevice as productionDevice} from '../overlay/scratch-gui/src/lib/bw-board/devices.js';

const base = new URL('../overlay/scratch-gui/src/lib/bw-286-lab/', import.meta.url);
test('experimental source copy matches exact upstream Git blobs including license', async () => {
    const source = JSON.parse(await readFile(new URL('engine/SOURCE.json', base)));
    assert.match(source.revision, /^[a-f0-9]{40}$/);
    assert.equal(source.repository, 'https://github.com/CrispStrobe/bw-board');
    assert.equal(source.scope, 'Isolated experimental copy; not the production bw-board pin');
    assert.equal(source.files.length, 11);
    for (const {file, gitBlob} of source.files) {
        const bytes = await readFile(new URL(`engine/${file}`, base));
        const hash = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
        assert.equal(hash, gitBlob, file);
    }
});

test('isolated runtime does not register devices in the production engine', () => {
    assert.ok(getDevice('62256'));
    assert.notEqual(getDevice('62256'), productionDevice('62256'));
});

test('application runtime loads and executes exported owned recipe', () => {
    const document = demo(); const session = load(JSON.stringify(document));
    session.initialize(); session.setBreakpoint(0xfffff0);
    assert.equal(session.run().reason, 'breakpoint');
    assert.equal(session.stepInstruction().cpu.retired, 1);
    assert.equal(session.run().reason, 'halted');
    assert.equal(session.inspectBank('ram0').bytes[0x288], 10);
    assert.deepEqual(session.exportConfiguration(), document);
    assert.throws(() => load({...document, backend: 'v86'}), /UNSUPPORTED_BACKEND/);
});

test('GUI keeps engine behind explicit enable and uses the existing lazy diagnostic entry', async () => {
    const panel = await readFile(new URL('panel.js', base), 'utf8');
    const entry = await readFile(new URL('../overlay/scratch-gui/src/components/menu-bar/i8086-lab.jsx', import.meta.url), 'utf8');
    assert.match(entry, /import\(\/\* webpackChunkName: "bw-286-lab" \*\/ '..\/..\/lib\/bw-286-lab\/panel.js'\)/);
    assert.match(panel, /Enable experimental board lab/);
    assert.doesNotMatch(panel, /^import /m);
    assert.doesNotMatch(panel, /localStorage|innerHTML|setBackend\(/);
});
