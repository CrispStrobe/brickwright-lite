// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Reviewer-side black-box comparison. No helper implementation is inspected.
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createPybricksHost} from '../overlay/scratch-gui/src/lib/pybricks-sim/pybricks-hub-host.js';
const require = createRequire(import.meta.url);
const dir = resolve(process.argv[2] || 'overlay/scratch-gui/static/pybricks-sim');
let output = '';
const host = await createPybricksHost({factory: require(resolve(dir, 'pybricks-hub.js')),
    wasmBinary: readFileSync(resolve(dir, 'pybricks-hub.wasm')), realtime: false,
    onOutput: text => {output += text;}});
host.setDevice('A', 'motor-m');
host.setDevice('B', 'motor-m');
const source = `from pybricks.hubs import PrimeHub
from pybricks.pupdevices import Motor
from pybricks.parameters import Port, Direction, Stop
from pybricks.robotics import DriveBase
from pybricks.tools import wait, StopWatch
m = Motor(Port.A)
n = Motor(port=Port.B, reset_angle=False)
h = PrimeHub()
d = DriveBase(m, n, 56, 112)
cases = [
    ("missing-class", lambda: Motor()),
    ("unknown-class", lambda: Motor(Port.A, surprise=True)),
    ("duplicate-class", lambda: Motor(Port.A, port=Port.B)),
    ("extra-class", lambda: Motor(Port.A, Direction.CLOCKWISE, None, True, None, 123)),
    ("function-pos", lambda: wait(0)),
    ("function-kw", lambda: wait(time=0)),
    ("function-missing", lambda: wait()),
    ("function-extra", lambda: wait(0, 1)),
    ("function-unknown", lambda: wait(unknown=0)),
    ("function-duplicate", lambda: wait(0, time=1)),
    ("control-get", lambda: m.control.limits()),
    ("control-none", lambda: m.control.limits(None, None, None)),
    ("control-kw", lambda: m.control.limits(speed=500, acceleration=1000)),
    ("control-get-after", lambda: m.control.limits()),
    ("control-unknown", lambda: m.control.limits(bad=1)),
    ("control-extra", lambda: m.control.limits(1, 2, 3, 4)),
    ("control-duplicate", lambda: m.control.limits(500, speed=600)),
    ("pid-get", lambda: m.control.pid()),
    ("pid-none", lambda: m.control.pid(None, None, None, None, None, None)),
    ("tolerance-get", lambda: m.control.target_tolerances()),
    ("stall-get", lambda: m.control.stall_tolerances()),
    ("method-required", lambda: m.run()),
    ("method-keyword", lambda: m.run(speed=100)),
    ("method-unknown", lambda: m.run(wrong=100)),
    ("method-duplicate", lambda: m.run(100, speed=200)),
    ("method-extra", lambda: m.run(100, 200)),
    ("method-stop", lambda: m.stop()),
    ("reset-int", lambda: m.reset_angle(15)),
    ("reset-kw", lambda: m.reset_angle(angle=20)),
    ("reset-result", lambda: m.angle()),
    ("drive-get", lambda: d.settings()),
    ("drive-none", lambda: d.settings(None, None, None, None)),
    ("drive-kw", lambda: d.settings(straight_speed=200)),
    ("drive-after", lambda: d.settings()),
    ("pixel-required", lambda: h.display.pixel()),
    ("pixel-default", lambda: h.display.pixel(0, 0)),
    ("pixel-kw", lambda: h.display.pixel(row=0, column=1, brightness=50)),
    ("stopwatch-default", lambda: StopWatch().time()),
]
for label, run in cases:
    try:
        print(label, "ok", repr(run()))
    except Exception as error:
        print(label, str(type(error)), str(error))
`;
const result = await host.run(source);
if(result.result !== 'ok') throw new Error(JSON.stringify(result) + '\n' + output);
process.stdout.write(output.replace(/\r\n/g, '\n'));
