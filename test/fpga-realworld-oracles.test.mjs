import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import {yosysToModel} from '../overlay/scratch-gui/src/lib/bw-fpga/yosys-to-model.js';

test('the visual parser cleanly handles massive real-world Verilog netlists', () => {
    const files = fs.readdirSync('test/realworld-oracles').filter(f => f.endsWith('.json'));
    assert.ok(files.length > 5, 'Should have multiple real-world fixtures');
    
    for (const file of files) {
        const jsonText = fs.readFileSync(`test/realworld-oracles/${file}`, 'utf8');
        const {model, problems} = yosysToModel(jsonText);
        
        assert.strictEqual(problems.length, 0, `Failed to parse ${file}: ${JSON.stringify(problems)}`);
        assert.ok(model.nodes.length > 5, `Expected ${file} to have multiple nodes`);
        assert.ok(model.edges.length > 5, `Expected ${file} to have multiple edges`);
        
        // Assert we successfully extracted slices and concats for bus routing
        const hasRouting = model.nodes.some(n => n.type === 'slice' || n.type === 'concat' || n.type === 'mux');
        assert.ok(hasRouting, `${file} should contain bus routing reconstruction`);
    }
});
