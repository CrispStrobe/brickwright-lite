# Independent virtual SPIKE simulator

Scratch blocks, Brickwright `DEVICE SPIKE` programs and supported LEGO SPIKE App 3
Python imports run through the same virtual hub and arena. Open a SPIKE program
in the Code tab, choose **SPIKE arena**, and press **Start**. LEGO Python has its
own **Run on SPIKE 3 (Python)** action, which imports supported calls into blocks.
There is no firmware runtime, firmware download or hardware flashing in this
simulator. Unsupported Python calls are reported by the importer.

`VirtualSpikeHubState.backend` and `.motors` are the same controller. The arena
owns simulated time while running; standalone callers can use
`backend.pace(ms, {realtime})`. Fixed 1 ms physics steps carry fractional time
forward. Motors, sensors, buttons, IMU, matrix and speaker share the hub state.
Closing the simulator interrupts pending motion, sounds and waits.

Supported behavior includes acceleration/deceleration, signed position and speed
control, finite timed commands, concurrent ports, brake/coast/hold, synthetic
load/stall, replacement, abort signals and exactly-once completion. Sensor values
come from the arena or hub inputs. See [the functional contract](CONTRACT.md).

Limitations: this is a virtual educational model, not measured physical SPIKE
accuracy. Load is synthetic, contact uses wheel slip rather than automatic shaft
locking, sensors have no noise, media-file playback and arbitrary Python execution
are unsupported. Medium motor device 48 uses a 950 degrees/second shaft envelope
while its nominal API scale remains 1110 degrees/second. Other devices retain
nominal bounds. Beeps expose speaker state and an optional frequency callback;
this backend does not synthesize browser audio.

The independently authored controller and speed envelope are BSD-3-Clause.
Retained hub/arena/compiler infrastructure keeps its original licences; see
[THIRD-PARTY-NOTICES](../../THIRD-PARTY-NOTICES.md). The historical external
reference experiments, runtime retirement archive, synthetic fixtures and complete
operational implementation transcripts are kept in the
[private audit repository](https://github.com/CrispStrobe/brickwright-firmware-private/tree/audit/independent-spike-20260930/audits/independent-spike/).
They establish only the tested contract, not general firmware compatibility.

Use Node 22 and the normal vendor/integration workflow for GUI/VM dependencies.
Standalone controller tests require no GUI packages:

```sh
node --test test/independent-spike-controller.test.mjs test/independent-spike-speed-envelope.test.mjs
# Validation receipts require an explicit private destination:
export BW_SPIKE_EVIDENCE_DIR=/absolute/path/outside/brickwright-lite/to/private/evidence
node scripts/verify-independent-spike.mjs
BW_SPIKE_BUILD_ROOT=/absolute/path/to/current/gui/build node scripts/verify-spike-simulator-browser.mjs
```

The verification gate runs the standalone controller, shared hub, real Scratch
extensions, arena and Python importer checks. Public tests are self-contained
and do not load historical external-reference fixtures. Browser verification
checks that the virtual SPIKE flow requests no firmware binaries.
