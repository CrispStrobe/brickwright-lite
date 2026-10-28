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
| `serialization` | Flatten's numeric promotion, packed cluster fields, nested arrays, template mismatch and embedded zero bytes |
| `serialization-scalars` | FlattenVar/UnflattenVar roundtrips for declared-width integers, raw float bytes and strings |
| `file-syscalls` | data-file capacity, binary read/write, append, resolve, rename/delete, ListFiles, word errors and an open writer for stop/normal cleanup |

## How they were produced

The file-syscalls fixture was compiled once on 2026-10-26 through the hosted
contract below. Its executable is 2,994 bytes, SHA-256
`f2e5f00bf5f6ae3103605d87fe05a657d7d6539bd9624e04e4383ee099974a9b`.
Source and executable digests are asserted together in the focused test. It uses
standard firmware calls, leaves a partial writer open across a one-second Wait,
and prints independently specified status/count/data observations before retirement.

The two serialization fixtures were compiled once each on 2026-10-25 through
the same hosted compiler contract below. Their source is BSD-3-Clause and the
retained compiler responses bind each source and executable digest. Tests only
read the committed bytes. `Flatten` promotes its numeric argument to a long;
`FlattenVar` preserves the declared type, so a flattened short can roundtrip to
a short while a four-byte promoted value correctly fails that template size.

The `iomap-buttons` fixture was compiled once on 2026-10-28 through the same
hosted service. Its source SHA-256 is
`f7b80fe5d8ffa3f0921ff5899199752cd16acf8bf309fb94f5afa539ec8bab8c`;
its 2,482-byte RXE SHA-256 is
`98dad4688109d14d4c8260b72ae52e3d5c519e8e73252f5d7485495a9a52d25b`.
The service returned successful compilation but no compiler-version field.
It exercises standard name-based IOMapRead/Write, signed errors, destination
preservation/clearing and the bounded Button reset. Its tests seed one release
and a held button, and require upload/run, Stop/restart and running-snapshot
behavior on the actual virtual brick. Tests never invoke the compiler.

The original ten fixtures were compiled on 2026-10-20 with the owner's hosted NBC/NXC compiler,
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
