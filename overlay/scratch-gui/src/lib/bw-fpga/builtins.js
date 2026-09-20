/**
 * Built-in composite blocks — the plexer/decoder family CircuitVerse exposes as
 * primitives, shipped here as ready-made gate models. Dropping one MERGES its
 * gates onto the canvas (via the template path), so it synthesises like anything
 * hand-built AND shows the learner how a decoder or demux is made from AND/NOT.
 *
 * Each entry is a template: {id, label, blurb, model:{nodes, edges}} — the same
 * shape examples.js uses, so the palette and the drop handler need no new code.
 *
 * @module
 */

import {sevenSegDecoderModel} from './output-devices.js';

const IN = (id, name) => ({id, kind: 'in', name, width: 1});
const OUT = (id, name) => ({id, kind: 'out', name, width: 1});
const G = (id, type) => ({id, kind: 'gate', type});
const E = (from, to, port) => ({from: {node: from, port: 'out'}, to: {node: to, port}});

export const BUILTINS = Object.freeze([
    {
        id: 'demux1to2', label: '1:2 Demultiplexer',
        blurb: 'Route one input to y0 or y1 by sel: y0 = in & ~sel, y1 = in & sel.',
        model: {
            nodes: [
                IN('din', 'in'), IN('sel', 'sel'),
                G('ns', 'not'), G('a0', 'and'), G('a1', 'and'),
                OUT('y0', 'y0'), OUT('y1', 'y1')
            ],
            edges: [
                E('sel', 'ns', 'a'),
                E('din', 'a0', 'a'), E('ns', 'a0', 'b'), E('a0', 'y0', 'in'),
                E('din', 'a1', 'a'), E('sel', 'a1', 'b'), E('a1', 'y1', 'in')
            ]
        }
    },
    {
        id: 'decoder2to4', label: '2:4 Decoder',
        blurb: 'Two select bits light exactly one of four one-hot outputs.',
        model: {
            nodes: [
                IN('s0', 's0'), IN('s1', 's1'),
                G('n0', 'not'), G('n1', 'not'),
                G('a0', 'and'), G('a1', 'and'), G('a2', 'and'), G('a3', 'and'),
                OUT('y0', 'y0'), OUT('y1', 'y1'), OUT('y2', 'y2'), OUT('y3', 'y3')
            ],
            edges: [
                E('s0', 'n0', 'a'), E('s1', 'n1', 'a'),
                E('n1', 'a0', 'a'), E('n0', 'a0', 'b'), E('a0', 'y0', 'in'), // ~s1 & ~s0
                E('n1', 'a1', 'a'), E('s0', 'a1', 'b'), E('a1', 'y1', 'in'), // ~s1 &  s0
                E('s1', 'a2', 'a'), E('n0', 'a2', 'b'), E('a2', 'y2', 'in'), //  s1 & ~s0
                E('s1', 'a3', 'a'), E('s0', 'a3', 'b'), E('a3', 'y3', 'in')  //  s1 &  s0
            ]
        }
    },
    {
        id: 'seg7_decoder', label: '7-seg decoder (4→7)',
        blurb: 'A 4-bit number in (d0–d3), seven segment-drive signals out (seg_a–seg_g): the classic hex font, minimised to a real gate circuit — drop it and see how a display driver is built.',
        model: sevenSegDecoderModel()
    },
    {
        id: 'counter7seg', label: 'Counter → 7-seg (0…F)',
        blurb: 'A 4-bit counter driving a seven-segment display: drop it, Run, and step the clock to watch it count 0…F on the digit — registers + datapath + a display, wired.',
        model: {
            nodes: [
                {id: 'clk', kind: 'in', name: 'clk', width: 1},
                {id: 'one', kind: 'const', value: 1, width: 4},
                {id: 'q', kind: 'gate', type: 'dff', width: 4},
                {id: 'add', kind: 'gate', type: 'add', width: 4},
                {id: 'count', kind: 'out', name: 'count', width: 4},
                {id: 'disp', kind: 'seg7'}
            ],
            edges: [
                E('clk', 'q', 'clk'),
                E('q', 'add', 'a'), E('one', 'add', 'b'), E('add', 'q', 'd'),
                E('q', 'count', 'in'), E('q', 'disp', 'd')
            ]
        }
    }
]);
