import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const uploader = read('../overlay/scratch-gui/src/lib/sb-file-uploader-hoc.jsx');
const code = read('../overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx');
const circuit = read('../overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx');

describe('mounted project consumers obey replacement outcomes', () => {
    test('the uploader announces legacy, invalid and future outcomes, not only found bundles', () => {
        assert.match(uploader, /if \(bundle && typeof window !== 'undefined'\)/);
        assert.doesNotMatch(uploader, /bundle && bundle\.found/,
            'restoring this guard makes vanilla loads invisible to mounted tabs');
        assert.match(uploader, /bw-project-bundle-loaded/);
    });

    test('the uploader preflights compatibility and can roll back before reporting success', () => {
        const inspectAt = uploader.indexOf('inspectBrickwrightState(rawFile)');
        const loadAt = uploader.indexOf('this.props.vm.loadProject(rawFile)');
        assert.ok(inspectAt >= 0 && inspectAt < loadAt,
            'sidecar compatibility must be known before Scratch mutates its VM');
        assert.match(uploader, /outcome === 'invalid'.*outcome === 'future'/s);
        assert.match(uploader, /rollbackBrickwrightInspection\(bundle\)/,
            'a VM rejection must restore the auxiliary project snapshot');
    });

    test('Code explicitly clears every authored buffer on loaded empty or legacy state', () => {
        assert.match(code, /outcome === 'legacy'.*outcome === 'loaded'/s);
        for (const language of ['pseudocode', 'python', 'javascript', 'c', 'basic', 'asm',
            'micropython']) {
            assert.match(code, new RegExp(`${language}: ''`), `${language} is not cleared`);
        }
        assert.match(code, /publishGameControls\(null\)/);
        assert.match(code, /preserved-not-applied|report\?\.action/,
            'future/invalid compatibility must be visible rather than silent');
    });

    test('Circuit and Controller both clear when their incoming section is absent', () => {
        assert.match(circuit, /circuitData: \{version: 1, parts: \[\], wires: \[\]\}/);
        const clear = 'for (const name of p.getWidgetNames()) p.removeWidget(name)';
        assert.ok(circuit.includes(clear), 'the old controller widgets are not removed');
        assert.ok(circuit.indexOf(clear) < circuit.indexOf('if (wraw)', circuit.indexOf(clear)),
            'controller clearing must happen before and outside the optional incoming record');
    });
});
