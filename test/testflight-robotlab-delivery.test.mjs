import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow = readFileSync(new URL('../.github/workflows/mobile.yml', import.meta.url), 'utf8');
const signed = workflow.split('\n  ios-signed:\n')[1].split('\n  ios-device:\n')[0];
const gate = step => signed.split(`      - name: ${step}\n`)[1].split('\n')[0].trim().slice(4);
const accepts = (expression, {event = 'workflow_dispatch', ref = 'refs/heads/delivery/robotlab-testflight-20261021', beta = false, sign = true, device = false} = {}) => {
    const values = {'github.event_name': event, 'github.ref': ref, 'inputs.testflight_robotlab': beta, 'inputs.sign_ios': sign, 'inputs.device_ipa': device};
    let js = expression.replace(/startsWith\(github.ref, 'refs\/tags\/'\)/g, String(ref.startsWith('refs/tags/')));
    for (const [name, value] of Object.entries(values)) js = js.replaceAll(name, JSON.stringify(value));
    assert.match(js, /^[\s\w\d_'"=.!&|()/:-]+$/);
    return Function(`"use strict"; return (${js});`)();
};
test('only explicit isolated beta delivery or a real tag push can upload', () => {
    const expression = gate('Validate + upload to App Store Connect');
    assert.equal(accepts(expression), false);
    assert.equal(accepts(expression, {beta: true}), true);
    for (const args of [{beta: true, sign: false}, {beta: true, device: true}, {beta: true, ref: 'refs/heads/main'}, {ref: 'refs/tags/v0.1.25'}, {beta: true, event: 'pull_request'}]) assert.equal(accepts(expression, args), false, JSON.stringify(args));
    assert.equal(accepts(expression, {event: 'push', ref: 'refs/tags/v0.1.25'}), true);
});
test('tester notes and group assignment follow the same explicit beta authorization', () => {
    for (const step of ['Send tester notes to App Store Connect', 'Distribute to TestFlight (internal + external)']) {
        const expression = gate(step);
        assert.equal(accepts(expression), false);
        assert.equal(accepts(expression, {beta: true}), true);
        assert.equal(accepts(expression, {beta: true, ref: 'refs/heads/main'}), false);
        assert.equal(accepts(expression, {beta: true, device: true}), false);
    }
});
