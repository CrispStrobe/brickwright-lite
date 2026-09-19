import test from 'node:test';
import assert from 'node:assert';
import {yosysToModel} from '../overlay/scratch-gui/src/lib/bw-fpga/yosys-to-model.js';

test('yosysToModel parses a basic prep netlist and reconstructs buses', () => {
    // This JSON represents:
    // module test(input [3:0] a, input [3:0] b, input sel, output [3:0] out);
    //   wire [3:0] sum = a + b;
    //   assign out = sel ? sum : {a[3:2], b[1:0]};
    // endmodule
    const jsonText = `
{
  "modules": {
    "test": {
      "ports": {
        "a": { "direction": "input", "bits": [ 2, 3, 4, 5 ] },
        "b": { "direction": "input", "bits": [ 6, 7, 8, 9 ] },
        "sel": { "direction": "input", "bits": [ 10 ] },
        "out": { "direction": "output", "bits": [ 11, 12, 13, 14 ] }
      },
      "cells": {
        "$add": {
          "type": "$add",
          "port_directions": { "A": "input", "B": "input", "Y": "output" },
          "connections": { "A": [ 2, 3, 4, 5 ], "B": [ 6, 7, 8, 9 ], "Y": [ 15, 16, 17, 18 ] }
        },
        "$mux": {
          "type": "$mux",
          "port_directions": { "A": "input", "B": "input", "S": "input", "Y": "output" },
          "connections": { "A": [ 6, 7, 4, 5 ], "B": [ 15, 16, 17, 18 ], "S": [ 10 ], "Y": [ 11, 12, 13, 14 ] }
        }
      }
    }
  }
}`;
    const {model, problems} = yosysToModel(jsonText);
    assert.strictEqual(problems.length, 0);
    
    // We should have exactly 4 I/O nodes, 2 cells, 2 slices (for a[3:2] and b[1:0]), 1 concat, and 2 consts = 11 nodes
    assert.strictEqual(model.nodes.length, 11);
    
    const mux = model.nodes.find(n => n.type === 'mux');
    assert.ok(mux);
    
    const slices = model.nodes.filter(n => n.type === 'slice');
    assert.strictEqual(slices.length, 2);
    
    const concat = model.nodes.filter(n => n.type === 'concat');
    assert.strictEqual(concat.length, 1);
});
