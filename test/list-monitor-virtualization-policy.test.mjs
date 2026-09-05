import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const packageSource = readFileSync(new URL(
    '../packages/scratch-gui/src/components/monitor/list-monitor-scroller.jsx', import.meta.url), 'utf8');
const overlaySource = readFileSync(new URL(
    '../overlay/scratch-gui/src/components/monitor/list-monitor-scroller.jsx', import.meta.url), 'utf8');

test('list monitors import only react-virtualized List, not the package barrel', () => {
    for (const source of [packageSource, overlaySource]) {
        assert.match(source, /import List from 'react-virtualized\/dist\/es\/List';/);
        assert.doesNotMatch(source, /from 'react-virtualized';/);
    }
    assert.equal(packageSource, overlaySource, 'the integration overlay and tracked package mirror diverged');
});
