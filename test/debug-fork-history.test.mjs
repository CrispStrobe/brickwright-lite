import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createBranchCursor,
    createForkHistory
} from '../overlay/scratch-gui/src/lib/bw-debug/fork-history.js';

const at = (branchId, eventCursor) => createBranchCursor(branchId, eventCursor);

test('forks form immutable ancestry summaries and the newest fork becomes active', () => {
    const history = createForkHistory({rootBranchId: 'root'});
    assert.deepEqual(history.activeBranch(), {
        branchId: 'root', parentBranchId: null,
        forkCursor: {branchId: 'root', eventCursor: 0}, creation: 0
    });
    assert.equal(history.fork({branchId: 'a', forkCursor: at('root', 7)}).accepted, true);
    assert.equal(history.fork({branchId: 'b', forkCursor: at('a', 11)}).accepted, true);
    assert.deepEqual(history.activeBranch(), {
        branchId: 'b', parentBranchId: 'a',
        forkCursor: {branchId: 'a', eventCursor: 11}, creation: 2
    });
    const summaries = history.summaries();
    assert.ok(Object.isFrozen(summaries));
    assert.ok(summaries.every(Object.isFrozen));
    assert.throws(() => { summaries[1].forkCursor.eventCursor = 99; }, TypeError);
    assert.equal(history.summaries()[1].forkCursor.eventCursor, 7);
});

test('activation is explicit and unknown branches fail closed', () => {
    const history = createForkHistory();
    history.fork({branchId: 'left', forkCursor: at('main', 4)});
    history.activate('main');
    history.fork({branchId: 'right', forkCursor: at('main', 6)});
    assert.equal(history.activeBranch().branchId, 'right');
    assert.equal(history.activeBranch().parentBranchId, 'main');
    assert.equal(history.activate('missing').code, 'branch-not-retained');
    assert.equal(history.activeBranch().branchId, 'right');
});

test('capacity refuses without silently evicting or consuming an identity', () => {
    const history = createForkHistory({maxBranches: 2});
    history.fork({branchId: 'a', forkCursor: at('main', 2)});
    assert.equal(history.fork({branchId: 'b', forkCursor: at('a', 3)}).code, 'branch-capacity');
    assert.deepEqual(history.summaries().map(item => item.branchId), ['main', 'a']);
    assert.deepEqual(history.retention(), {
        maxBranches: 2, retainedBranches: 2, evictedBranches: 0, activeBranchId: 'a'
    });
});

test('checkpoint retention removes only inactive leaves and preserves ancestry', () => {
    const history = createForkHistory({maxBranches: 5});
    history.fork({branchId: 'old-parent', forkCursor: at('main', 2)});
    history.fork({branchId: 'old-leaf', forkCursor: at('old-parent', 3)});
    history.activate('main');
    history.fork({branchId: 'active', forkCursor: at('main', 8)});
    const result = history.evictBeforeCheckpoint(7);
    assert.deepEqual([...result.removed], ['old-leaf', 'old-parent']);
    assert.deepEqual(history.summaries().map(item => item.branchId), ['main', 'active']);
    assert.equal(history.activeBranch().branchId, 'active');
    assert.equal(history.activate('old-leaf').code, 'branch-not-retained');
    assert.equal(history.fork({branchId: 'old-leaf', forkCursor: at('active', 9)}).code, 'branch-id-used');
    assert.equal(history.retention().evictedBranches, 2);
});

test('fork validation rejects missing ancestry and time travel before a parent fork', () => {
    const history = createForkHistory();
    assert.equal(history.fork({branchId: 'orphan', parentBranchId: 'gone',
        forkCursor: at('gone', 2)}).code,
        'unknown-parent-branch');
    history.fork({branchId: 'parent', forkCursor: at('main', 10)});
    assert.equal(history.fork({branchId: 'past', forkCursor: at('parent', 9)}).code,
        'fork-before-parent');
    assert.throws(() => history.fork({branchId: '', forkCursor: at('parent', 1)}), TypeError);
    assert.throws(() => history.evictBeforeCheckpoint(-1), TypeError);
});

test('fork cursors are branch-qualified and equal ordinals on siblings never alias', () => {
    const history = createForkHistory();
    history.fork({branchId: 'left', forkCursor: at('main', 4)});
    history.activate('main');
    history.fork({branchId: 'right', forkCursor: at('main', 4)});
    history.fork({branchId: 'right-child', forkCursor: at('right', 9)});
    assert.notDeepEqual(at('left', 9), at('right', 9),
        'a cursor includes its branch even at the same event ordinal');
    assert.equal(history.fork({branchId: 'wrong-parent', parentBranchId: 'left',
        forkCursor: at('right', 10)}).code, 'fork-cursor-branch-mismatch');
    assert.throws(() => history.fork({branchId: 'unqualified', forkCursor: 10}), TypeError);
});

test('a retained child always keeps its real parent record retained', () => {
    const history = createForkHistory();
    history.fork({branchId: 'parent', forkCursor: at('main', 1)});
    history.fork({branchId: 'child', forkCursor: at('parent', 2)});
    history.activate('main');
    history.evictBeforeCheckpoint(2);
    assert.deepEqual(history.summaries().map(item => item.branchId), ['main', 'parent', 'child']);
    history.evictBeforeCheckpoint(3);
    assert.deepEqual(history.summaries().map(item => item.branchId), ['main']);
});
