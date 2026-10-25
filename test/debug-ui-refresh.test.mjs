import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shouldRefreshDesignerDebugState} from
    '../overlay/scratch-gui/src/lib/bw-debug/debug-ui-refresh.js';

test('right/off docks do not wake CircuitDesigner for invisible progress', () => {
    for (const dock of ['right', 'off']) {
        assert.equal(shouldRefreshDesignerDebugState({
            dock, tasksChanged: true, msMoved: true, capabilitiesChanged: true, floorDue: true
        }), false);
    }
});

test('top/solo docks retain their visible periodic status', () => {
    for (const dock of ['top', 'solo']) {
        assert.equal(shouldRefreshDesignerDebugState({dock, floorDue: true}), true);
        assert.equal(shouldRefreshDesignerDebugState({dock, tasksChanged: true}), true);
        assert.equal(shouldRefreshDesignerDebugState({dock, serialChanged: true}), true);
    }
});

test('board and halt semantics remain immediate in every dock', () => {
    for (const dock of ['right', 'off', 'top', 'solo']) {
        assert.equal(shouldRefreshDesignerDebugState({dock, boardChanged: true}), true);
        assert.equal(shouldRefreshDesignerDebugState({dock, haltedChanged: true}), true);
        assert.equal(shouldRefreshDesignerDebugState({dock, haltReasonChanged: true}), true);
    }
});

test('the default right dock does not publish serial-only designer state', () => {
    const source = readFileSync(new URL(
        '../overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx', import.meta.url), 'utf8');
    const handler = source.slice(source.indexOf('handleRunnerChange ('), source.indexOf('labelForBlock ('));
    assert.match(handler, /serialChanged: serialStamp !== \(prev\._serialStamp \?\? ''\)/);
    assert.equal(shouldRefreshDesignerDebugState({dock: 'right', serialChanged: true}), false);
    assert.match(source, /<DebugPanel/);
});
