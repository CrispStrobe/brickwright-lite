// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runLabHubProgram} from './helpers/lab-hubs-vm.mjs';

// The detached sensor starts high enough to fall freely during this finite probe.
// Its 30° roll comes from the actual scene transform, never injected sensor data.
const bench = [
    '0 WeDo tilt/light/tone bench', '0 !BW ID hub',
    '1 15 0 0 0 1 0 0 0 1 0 0 0 1 19071.dat',
    '0 !BW ID tilt', '0 !BW PORT B',
    '1 72 300 -2000 0 1 0 0 0 0.8660254 -0.5 0 0.5 0.8660254 20841.dat', ''
].join('\n');
const program = threshold => `WHEN flag clicked:
  wait until (wedo tilt angle right) > ${threshold}
  wedo set light color to 0
WHEN flag clicked:
  wait until (wedo tilt angle right) > ${threshold}
  wedo play note 69 for 0.1 seconds
`;
const judge = ({led, tones}) => led?.r === 255 && led?.g === 0 && led?.b === 0 &&
    tones.some(t => t.hz === 440 && t.ms === 100);

for (const transport of ['ble', 'scratchlink']) {
    const run = async threshold => {
        const observations = [];
        const r = await runLabHubProgram(program(threshold), {modelText: bench, transport, timeLimitMs: 500,
            onFrame: ({hub}) => observations.push({led: hub.led && {...hub.led}, tones: hub.tones.map(t => ({...t})),
                sensor: {...hub.sensors.get('B')}})});
        try {
            assert.equal(r.extensionId, 'wedo2unified');
            assert.equal(r.hub.profile.id, 'wedo2');
            assert.ok(observations.some(o => Math.abs(o.sensor.rollDeg + 30) < 1),
                'the physics, not a fake sensor, supplied the tilted reading');
            return observations;
        } finally { r.session.dispose(); }
    };
    test(`WeDo over ${transport}: scene tilt triggers the hub light and 440 Hz tone through the real extension`, async () => {
        const observations = await run(20);
        assert.ok(observations.some(judge), 'the sensor-gated program reached its physical hub outputs');
    });
    test(`WeDo over ${transport}: an unreachable tilt threshold fails the same light/tone judge`, async () => {
        const observations = await run(60);
        assert.equal(observations.some(judge), false);
        assert.ok(observations.every(o => o.tones.length === 0), 'the blocked program never emitted a tone');
    });
}
