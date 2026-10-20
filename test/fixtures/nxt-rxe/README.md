# NXT `.rxe` fixtures

Small NXC programs written for the Virtual NXT's program VM
(`overlay/scratch-gui/src/lib/bw-sim/routes/nxt-vm/`, docs/NXT-RXE-VM.md), each beside the `.rxe` it
compiles to. The tests (`test/bw-sim-nxt-rxe-*.test.mjs`) read the `.rxe` files; they never compile and
never call the network.

| Program | What it exercises |
|---|---|
| `motor-timed` | OnFwd / OnRev / Float / OnFwdReg / Off with Waits (SETOUT, WAIT) |
| `rotate-motor` | RotateMotor to a tacho target forwards and back; tacho and rotation counts, run state (GETOUT polling) |
| `touch-bumper` | SetSensorTouch, drive B and C until SENSOR_1 is pressed, stop (the Robot Lab's nxt-bumper-bot) |
| `ultrasonic-stop` | SetSensorLowspeed, SensorUS over the I²C system calls, stop at 20 cm |
| `arithmetic` | 8/16/32-bit arithmetic, overflow, division and modulo by zero, logic, comparisons, abs/sign, shifts |
| `arrays-strings` | arrays (init, index, replace, subset, build), nested arrays, structs, arrays of structs, strings |
| `tasks-mutex` | three tasks (Precedes / Follows), a mutex around a shared counter with a Yield inside |
| `subroutines` | functions, `sub`, `inline`, `safecall` |
| `sound-timing` | PlayTone / PlayToneEx, Wait, CurrentTick / FirstTick, Random |
| `mailbox` | ReceiveRemoteString from inbox 1, SendResponseString to the response queue, runs until stopped |

## How they were produced

Compiled on 2026-10-20 with the owner's hosted NBC/NXC compiler,
`POST https://lego-compiler.vercel.app/compile` with `{"compiler": "nxc", "code": <the .nxc text>}`, which
returns the `.rxe` base64-encoded. The service (CrispStrobe/legacy-lego-compiler, an MIT wrapper) runs
John Hansen's NBC/NXC compiler (MPL-1.1; its version is not reported) as `nbc -I=<its includes> -O=<out> <src>`; its log says
"Compiling for firmware version 128, NBC/NXC enhanced = FALSE" — standard LEGO firmware, no Improved
Firmware opcodes. The `.nxc` sources are ours; the `.rxe` files are NBC's output from them. Every file
starts `MindstormsNXT\0` with format version 0.6.

To rebuild one (not done by any test):

```sh
python3 - fixture.nxc <<'EOF'
import json, sys, base64, urllib.request
src = open(sys.argv[1]).read()
req = urllib.request.Request('https://lego-compiler.vercel.app/compile',
    data=json.dumps({'compiler': 'nxc', 'code': src}).encode(), headers={'Content-Type': 'application/json'})
r = json.load(urllib.request.urlopen(req))
open(sys.argv[1].replace('.nxc', '.rxe'), 'wb').write(base64.b64decode(r['base64']))
EOF
```

NBC refuses (silently, "compilation failed") a function call nested in another call's arguments
(`square(square(3))`, `SendResponseString(q, StrCat(...))`) and the `~` operator for standard firmware;
the fixtures avoid both.
