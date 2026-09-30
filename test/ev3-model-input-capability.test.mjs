import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';
const require_ = createRequire(import.meta.url);
const {OPERATIONS} = require_('../overlay/scratch-vm/src/extension-support/capability-broker.js');

test('EV3 model input vocabulary permits only named buttons and bounded raw ADC values', () => {
    const button = OPERATIONS['renode.ev3.button.set'].validate;
    const analog = OPERATIONS['renode.ev3.analog.set-channel'].validate;
    assert.equal(button({button: 'center', pressed: true}), true);
    assert.equal(analog({channel: 15, value: 1023}), true);
    for (const args of [{button:'sysbus',pressed:true}, {button:'center',pressed:1},
        {button:'center',pressed:true,code:'eval'}]) assert.equal(button(args), false);
    for (const args of [{channel:16,value:0}, {channel:true,value:0}, {channel:0,value:1024},
        {channel:0,value:0,code:'eval'}, {channel:0,value:0.5}]) assert.equal(analog(args), false);
});
