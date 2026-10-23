# Model connections and brick buttons

Open a Robot Lab model and use **Program connection** to choose its brick and
connection. **Connect** connects the program's loaded extension to that model;
**Run** starts the program. **Disconnect** closes that connection. Changing the
model or connection cancels an outstanding connection request.

Cancellation invalidates the request's result immediately. Provider cleanup is
serialized; the status-polling limit is not an overall connect or cleanup
deadline. The pane stops its clock and detaches the old routes before waiting
for that cleanup, so a delayed old provider cannot restart a replacement scene.

If Run fails after setup begins, its current clock, program and routes are
retired before the failure is returned. The pane reports the paused failure
while provider cleanup drains. Operation, cleanup and feedback errors are
retained together; uncertain cleanup refuses another connection. A newer Run
keeps ownership when an older callback fails.

The connection uses the extension's own blocks and protocol. The model supplies
the motor encoders and sensors that those blocks read.

| Extension | Connection | Model endpoint |
| --- | --- | --- |
| `ev3comprehensive` | USB serial | Virtual EV3 serial port, 115200 baud |
| `ev3comprehensive` | Local bridge | `ws://localhost:8080/`, binary EV3 frames |
| `legonxt` | USB serial | Virtual NXT serial port, 9600 baud |
| `legonxt` | Local bridge | `ws://localhost:8765/`, base64 NXT telegrams |
| `spikeprime`, SPIKE 2.x native model | Local bridge | `ws://localhost:8081/`, REPL text |
| `legopoweredup`, `legoboostunified` | HTTP bridge | `http://localhost:8080/`, LWP3 bridge requests |
| `scratchtoev3` / ev3dev | HTTP bridge | `http://127.0.0.1:8080/`, ev3dev requests |

Bluetooth retains the Lab's existing connection path. Stock Bluetooth-only
extensions do not gain serial or HTTP blocks from this selector. SPIKE firmware
lockstep and the official-v3 profile do not expose a second native 2.x REPL.

The selected virtual routes claim the listed loopback addresses and paths. A
missing or replaced model refuses those connections. Other addresses and
unrelated paths retain their normal network meaning; project blocks containing
custom remote URLs still use those URLs. Closing the Lab releases its wrappers
and connections while preserving other owners' wrappers.

## Brick buttons

**Brick buttons** shows the inputs modelled by the selected scene. Hold a button
with the pointer, Space or Enter. Releasing it, cancelling the pointer, leaving
the window, hiding the page, replacing the model or closing the pane releases
the UI's held input. Assistive activation produces a short press. Another
input owner's hold is preserved.

The runtime exposes the same capability as `runtime.robotLab`; the mounted
Lab's diagnostic handle is `window.__bwSimLab.api`:

```js
const api = window.__bwSimLab.api;
const bricks = api.brickButtons(); // hub, profile, supported names/indices and held state
const ev3 = bricks.find(brick => brick.profile === 'ev3');
const held = api.holdButton(ev3.hub, 'enter');
if (held.ok) held.release(); // idempotent; bound to this brick and scene

api.pressButton(ev3.hub, 'up', true);
api.pressButton(ev3.hub, 'up', false);
```

| Model | Inputs |
| --- | --- |
| EV3 | `up` 1, `enter` 2, `down` 3, `right` 4, `left` 5, `back` 6 |
| NXT | `exit` 0, `right` 1, `left` 2, `enter` 3 |
| Native SPIKE Prime | Available named `left`, `center`, `right`, `bluetooth` inputs |
| LWP3 and WeDo 2.0 | One `button`, index 0 |

The pressed state must be Boolean. Unknown bricks, unsupported capabilities,
invalid indices and calls made while the scene changes return a refusal.
EV3's NONE and ANY query sentinels are not pressable inputs. An EV3
`UI_BUTTON WAIT_FOR_PRESS` command resumes when a valid held input arrives.
NXT input does not clear its Button IOMap counters. LWP3 and WeDo expose the
state through their existing property or characteristic and notifications.
Firmware-owned inputs, physical power/pairing and firmware button-event phases
remain outside this modelled input API.

## EV3 synchronized motion

For a two-motor sync, turn ratio 0 requests equal shaft motion; magnitude 100
keeps the inner shaft stationary; magnitude 200 requests equal counter-rotation.
A positive ratio selects the lower output as master, a negative ratio the
higher output. STEP_SYNC counts master travel; TIME_SYNC uses one elapsed-time
bound. Zero duration remains unbounded. These protocol facts follow the
[LEGO firmware interface](https://raw.githubusercontent.com/mindboards/ev3sources/master/lms2012/c_output/source/c_output.c)
and [Firmware Developer Kit](https://www.lego.com/cdn/cs/set/assets/blt77bd61c3ac436ea3/LEGO_MINDSTORMS_EV3_Firmware_Developer_Kit.pdf).

The Lab couples the shafts by correcting their relative phase, using one speed
scale bounded by both motor types. Finite count moves share a model braking
ramp. An independent stop, reset, power/speed, polarity or finite command on
either shaft retires the previous pair before claiming its outputs; START and
CLR_COUNT preserve a running pair. The interruption behavior follows the
[firmware command boundary](https://raw.githubusercontent.com/mindboards/ev3sources/master/lms2012/d_pwm/Linuxmod_AM1808/d_pwm.c).
The coupling gain and braking ramp are Lab model choices. This does not claim
the firmware's controller constants, cycle timing or hardware accuracy.

The source controls exercise signed turn ratios, phase correction, stationary
inner shafts, mixed motor types, interruption and worker state. Actual Jolt
guests exercise WAIT_FOR_PRESS and nine sync turn cases on the main thread and
physics worker. Transport guests run the actual bundled extensions and shipped
robot programs, including a shorter-motion negative control.
