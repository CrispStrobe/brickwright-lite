// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const requireGui = createRequire(new URL('../packages/scratch-gui/package.json', import.meta.url));
const React = requireGui('react');
const {renderToStaticMarkup} = requireGui('react-dom/server');
const babel = requireGui('@babel/core');
const source = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-stats.jsx', import.meta.url), 'utf8');
const code = babel.transformSync(source, {filename: 'sim-lab-stats.jsx', babelrc: false, configFile: false,
    presets: [requireGui.resolve('@babel/preset-react')], plugins: [requireGui.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
const module = {exports: {}};
new Function('require', 'module', 'exports', code)(requireGui, module, module.exports);
const {default: Stats, statisticsRows} = module.exports;
const measurement = {status: 'running', rtf: 0.996, simMs: 10000, timeScale: 1, worker: true,
    stats: {workerMs: 4240, roundTripMs: 200, batches: 10, steps: 2000, redos: 0, diverged: 0, droppedMs: 0}};

test('measured physics costs use simulated time and batch counts without changing counters', () => {
    const before = structuredClone(measurement);
    const rows = Object.fromEntries(statisticsRows({...measurement, locale: 'en'}).map(r => [r.id, r.value]));
    assert.equal(rows.speed, '1.00×');
    assert.equal(rows.cost, '424.0');
    assert.equal(rows.trip, '20.00 ms');
    assert.equal(rows.steps, '2000');
    assert.equal(rows.dropped, '0.0 ms');
    assert.deepEqual(measurement, before);
});

test('paused near-real-time speed remains visible and is labelled as the last measurement in both languages', () => {
    for (const [locale, label, speed] of [['en', 'Last measured speed', '1.00×'], ['de', 'Zuletzt gemessenes Tempo', '1,00×']]) {
        const html = renderToStaticMarkup(React.createElement(Stats, {locale,
            measurement: {...measurement, status: 'paused'}, onClose () {}}));
        assert.ok(html.includes(label));
        assert.ok(html.includes(speed));
        assert.match(html, /data-testid="bw-sim-lab-stats-close"/);
    }
});

test('absent or invalid measurements stay unavailable; measured zero is retained', () => {
    for (const rtf of [null, undefined, NaN, Infinity, -1]) {
        const rows = statisticsRows({locale: 'en', rtf, simMs: 0, stats: {workerMs: 0, batches: 0, roundTripMs: 0}});
        for (const id of ['speed', 'cost', 'trip', 'steps', 'dropped']) assert.equal(rows.find(r => r.id === id).value, '—');
    }
    assert.equal(statisticsRows({...measurement, rtf: 0})[0].value, '0.000×');
    const html = renderToStaticMarkup(React.createElement(Stats, {locale: 'en', measurement: {}, onClose () {}}));
    assert.doesNotMatch(html, /NaN|Infinity|undefined/);
});
