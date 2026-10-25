# EV3 `.rbf` fixtures

Small lmsasm programs written for the Virtual EV3's program VM
(`overlay/scratch-gui/src/lib/bw-sim/routes/ev3-vm/`, docs/EV3-RBF-VM.md), each beside the `.rbf` it
assembles to. The tests (`test/bw-sim-ev3-rbf-*.test.mjs`) read the `.rbf` files; they never assemble and
never call the network.

| Program | What it exercises |
|---|---|
| `wall-stopper` | B and C at power 40 until the ultrasonic sensor on input 4 reads 15 cm or less (INPUT_READSI, JR_GTF), brake, write "wall", wait 500 ms — the Robot Lab's EV3 wall stopper |
| `motor-timed` | OUTPUT_POWER / START for one second (TIMER_WAIT / READY), OUTPUT_READ, STOP; TIME_POWER and TIME_SPEED cycles with OUTPUT_TEST and OUTPUT_READY |
| `motor-degrees` | STEP_POWER, STEP_SPEED backwards, STEP_SYNC; OUTPUT_RESET, CLR_COUNT, READ, GET_COUNT |
| `touch-wait` | drive until the touch sensor on input 1 reads pressed (CP_GTF, JR_FALSE), stop, a tone and SOUND_READY |
| `arithmetic` | ADD/SUB/MUL/DIV 32, division by zero, MATH MOD32, 16- and 8-bit wrap, MOVE saturation and truncation, AND/OR/XOR/RL, CP_LT32, SELECT32, float ADD/DIV, MATH SQRT/ROUND/FLOOR/ABS, MOVE32_F |
| `arrays` | ARRAY CREATE32 / FILL / SIZE / COPY / INIT32 / RESIZE / DELETE, ARRAY_WRITE past the end, ARRAY_APPEND, ARRAY_READ; WRITE8 / READ8 on an ARRAY8; STRINGS NUMBER_TO_STRING / ADD / GET_SIZE / COMPARE |
| `subcalls` | IN/OUT/IO parameters of 8, 16, 32 bits and float, a nested CALL, a string in and out |
| `threads` | OBJECT_START of a second VMTHREAD, one subcall called by both (the second waits), a BLOCK by OBJECT_TRIG, OBJECT_WAIT |
| `sound-timers` | SOUND TONE / SOUND_TEST / SOUND_READY / BREAK, TIMER_WAIT / READY / READ, RANDOM, KEEP_ALIVE |
| `unimplemented` | reaches MAILBOX_OPEN, which the Virtual EV3 does not implement |

Each program that computes something ends by writing its results to the brick's console (UI_WRITE VALUE32 /
VALUEF / PUT_STRING) in the order its globals are declared: the tests read what the brick saw, never the
VM's variables. The vmthread MAIN is always the first object: the firmware starts object 1 only.

## How they were produced

Assembled on 2026-10-20 with the owner's hosted compiler, `POST https://lego-compiler.vercel.app/compile`
with `{"compiler": "lmsasm", "code": <the .lms text>}`, which returns the `.rbf` base64-encoded. The service
(CrispStrobe/legacy-lego-compiler `f2a7723`, an MIT wrapper) runs ev3dev's lmsasm (BSD-3-Clause) with its
defaults: the official LEGO byte codes, image version 0. The `.lms` sources are ours; the `.rbf` files are
lmsasm's output from them. Every file starts `LEGO` with its own size.

To rebuild one (not done by any test):

```sh
python3 - fixture.lms <<'EOF'
import json, sys, base64, urllib.request
src = open(sys.argv[1]).read()
req = urllib.request.Request('https://lego-compiler.vercel.app/compile',
    data=json.dumps({'compiler': 'lmsasm', 'code': src}).encode(), headers={'Content-Type': 'application/json'})
r = json.load(urllib.request.urlopen(req))
open(sys.argv[1].replace('.lms', '.rbf'), 'wb').write(base64.b64decode(r['base64']))
EOF
```

lmsasm emits objects in source order, so a program must declare its first vmthread before any subcall; and
its `ARRAY16` / `ARRAY32` / `ARRAYF` variables get one byte per element (docs/EV3-RBF-VM.md "Open"), so the
fixtures use `ARRAY8` and `DATAS`.
