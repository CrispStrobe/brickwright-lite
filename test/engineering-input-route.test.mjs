import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createEngineeringInputRoute} from '../overlay/scratch-gui/src/lib/bw-debug/engineering-input-route.js';

// Target doubles here prove caller routing, not sensors or engine fidelity.
test('before attach and on older targets, discovery is unavailable rather than empty', () => {
    let target = null;
    let history = 0;
    const route = createEngineeringInputRoute({getTarget: () => target,
        beforeWrite: () => { history++; return {accepted: true}; }});
    assert.match(route.discoverInputs().unsupported, /nothing/);
    assert.equal(route.setInputs([]).accepted, false);
    target = {};
    assert.match(route.discoverInputs().unsupported, /no engineering input discovery/);
    assert.equal(route.setInputs([]).code, 'inputs-unavailable');
    assert.equal(history, 0);
});

test('live discovery uses the current target and does not mutate history', () => {
    let target = {discoverInputs: () => [{peripheral: 'accelerometer', key: 'x', unit: 'g'}]};
    const route = createEngineeringInputRoute({getTarget: () => target,
        beforeWrite: () => { throw Error('discovery must not fork'); }});
    assert.equal(route.discoverInputs()[0].peripheral, 'accelerometer');
    target = {discoverInputs: () => []};
    assert.deepEqual(route.discoverInputs(), []);
});

test('broken discovery never reports an invented empty list', () => {
    for (const discoverInputs of [() => null, () => ({}), () => { throw Error('detached'); }]) {
        const route = createEngineeringInputRoute({getTarget: () => ({discoverInputs})});
        assert.equal(typeof route.discoverInputs().unsupported, 'string');
    }
});

test('a whole scoped pose crosses history once and the target once, in that order', () => {
    const events = [];
    const sets = [{component: 'accelerometer', channel: 'x', value: 1},
        {component: 'magnetometer', channel: 'x', value: 30}];
    const route = createEngineeringInputRoute({
        getTarget: () => ({setInputs: rows => {
            events.push(['write', rows]); return {accepted: true};
        }}),
        beforeWrite: () => { events.push('fork'); return {accepted: true}; },
        onApplied: () => events.push('refresh')
    });
    assert.deepEqual(route.setInputs(sets), {accepted: true});
    assert.deepEqual(events, ['fork', ['write', sets], 'refresh']);
});

test('history rejection prevents any engine write or refresh', () => {
    const refused = {accepted: false, code: 'fork-rollback-failed', reason: 'retained history'};
    const route = createEngineeringInputRoute({
        getTarget: () => ({setInputs: () => { throw Error('must not write'); }}),
        beforeWrite: () => refused,
        onApplied: () => { throw Error('must not refresh'); }
    });
    assert.equal(route.setInputs([]), refused);
});

test('malformed history and request verdicts cannot become accepted writes', () => {
    let writes = 0;
    const route = createEngineeringInputRoute({
        getTarget: () => ({setInputs: () => { writes++; return {accepted: true}; }}),
        beforeWrite: () => ({})
    });
    assert.equal(route.setInputs([]).code, 'input-history-unavailable');
    assert.equal(route.setInputs({}).code, 'input-rejected');
    assert.equal(writes, 0);
});

test('engine rejections and exceptions are reported without refreshing', () => {
    for (const setInputs of [
        () => ({accepted: false, code: 'input-rejected', reason: 'range'}),
        () => { throw Error('atomic transaction rejected'); },
        () => undefined
    ]) {
        let refreshed = 0;
        const route = createEngineeringInputRoute({getTarget: () => ({setInputs}),
            onApplied: () => { refreshed++; }});
        assert.equal(route.setInputs([]).accepted, false);
        assert.equal(refreshed, 0);
    }
});

test('a UI refresh exception cannot falsely report an accepted write as rejected', () => {
    const route = createEngineeringInputRoute({
        getTarget: () => ({setInputs: () => ({accepted: true})}),
        onApplied: () => { throw Error('UI listener'); }
    });
    assert.deepEqual(route.setInputs([]), {accepted: true});
});

test('replacement targets are resolved for each write, not cached at construction', () => {
    const writes = [];
    let target = {setInputs: () => { writes.push(1); return {accepted: true}; }};
    const route = createEngineeringInputRoute({getTarget: () => target});
    route.setInputs([]);
    target = {setInputs: () => { writes.push(2); return {accepted: true}; }};
    route.setInputs([]);
    assert.deepEqual(writes, [1, 2]);
});

test('runner route preserves fork/reset semantics and explicit board selection', () => {
    const source = readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js', import.meta.url), 'utf8');
    assert.match(source, /discoverInputs: \(\) => engineeringInputs\.discoverInputs\(\)/);
    assert.match(source, /setInputs: sets => engineeringInputs\.setInputs\(sets\)/);
    const route = source.slice(source.indexOf('const engineeringInputs ='), source.indexOf('let reverseContinue;'));
    assert.match(route, /getTarget: \(\) => target/);
    assert.match(route, /beginForwardBranch\(\)/);
    assert.match(route, /reverseCursor = null/);
    assert.match(route, /reverseContinue\.reset\(\)/);
    assert.match(source, /boardVariant: labwiredBoardVariant/);
    assert.match(source, /Object\.hasOwn\(chip\.onBoardVariants/);
});

test('owned overlay and prepared package carry the same route and runner', () => {
    for (const file of ['engineering-input-route.js', 'debug-runner.js']) {
        const relative = 'scratch-gui/src/lib/bw-debug/' + file;
        assert.deepEqual(readFileSync(new URL('../overlay/' + relative, import.meta.url)),
            readFileSync(new URL('../packages/' + relative, import.meta.url)));
    }
});
