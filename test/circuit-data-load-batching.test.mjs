import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const overlayPath = 'overlay/scratch-gui/src/lib/bw-circuit-ui/components/CircuitDesigner.jsx';

const assertBatchedLoad = source => {
    assert.match(source, /import ReactDOM from 'react-dom';/);
    const effect = /const prevCircuitDataRef = useRef\(null\);[\s\S]*?useEffect\(\(\) => \{([\s\S]*?)\n  \}, \[circuitData, handleLoad, projectData, circuit\]\);/.exec(source);
    assert.ok(effect, 'the circuitData load effect remains identifiable');
    const batch = /ReactDOM\.unstable_batchedUpdates\(\(\) => \{([\s\S]*?)\n    \}\);/.exec(effect[1]);
    assert.ok(batch, 'the common file-load path must batch React 16 state updates');
    assert.match(batch[1], /handleLoad\(circuitData\);[\s\S]*setAnnotations\(\[\]\);/);
    assert.ok(effect[1].indexOf('prevCircuitDataRef.current = circuitData;') <
        effect[1].indexOf('ReactDOM.unstable_batchedUpdates'));
    assert.ok(effect[1].indexOf('ReactDOM.unstable_batchedUpdates') <
        effect[1].indexOf('fileLoadedRef.current = true;'));
};

test('the vendored circuitData path batches its atomic load transaction', () => {
    assertBatchedLoad(read(overlayPath));
});
