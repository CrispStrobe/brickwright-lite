import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const packagePath = '../packages/scratch-gui/src/components/monitor/';
const overlayPath = '../overlay/scratch-gui/src/components/monitor/';

test('list monitor keeps its fixed shell synchronous and mirrors every owned source', () => {
    for (const file of ['list-monitor.jsx', 'list-monitor-scroller.jsx', 'list-monitor-scroller-body.jsx']) {
        assert.equal(read(`${packagePath}${file}`), read(`${overlayPath}${file}`), `${file} mirror diverged`);
    }
    const shell = read(`${packagePath}list-monitor.jsx`);
    assert.match(shell, /data-testid="list-monitor-shell"/);
    assert.match(shell, /width: `\$\{width\}px`[\s\S]*height: `\$\{height\}px`/);
    assert.doesNotMatch(shell, /react-virtualized/);
});

test('scrolling body is named, shared, retryable and demanded only on intersection', () => {
    const loader = read(`${packagePath}list-monitor-scroller.jsx`);
    assert.match(loader, /let bodyRequest = null/);
    assert.match(loader, /webpackChunkName: "list-monitor-body"/);
    assert.match(loader, /bodyRequest = null;[\s\S]*throw error/);
    assert.match(loader, /new window\.IntersectionObserver\(this\.handleIntersection\)/);
    assert.match(loader, /new window\.MutationObserver\(this\.checkVisibility\)/);
    assert.match(loader, /getClientRects\(\)\.length/);
    assert.match(loader, /entry\.isIntersecting[\s\S]*intersectionRect\.width > 0/);
    assert.match(loader, /if \(!this\.mounted \|\| !entries\.some/);
    assert.match(loader, /this\.mounted = false[\s\S]*this\.loadGeneration\+\+/);
    assert.match(loader, /generation !== this\.loadGeneration/);
    assert.match(loader, /data-testid="list-monitor-body-loading"/);
    assert.match(loader, /data-testid="list-monitor-body-retry"/);
    assert.doesNotMatch(loader, /componentDidMount \(\) \{[\s\S]{0,100}this\.load\(\)/,
        'supported browsers must not load merely because a hidden stage is mounted');
});

test('deferred body uses only the List leaf and exposes stable row selectors', () => {
    const body = read(`${packagePath}list-monitor-scroller-body.jsx`);
    assert.match(body, /import List from 'react-virtualized\/dist\/es\/List'/);
    assert.doesNotMatch(body, /from 'react-virtualized'/);
    assert.match(body, /data-testid="list-monitor-scroll-body"/);
    assert.match(body, /data-list-index=\{index\}/);
    assert.match(body, /data-list-row-remove/);
});
