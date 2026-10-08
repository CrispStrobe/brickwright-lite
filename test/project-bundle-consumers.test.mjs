import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const uploader = read('../overlay/scratch-gui/src/lib/sb-file-uploader-hoc.jsx');
// The load sequence itself, shared by the web file input and the desktop app's native
// documents (Open dialog, Recent Projects, file associations).
const loader = read('../overlay/scratch-gui/src/lib/bw-project-load.js');
const nativeBridge = read('../overlay/scratch-gui/src/lib/tauri-bridge.js');
const code = read('../overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx');
const circuit = read('../overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx');

describe('mounted project consumers obey replacement outcomes', () => {
    test('the project loader announces legacy, invalid and future outcomes, not only found bundles', () => {
        assert.match(loader, /if \(bundle && typeof window !== 'undefined'\)/);
        assert.doesNotMatch(loader, /bundle && bundle\.found/,
            'restoring this guard makes vanilla loads invisible to mounted tabs');
        assert.match(loader, /bw-project-bundle-loaded/);
    });

    test('the project loader preflights compatibility and can roll back before reporting success', () => {
        const inspectAt = loader.indexOf('inspectBrickwrightState(rawFile)');
        const loadAt = loader.indexOf('vm.loadProject(rawFile)');
        assert.ok(inspectAt >= 0 && inspectAt < loadAt,
            'sidecar compatibility must be known before Scratch mutates its VM');
        assert.match(loader, /outcome === 'invalid'.*outcome === 'future'/s);
        assert.match(loader, /rollbackBrickwrightInspection\(bundle\)/,
            'a VM rejection must restore the auxiliary project snapshot');
    });

    test('every project-file path loads through the one loader, never the VM directly', () => {
        // Before the native documents landed, the app's file-association path called
        // vm.loadProject itself and skipped the preflight, the rollback and the tab refresh.
        for (const [name, source, call] of [
            ['the web file input', uploader, /loadProjectFile\(this\.props\.vm, /],
            ['the native documents', nativeBridge, /loadProjectFile\(vm, /]
        ]) {
            assert.match(source, call, `${name} must load through lib/bw-project-load.js`);
            assert.doesNotMatch(source, /\bvm\.loadProject\(/,
                `${name} must not call vm.loadProject around the shared loader`);
        }
    });

    test('Code explicitly clears every authored buffer on loaded empty or legacy state', () => {
        assert.match(code, /outcome === 'legacy'.*outcome === 'loaded'/s);
        // The reset is built from LANG_LABEL (one entry per Code tab), so the
        // invariant is: the bundle branch builds it that way, and LANG_LABEL
        // names every authored language.
        assert.match(code, /outcome === 'loaded'[\s\S]*?buffers: Object\.fromEntries\(Object\.keys\(LANG_LABEL\)\.map\(l => \[l, ''\]\)\)/,
            'the loaded/legacy branch does not reset every buffer');
        const labels = /const LANG_LABEL = \{([^}]*)\}/.exec(code);
        assert.ok(labels, 'LANG_LABEL not found');
        for (const language of ['pseudocode', 'python', 'javascript', 'c', 'basic', 'asm',
            'micropython']) {
            assert.match(labels[1], new RegExp(`\\b${language}:`), `${language} is not cleared`);
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
