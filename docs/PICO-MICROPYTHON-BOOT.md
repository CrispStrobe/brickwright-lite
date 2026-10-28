# MicroPython on the emulated Pico

**Status: it boots.** MicroPython v1.22.2 for the Raspberry Pi Pico runs
unmodified inside rp2040js behind this repo's clean-room boot ROM, enumerates
as a USB CDC device, and answers `print(1+1)` with `2` over the raw REPL that
`overlay/scratch-gui/src/lib/pico-repl.js` speaks.

The boot ROM's header said otherwise for months — "panics at step ~26,600",
blamed first on the missing soft-float table, then on a hardware spinlock,
then on the clock tree. All three were wrong, and this document exists so the
wrong answer is not rediscovered. **The panic was an artefact of how the probe
entered the image.**

Reproduce everything below with:

```
node scripts/probe-pico-micropython.mjs --repl          # the good boot
node scripts/probe-pico-micropython.mjs --entry vector --calls --spin
                                                        # the historical panic
node --test test/pico-micropython-boot.test.mjs         # as a gate
```

The probe needs `rp2040js`, which resolves from the integrated tree
(`packages/scratch-gui`, or `BW_INTEGRATED_ROOT`). It fetches
`RPI_PICO-20240222-v1.22.2.uf2` once into `artifacts/pico-micropython/`
(gitignored) and refuses to cache it unless the sha256 is
`e92c2a25…4bba9`. MicroPython is MIT; the binary is still not committed,
because a 650 KB blob in git to serve one diagnostic is a bad trade.

---

## 1. What actually happens on a good boot

Entry at `0x10000000`, SP `0x20042000` — i.e. exactly where the real boot ROM
leaves the core, with **boot stage 2 running first**.

| milestone | instruction |
|---|---|
| stage 2 configures XIP and sets `M0PLUS_VTOR = 0x10000100` | 134 |
| `runtime_init` moves VTOR to `ram_vector_table` at `0x20000000` | 25,719 |
| USB device enumerated, CDC line state set | 414,229 |
| `>>> ` prompt returned after a bare newline | 623,828 |
| raw REPL entered (`raw REPL; CTRL-B to exit`) | 655,862 |
| raw REPL `print(1+1)` → `2` | 751,858 |

(Counts are with the boot ROM as committed. With the flash functions of §4
added, enumeration and the prompt move to 638,821 and 848,420 — the extra work
is MicroPython actually formatting its littlefs partition instead of failing.)

`sys.implementation` on the emulated device reads:

```
(name='micropython', version=(1, 22, 2, ''), _machine='Raspberry Pi Pico with RP2040', _mpy=4614)
```

### The REPL is on USB, not on UART0

`RPI_PICO` builds MicroPython with stdio on USB CDC. `rp2040js-adapter.js`
exposes `onSerial` for UART0 and nothing else, so a probe that watches UART0
observes an empty string forever and reports a healthy boot as a hang. The
probe attaches rp2040js's own `USBCDC` host model to `rp2040.usbCtrl`.

**And the banner is gone, legitimately.** MicroPython writes
`MicroPython v1.22.2 …` the moment the REPL starts, and
`mp_hal_stdout_tx_strn` drops every byte until `tud_cdc_connected()` is true.
In the emulator the host enumerates hundreds of thousands of instructions
after the REPL starts, so the banner is written into a closed pipe. Sending
`\r\n` produces `\r\n>>> `; waiting for the banner produces nothing. Do not
gate on the banner.

---

## 2. The historical panic, resolved

`--entry vector` starts at the image's own reset vector
(`[0x10000104]`) instead of at `0x10000000`, which is what the earlier hand
probe did. That reproduces the recorded failure exactly: `hard_assertion_failure`
is entered at instruction **26,074**, LR `0x1002dcf9`, and the core then parks
in `panic()`.

### Root cause

Boot stage 2's exit path (`exit_from_boot2.S` in pico-sdk) is what writes
`M0PLUS_VTOR`:

```
    ldr r0, =(XIP_BASE + 0x100)
    ldr r1, =(PPB_BASE + M0PLUS_VTOR_OFFSET)
    str r0, [r1]
```

Skip stage 2 and VTOR stays 0. `runtime_init` then does
`memcpy(ram_vector_table, (uint32_t *) scb_hw->vtor, …)` — copying the RAM
vector table **out of address 0, which is the boot ROM image**. Measured, at
`0x20000000`, under `--entry vector`:

```
20042000 00000199 00000199 00000199 0001754d 01c0019c 00000101 00000000 00000000 …
```

Those are this repo's `rp2040-bootrom.js` bytes: the initial-SP word, three
copies of the `spin` vector, then `'M','u',1,0` = `0x0001754d`, the two table
pointers, and the lookup pointer. Every IRQ slot from index 7 on is zero.

Under `--entry flash` the same words read:

```
20042000 100001f7 100001c3 100001c5 100001c1 … 100001cd 100001cd 1002e735 …
```

— the flash vector table, with `0x100001cd` (`__unhandled_user_irq`) in the
unused IRQ slots.

So `irq_set_exclusive_handler(3, hardware_alarm_irq_handler)` reads the
current handler as `0` and fails

```c
hard_assert(current == __unhandled_user_irq || current == handler);
```

### The three addresses, resolved

The task was to resolve `0x1002dccc`, `0x1002e838` and the call at
`0x1002dcf4`. All six addresses in the old note:

| address | function | pico-sdk file |
|---|---|---|
| `0x1002e198` | `alarm_pool_post_alloc_init` | `src/common/pico_time/time.c` |
| `0x1002e838` | `hardware_alarm_set_callback` | `src/rp2_common/hardware_timer/timer.c` |
| `0x1002dcbc` | `irq_get_vtable_handler` | `src/rp2_common/hardware_irq/irq.c` |
| `0x1002dccc` | `irq_set_exclusive_handler` | `src/rp2_common/hardware_irq/irq.c` |
| `0x1002dcf4` | the failing `hard_assert` inside it | — |
| `0x10030f04` | `hard_assertion_failure` | `src/common/pico_base/…/assert.h` |
| `0x10030ed4` | `panic` | `src/common/pico_stdlib`/`pico_runtime` |

Register state captured at the `bl hard_assertion_failure`:

```
r0 = 0x00000000   irq_get_vtable_handler(3)      — the bootrom zero
r1 = 0x1002e735   hardware_alarm_irq_handler     — the handler being installed
r2 = 0xd0000124   spin_lock_instance(PICO_SPINLOCK_ID_IRQ)  — SIO+0x100+9*4
r3 = 0x100001cd   __unhandled_user_irq           — what the assert wanted
r4 = 0x00000003   num  (TIMER_IRQ_3)
LR = 0x1002dcf9
```

### How the identification was made (evidence tier)

**No symbol table was available.** The v1.22.2 GitHub release carries only
`micropython-1.22.2.tar.xz` and `.zip`; micropython.org publishes only the
`.uf2` for `RPI_PICO`. `arm-none-eabi-gcc 13.2.1` *is* on this box, but a
local rebuild would not have helped: a different toolchain produces different
addresses, so it could not resolve *these* ones without a second matching
step anyway, and cloning micropython plus the pico-sdk submodule was not worth
it on a memory-constrained shared host.

Identification is therefore by **disassembly plus literal-pool constants**,
which for this code is close to decisive because every function is pinned by a
hardware address it cannot share with anything else:

- `0x1002dcbc` is six instructions: `r0 += 16; r3 = [0xe000ed00 + 8]` (SCB
  VTOR); `r0 = [r3 + r0*4]`. That is `get_vtable()[16 + num]`, i.e.
  `irq_get_vtable_handler`, and nothing else in the SDK has that shape.
- `0x1002dccc` disables interrupts, spins on `[0xd0000124]` (SPINLOCK **9** =
  `PICO_SPINLOCK_ID_IRQ`), calls `0x1002dcbc`, compares the result against
  `0x100001cd` and against its second argument, calls a failure routine, then
  writes the vtable slot and releases the lock. That is
  `irq_set_exclusive_handler` line for line.
- `0x1002e838` spins on `[0xd0000128]` (SPINLOCK **10** =
  `PICO_SPINLOCK_ID_TIMER`), installs `0x1002e735` as the exclusive handler,
  calls `irq_set_enabled`, and does `*(uint32_t*)0x40056038 = 1u << alarm_num`
  — `0x40056038` is `TIMER_BASE + 0x2000 + INTE`, the **atomic-set alias** of
  the timer's interrupt-enable register. That is
  `hw_set_bits(&timer_hw->inte, 1u << alarm_num)` inside
  `hardware_alarm_set_callback`.
- `0x1002e198` calls `hardware_alarm_cancel`, then
  `hardware_alarm_set_callback(num, 0x1002e2f9)`, then computes
  `(n + 0x34000040) << 2` — which is `0xd0000100 + n*4`, i.e.
  `spin_lock_instance(next_striped_spin_lock_num())` — stores the alarm number
  and `sio_hw->cpuid` into the struct, and writes `pools[num]`. That is
  `alarm_pool_post_alloc_init` in field order.

Confidence: **high for all six**, from independent hardware constants rather
than from a guess at intent. Confidence that the *cause* is VTOR: **measured**
— the two vector-table dumps above, and the boot succeeding when stage 2 runs.

### What `0xd0000150` and `r0 = 0xf` were

`0xd0000150` is SPINLOCK **20**, in the striped range. In the trace it is read
**after** the assert, at instructions 26,196 onward, by `panic()`'s own
`printf` taking the stdio mutex. It was never the cause; the old note captured
it because it sampled registers on entry to the panic *region* rather than at
the assert. `r0 = 0xf` was likewise a register the panic path had already
reused. Reading registers at the panic tells you about `panic`, not about the
caller.

---

## 3. Dead ends, so nobody pays twice

- **The soft-float table (`'SF'`) is not the problem.** It still misses, and
  the boot still reaches the REPL. The old note's own measurement — answering
  it moves the failure by two instructions — was correct; the conclusion drawn
  from it was under-used.
- **The clock tree is not the problem.** CLOCKS is fully modelled in rp2040js
  and the SDK's `clocks_init` completes.
- **rp2040js's SIO spinlock model is correct** (reading an unlocked lock
  acquires it and returns the mask; reading a locked one returns 0). The
  probe's `--spin` output shows locks 9, 10, 11, 20 and 24 all behaving.
- **rp2040js's VTOR is correctly modelled** — `PPB` offset `0xd08` reads and
  writes `core.VTOR`, and the core honours it on exception entry. The earlier
  suspicion that VTOR was unimplemented is wrong; it was simply never *set*.
- **Nothing needs changing in rp2040js.** No upstream issue is warranted from
  this investigation.

---

## 4. What IS still broken: the flash filesystem

Found while confirming the boot, and it matters because it is the app's
deployment path.

MicroPython's rp2 block device programs flash through the ROM function table.
On the committed boot ROM those codes are absent, `rom_table_lookup` returns 0
on a miss, and **the SDK calls the result without a null check** — so the
firmware executes address 0. Measured over a boot: eleven such calls.

Consequences, measured over the raw REPL:

```
os.listdir()        -> []
os.statvfs('/')     -> (0, 0, 0, 0, 0, 0, 0, 0, 0, 128)
open('t.txt','w')   -> OSError: [Errno 19] ENODEV
```

`picoRepl.deployMainPy()` writes `main.py` and verifies its size with
`os.stat`, so it cannot work at all.

**The fix** — `docs/bw-board-rp2040-bootrom-flash-funcs.patch` — adds six
entries to the table: `'IF'`, `'EX'`, `'FC'` and `'CX'` as `bx lr` (on silicon
they drive the QSPI pads; in an emulator whose flash is a byte array behind
the XIP window there is nothing to do), and `'RE'`/`'RP'` as a memset and a
memcpy against `0x10000000 + offset` (datasheet §2.8.3.1.3: the ROM functions
take a flash *offset*, not an XIP address). NAND erase-before-write semantics
are deliberately not emulated — storing the byte outright is a superset.

Verified with the patch applied locally:

```
os.statvfs('/')                   -> (4096, 4096, 352, 350, 350, 0, 0, 0, 0, 255)
open('t.txt','w') … read back     -> hello
repl.deployMainPy(77-byte main.py) -> 77
rom_table_lookup misses landing at address 0 -> 0
```

**It cannot be committed here.** `overlay/scratch-gui/src/lib/bw-board/`
is vendored from bw-board and `npm run sync:bwboard:check` fails on
divergence, so the change has to land in bw-board as `src/rp2040-bootrom.js`
and come back through the sync. The patch is written against bw-board's paths
and `git apply --check` passes there. The patch also rewrites the boot ROM
header, whose account of the panic is the thing that cost a session.

Not attempted: a clean-room soft-float table (`'SF'`). Nothing observed so far
needs it.

---

## 5. Known limits of the emulated device

- `machine.reset()` at the end of `deployMainPy()` does not bring the device
  back: rp2040js does not model a watchdog-driven core reset, so the machine
  goes idle. Everything up to and including the size verification works.
- `--entry vector` is kept as a probe option only because it reproduces the
  historical panic. Nothing should boot that way. If some future caller needs
  to skip stage 2, it must set `VTOR = 0x10000100` itself.
- The probe's per-`read()` budget (3,000,000 instructions) is the real timeout;
  `pico-repl.js`'s `timeoutMs` is wall clock and only has to outlast the
  emulator.
