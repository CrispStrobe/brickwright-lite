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
        // This asserted the LITERAL `circuitData: {version: 1, parts: [], wires: []}`
        // and went red the moment that object was given a name — a gate that
        // tracked one spelling rather than the behaviour underneath it. Restated
        // as the invariant that actually matters, which is also strictly more
        // than the old line checked: every branch that decides what the circuit
        // now IS must reach the LIVE model as well as React state.
        //
        // vm.runtime.circuitModel is not the Designer's private state —
        // bw-debug's debug-runner and the circuit VM extension resolve the board
        // through it — but the Designer is what assigns it, and circuit-tab's
        // render drops the Designer entirely when the debugger is docked 'right'
        // (the default) while the Code tab is active. React state alone therefore
        // leaves a running program on the previous project's board.
        const applied = [...circuit.matchAll(
            /this\.setState\(\{circuitData: (\w+)\}\);\s*\n\s*this\._applyToLiveCircuit\(\1\);/g)];
        assert.equal(applied.length, 2,
            'both the restore and the replacement branch must hand their circuit to ' +
            `vm.runtime.circuitModel, not only to setState — found ${applied.length}`);
        assert.match(circuit, /\{version: 1, parts: \[\], wires: \[\]\}/,
            'replacement must still produce an empty bench');
        const clear = 'for (const name of p.getWidgetNames()) p.removeWidget(name)';
        assert.ok(circuit.includes(clear), 'the old controller widgets are not removed');
        assert.ok(circuit.indexOf(clear) < circuit.indexOf('if (wraw)', circuit.indexOf(clear)),
            'controller clearing must happen before and outside the optional incoming record');
    });
});
