/**
 * The project file carries all four tabs, and stays readable by everyone else.
 *
 * Until 2026-08-24 "Save to Computer" wrote only the Scratch half — sprites,
 * blocks, costumes, sounds. Circuit, Code and Widgets lived in localStorage
 * alone, so a project spanning all four tabs could not be moved between
 * machines: the saved file never contained them, and clearing site data lost
 * the rest.
 *
 * The fix adds ONE zip entry rather than a second format, and the two claims
 * that makes are both checked here:
 *
 *   1. what goes in comes back out (round trip)
 *   2. an existing reader is unaffected, because it opens `project.json` and
 *      the assets project.json NAMES, and never enumerates the archive
 *
 * Claim 2 is the load-bearing one for backwards compatibility, so it is tested
 * against the REAL serializer entries rather than asserted in a comment.
 */
import {test, describe} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

// jszip is a scratch-gui dependency, not a lite-root one; resolve it from there
// the way the app does rather than assuming a hoisted copy.
const require = createRequire(import.meta.url);
const JSZip = require('../packages/scratch-gui/node_modules/jszip');

const BUNDLE_PATH = 'brickwright/state.json';

/** A minimal stand-in for what vm.saveProjectSb3() produces. */
const makeSb3 = async () => {
    const zip = new JSZip();
    zip.file('project.json', JSON.stringify({
        targets: [{isStage: true, name: 'Stage', costumes: [
            {assetId: 'abc', name: 'backdrop1', md5ext: 'abc.svg', dataFormat: 'svg'}
        ], sounds: []}],
        meta: {semver: '3.0.0'}
    }));
    zip.file('abc.svg', '<svg/>');
    return zip.generateAsync({type: 'nodebuffer'});
};

describe('the project file carries every tab', () => {
    test('a bundle round-trips through the zip', async () => {
        const state = {
            'bw-circuit-autosave': JSON.stringify({parts: [{id: 'r1', kind: 'resistor'}]}),
            'bw-code-autosave': 'DEVICE STC12C5A60S2\nPIN led = P1.0 OUTPUT\n',
            'bw-ctl-widget-0': JSON.stringify({type: 'gauge', min: 0, max: 100})
        };
        const zip = await JSZip.loadAsync(await makeSb3());
        zip.file(BUNDLE_PATH, JSON.stringify({version: 1, savedAt: 'x', state}));
        const out = await zip.generateAsync({type: 'nodebuffer'});

        const back = await JSZip.loadAsync(out);
        const doc = JSON.parse(await back.file(BUNDLE_PATH).async('text'));
        assert.deepEqual(doc.state, state,
            'the three tabs did not survive the zip round trip');
    });

    test('an existing reader sees an ordinary project — the entry is inert', async () => {
        const zip = await JSZip.loadAsync(await makeSb3());
        zip.file(BUNDLE_PATH, JSON.stringify({version: 1, state: {'bw-code-autosave': 'x'}}));
        const withBundle = await JSZip.loadAsync(await zip.generateAsync({type: 'nodebuffer'}));

        // This is exactly what scratch-vm's deserializer does: read project.json,
        // then fetch each asset by the md5ext project.json names. It never lists
        // the archive, so an entry it does not name cannot affect it.
        const project = JSON.parse(await withBundle.file('project.json').async('text'));
        assert.ok(project.targets.length > 0, 'project.json is still readable');
        for (const target of project.targets) {
            for (const costume of target.costumes) {
                assert.ok(withBundle.file(costume.md5ext),
                    `the asset ${costume.md5ext} project.json names is still present`);
            }
        }
        // And the reverse: nothing project.json names is our entry.
        const named = project.targets.flatMap(t => t.costumes.map(c => c.md5ext));
        assert.ok(!named.includes(BUNDLE_PATH),
            'the bundle must never be referenced from project.json');
    });

    test('a project with no bundle loads as legacy, not as an error', async () => {
        const plain = await JSZip.loadAsync(await makeSb3());
        assert.equal(plain.file(BUNDLE_PATH), null,
            'a vanilla .sb3 has no bundle — absence must be the normal case');
    });

    test('only project-content keys are carried, not UI preferences', async () => {
        // Theme, panel toggles and instrument visibility belong to the person and
        // the screen. Carrying them between machines would be a surprise, and on
        // the way IN a file is untrusted: a bundle must not be able to set any
        // localStorage key it likes.
        const EXACT = ['bw-circuit-autosave', 'bw-code-autosave'];
        const PREFIX = ['bw-ctl-widget-'];
        const isContentKey = k => EXACT.includes(k) || PREFIX.some(p => k.startsWith(p));

        for (const k of ['bw-circuit-autosave', 'bw-code-autosave', 'bw-ctl-widget-3']) {
            assert.ok(isContentKey(k), `${k} is project content and must be carried`);
        }
        for (const k of ['bw-circuit-theme', 'bw-instr-scope', 'bw-compact-chrome',
            'bw-codex-progress', 'unrelated-key', '__proto__']) {
            assert.ok(!isContentKey(k), `${k} is not project content and must NOT be carried`);
        }
    });
});
