import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setupDevices,deviceCases} from '../scripts/lib/i8086-device-workload.mjs';
test('isolated device probes advance real devices and record observable state', () => {
    for (const name of deviceCases) {
        const result=setupDevices(name).run(50000);
        assert.equal(result.state.cycles,593750);
        assert.ok(result.wallMs>0);
        if (name==='dispatch') assert.equal(result.state.dispatch,result.state.cycles);
        else if (name!=='pit-idle') assert.ok(result.state.events>0,name);
    }
    assert.throws(()=>setupDevices('unknown'),/Unknown/);
});
