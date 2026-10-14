/**
 * The canvas → SVG exporter renders the builder's model (nodes + wires) the way
 * the interactive canvas does, but as a pure string — a CLI/programmatic path to
 * "see" a design without driving the whole app in a browser. Reuses the shared
 * glyphs, so a gate looks identical here and on the canvas.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {canvasToSvg} from '../overlay/scratch-gui/src/lib/bw-fpga/canvas-svg.js';

const MODEL = {
    nodes: [
        {id: 'a', kind: 'in', name: 'a'}, {id: 'b', kind: 'in', name: 'b'},
        {id: 'k', kind: 'const', value: 1}, {id: 'g', kind: 'gate', type: 'and'},
        {id: 'y', kind: 'out', name: 'y'}
    ],
    edges: [
        {from: {node: 'a', port: 'out'}, to: {node: 'g', port: 'a'}},
        {from: {node: 'b', port: 'out'}, to: {node: 'g', port: 'b'}},
        {from: {node: 'g', port: 'out'}, to: {node: 'y', port: 'in'}}
    ]
};

test('renders every node with its glyph and every edge as a wire', () => {
    const svg = canvasToSvg(MODEL);
    assert.match(svg, /^<svg /);
    assert.match(svg, /class="gate" d="M .*A /, 'the AND gate uses the shared glyph');
    assert.match(svg, /class="io in".*|<text class="lbl"[^>]*>a</s, 'inputs are labelled boxes');
    assert.match(svg, /class="io out"/, 'the output box');
    assert.match(svg, /class="const"/, 'the constant box');
    assert.equal((svg.match(/class="wire"/g) || []).length, 3, 'one wire per edge');
});

test('uses supplied canvas positions when given (matches the live layout)', () => {
    const svg = canvasToSvg(MODEL, {a: {x: 5, y: 7}, g: {x: 200, y: 50}, y: {x: 400, y: 50}, b: {x: 5, y: 90}, k: {x: 5, y: 160}});
    assert.match(svg, /x="5" y="7"/, 'a node sits where the canvas placed it');
});

test('an empty design still yields a valid svg', () => {
    assert.match(canvasToSvg({nodes: [], edges: []}), /<svg [^>]*viewBox=/);
});
