import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isBoardEndpoint} from '../overlay/scratch-gui/src/lib/bw-circuit-ui/model/wire-endpoints.js';

test('current board tap endpoints are classified separately from part terminals', () => {
    assert.equal(isBoardEndpoint({board: 'bb', hole: 'a5'}), true);
    assert.equal(isBoardEndpoint({part: 'battery', terminal: 'pos'}), false);
});

test('legacy boardId tap endpoints are also excluded from ordinary wire rendering', () => {
    assert.equal(isBoardEndpoint({boardId: 'bb', hole: 'a5'}), true);
    assert.equal(isBoardEndpoint({part: 'resistor', terminal: 'a'}), false);
});

test('malformed endpoints are not treated as board taps', () => {
    assert.equal(isBoardEndpoint(null), false);
    assert.equal(isBoardEndpoint({hole: 'a5', part: 'bb'}), false);
});
