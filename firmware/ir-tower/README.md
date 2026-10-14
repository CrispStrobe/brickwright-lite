# A portable RCX infrared tower

An LED, a 38 kHz receiver module, and one line of algebra:

```
IR LED drive = carrier(38 kHz) AND NOT(host TXD)
host RXD     = receiver output
```

That is the whole device. It has no baud rate, no framing, no buffer and no
state, so the same firmware carries 2400 8-O-1 (normal RCX traffic) and the
4800 8-N-1 that `firmdl3` uses for firmware download, and anything anyone
invents later. The contract this implements is
[`docs/RCX-IR-TOWER-FIRMWARE.md`](../../docs/RCX-IR-TOWER-FIRMWARE.md); the
host side that drives it already exists as
[`overlay/scratch-gui/src/lib/rcx/rcx-protocol.js`](../../overlay/scratch-gui/src/lib/rcx/rcx-protocol.js).

## Layout

```
include/irtower.h        the driver's interface, and what a gate is
include/irtower_port.h   the five-and-a-bit functions a new board implements
src/irtower.c            the portable half — identical on every board
boards/attiny85/         8-bit AVR, software gate           (avr-gcc)
boards/host-sim/         pins are variables, carrier is a counter   (cc)
boards/rp2040/           PIO state machine, hardware gate   (pico-sdk)
test/                    the host simulation: carrier, gate, loopback
```

A board is a directory with a `board.h` (its recorded numbers, and nothing
that needs a vendor SDK) and a `port.c`. Adding a third board should touch
nothing else; if it does, the port interface is wrong and should be fixed
rather than worked around.

## Verifying it without hardware

```
make test
```

Half a second, one C compiler, no MCU and no LEGO in the room. It builds the
driver twice — once software-gated, once hardware-gated — against the host
port and then:

1. **the carrier alone**, counted and its duty measured over 100 ms;
2. **the gate**, asserting at every 500 ns step that the LED drive is the
   carrier ANDed with the inverse of TXD, against a carrier phase computed
   independently of the port's own counter. The software-gated build is
   allowed to lag by one poll period and the measured lag is checked against
   the board's recorded jitter;
3. **loopback through a modelled receiver module**, with the model's burst,
   gap, delay and AGC figures taken from the Vishay datasheets — every byte
   must come back byte-identical.

`npm test` runs the same thing from `test/ir-tower-firmware.test.mjs`, which
also pins the recorded per-board numbers so that changing one needs a diff a
reviewer can see.

## The recorded numbers

Each board's figures are re-derived from its clock and divisor by the test
suite, so they cannot drift away from the arithmetic they came from.

| board | clock | divider | carrier | error | gate | sample rate | worst-case edge jitter |
| --- | --- | --- | --- | --- | --- | --- | --- |
| attiny85 | 8 MHz RC | Timer0 fast PWM, TOP = 210 (211 clocks) | 37 914.691 Hz | −2244 ppm (−0.22 %) | software, 14-cycle loop | 571 428 Hz | 1 750 ns (0.42 % of a bit) |
| host-sim | 1 GHz (simulated) | exact | 38 000.000 Hz | 0 | software, by construction | 20 000 Hz | 50 000 ns (12 % of a bit) |
| rp2040 | 125 MHz XOSC/PLL | PIO clkdiv 411 + 47/256, 8 cycles/period | 38 000.057 Hz | +1 ppm | hardware (PIO) | 38 000 Hz | 26 316 ns (6.3 % of a bit) |

Two things about that table are worth more than the numbers in it:

* **On the ATtiny85 the divider error is not the error that matters.** The
  ATtiny25/45/85 datasheet (2586Q–AVR–08/2013, Table 21-2) gives the internal
  RC oscillator's factory calibration accuracy as **±10 %** and user
  calibration via `OSCCAL` as **±1 %**. Ten percent of 38 kHz is ±3.8 kHz, and
  a TSOP48.. receiver's −3 dB passband is only `f0/10` = 3.8 kHz wide (Vishay
  82459 Fig. 5). An uncalibrated part can therefore sit at the edge of the
  passband and lose most of its range while still working across a desk. Use a
  crystal or resonator, or calibrate `OSCCAL` against a known reference, if
  range matters. The −0.22 % divider error is two orders of magnitude smaller
  than the thing nobody measures.
* **The RP2040's gate costs zero CPU** and still samples TXD once per carrier
  period, because the sampling is a `jmp pin` inside the carrier loop. Both
  numbers are properties of `tower.pio`, not of any code that runs.

For scale, the receiver module's own output-pulse tolerance is ±3.5 carrier
cycles (Vishay 82460 Fig. 1), i.e. ±92 µs, or 22 % of a 2400 baud bit. Every
board here contributes far less error than the part at the other end of the
link does for free, which is the argument for not optimising the gate further.

### Counting the ATtiny85 gate loop

The 14 cycles are read off the built firmware (`make -C boards/attiny85
disasm`), not estimated. The whole program is 100 bytes and the loop is
eleven instructions in four paths:

```
.L2: sbis PINB, 2      ; TXD                          1 (2 when skipping)
     rjmp .L3                                         2
     cbi  DDRB, 1      ; LED off                      2
.L4: sbis PINB, 3      ; receiver OUT                 1 (2 when skipping)
     rjmp .L5                                         2
     sbi  PORTB, 4     ; host RXD high                2
     rjmp .L2                                         2
.L3: sbi  DDRB, 1      ; LED on                       2
     rjmp .L4                                         2
.L5: cbi  PORTB, 4     ; host RXD low                 2
     rjmp .L2                                         2
```

Cycle counts from the datasheet's instruction-set summary (RJMP 2, SBI/CBI 2,
SBIS 1 or 2). The longest path — light the LED, forward a receiver low — is
14 cycles, 1.75 µs at 8 MHz.

## Parts and wiring

Common to both boards:

* an IR LED, **940 nm**, with a series resistor. Peak current sets range; the
  duty means the average is well under the DC rating. **Drive strength is a
  board decision, not a driver constant** — an RP2040 pin sources 4–12 mA
  depending on its drive setting and an AVR pin up to 40 mA, and anything
  brighter wants a transistor.
* a 38 kHz IR receiver module (see the next section on which one), decoupled
  with 4.7 µF and 100 Ω per the Vishay application circuit.
* TTL serial, **not RS-232**. A 3.3 V or 5 V USB-serial cable connects
  directly; a real RS-232 port needs a level shifter, which inverts, and that
  is a board concern which must not leak into the driver.

| signal | ATtiny85 | RP2040 |
| --- | --- | --- |
| IR LED | PB1 / OC0B (pin 6) | GP2 |
| host TXD in | PB2 (pin 7) | GP3 (pulled up) |
| receiver OUT | PB3 (pin 2) | GP4 |
| host RXD out | PB4 (pin 3) | — receiver OUT goes to the host in copper |

The two boards differ deliberately on that last row. The RP2040 keeps the
firmware out of the receive path entirely, which is why its run loop is empty.
The ATtiny85 re-drives it, because a TSOP output is an open-collector
transistor with a 30 kΩ internal pull-up (Vishay 80069, "Output stage") and
that is a slow edge into a metre of cable; the cost is two instructions.

### Building for a board

```
make -C boards/attiny85            # -> irtower-attiny85.hex
make -C boards/attiny85 flash      # avrdude, USBasp by default
```

The fuses are not optional: the recorded numbers assume 8 MHz, i.e. `CKDIV8`
unprogrammed (`lfuse 0xe2`). A factory part runs at 1 MHz and its carrier
comes out at 4.7 kHz, which no receiver will hear at all.

```
cd boards/rp2040 && cmake -B build -S . && cmake --build build
# -> build/irtower-rp2040.uf2
```

If that board presents USB at all it does so under its own VID/PID as an
ordinary CDC-ACM device. It does **not** claim LEGO's `0694:0001`: that pair
belongs to the USB tower, whose driver protocol this device does not
implement, and our own WebUSB filter is ours to choose.

## The two verification items the contract flagged

### 1. Receiver output polarity — resolved, pass-through

The contract asked for this to be checked against the datasheet of the part
actually used rather than taken on trust, because getting it backwards frames
every byte as garbage, silently.

Vishay 82459 rev. 2.4 and 82460 rev. 2.2 both label the output waveform
diagram **"Fig. 1 — Output Active Low"**, with `V_O` at `V_OL` for the
duration of the input burst, and specify `t_po` (output pulse width) as
`t_pi ± a few carrier cycles` — the output pulse tracks the input burst. So:

* burst present → output **low**;
* RCX Internals: "Serial zeros generate light, while serial ones do not";
* therefore burst = serial zero = low = **exactly what a UART expects**.

`host RXD = receiver output`, no inversion. `IRT_RX_WIRED_THROUGH` boards do
it in copper; the ATtiny85 port copies the level through without inverting it.

### 2. Burst tolerance at 142 cycles — resolved, and the answer is uncomfortable

The worst case is real and the test measures it rather than assuming it: a
start bit plus eight zero data bits at 2400 baud is 3.75 ms, **142 carrier
cycles** of continuous burst. (Odd parity saves the tenth bit — `0x00` has an
even number of ones, so its parity bit is a one and the burst ends there.)

Here are the actual datasheet rows, from the "Suitable data format" tables:

| part | AGC | min burst | min gap | max burst before the multiplier | required gap past that |
| --- | --- | --- | --- | --- | --- |
| TSOP4138 (82460) | AGC1 | 6 cycles | ≥ 6 cycles | 68 cycles | **> 1 × burst length** |
| TSOP4838 (82459) | AGC2 | **10 cycles** | ≥ 10 cycles | 72 cycles | > 3 × burst length |
| TSOP4338 (82460) | AGC3 | 6 cycles | ≥ 7 cycles | 40 cycles | > 6 × burst length |

Three conclusions follow, and none of them is "pick either part named in
DiyIrTower's README and it will be fine":

* **142 cycles is over the limit for every current Vishay remote-control
  receiver**, and the gap the RCX format leaves afterwards — a parity bit and
  a stop bit, 31.6 cycles — is nowhere near the 1×/3×/6× the datasheets then
  require. On datasheet grounds the *least* violated part is the **TSOP4138**
  (AGC1), which asks for one burst length of gap where the AGC2 part asks
  three and the AGC3 part six.
* **What that costs is range, not bytes.** Vishay 80069 describes the AGC as
  adapting *sensitivity* to the disturbance level, not as muting the output,
  which is why real towers work at all. The simulation models the two
  separately: the integrator's minimum burst and gap are hard and affect the
  waveform; AGC violations are counted, and `agc_suppresses` turns on the
  pessimistic reading so that the test can assert what it would cost (bytes
  are lost, for every part).
* **At 4800 baud the trade inverts.** A `0x00` at 4800 8-N-1 is 71 cycles,
  *inside* the TSOP4838's 72-cycle limit — but a single zero bit is only
  208 µs, which is **7.9 carrier cycles, below that part's 10-cycle minimum
  burst length**. A TSOP4838 therefore cannot carry `firmdl3`'s download mode
  at all while carrying 2400 baud perfectly well. The TSOP4138 and TSOP4338
  specify 6 cycles and can. The test asserts all three cases.

**Recommendation: TSOP4138** if both modes matter, TSOP4838 if only 2400 baud
does and the room has fluorescent lighting worth suppressing.

**What would settle it experimentally**, as the contract suggests: send `0x00`
repeatedly at 2400 baud and check that every byte arrives, then repeat at
increasing distance until it does not. The distance at which it fails is the
AGC's price, and it is the number no datasheet will give you, because the
datasheet's answer to this data format is "don't".

## Clean-room provenance

Written to the contract in `docs/RCX-IR-TOWER-FIRMWARE.md`, the same
arrangement as `docs/RCX-IR-PROTOCOL.md`. `maehw/DiyIrTower` and every other
GPL tower firmware was **not** read, fetched, cloned or quoted at any point.
Sources actually used, all of them facts or public interfaces:

* Kekoa Proudfoot, *RCX Internals* (1998), <https://www.mralligator.com/rcx/>
  — the transmit rule and the serial format.
* Vishay Semiconductors document **82459** rev. 2.4 (23-May-2025), TSOP22../
  TSOP24../TSOP48../TSOP44.. IR receiver modules.
* Vishay Semiconductors document **82460** rev. 2.2 (23-May-2025), TSOP21../
  TSOP23../TSOP41../TSOP43../TSOP25../TSOP45...
* Vishay Semiconductors document **80069** rev. 1.7 (24-Oct-2025), *Circuit
  Description* — the AGC, integrator and output-stage tables.
* Atmel/Microchip **2586Q–AVR–08/2013**, ATtiny25/45/85 datasheet — Timer0
  modes, the instruction-cycle summary, and the oscillator accuracy table.
* The RP2040 datasheet's PIO chapter and the pico-sdk's public API.
