# NXT protocol facts (verified 2026-10-20)

The facts the Robot Lab's Virtual NXT (`overlay/scratch-gui/src/lib/bw-sim/hubs/nxt/`,
`devices/nxt-sensors.js`) is built on, each with where it was read. **Facts only, in our own words**:
opcode values, byte offsets, field sizes, reply lengths, status codes, register addresses. No code,
table, comment or text of any source was copied into this repository, and no third-party file is
vendored. Section names below (`§Statuses`, `§Outputs`, …) are what the code and tests cite as
`[F §…]`.

## Sources and licences

| Key | Source | Revision read | Licence | Used for |
|---|---|---|---|---|
| **BDK-A1** | LEGO, *LEGO MINDSTORMS NXT Communication Protocol* (Bluetooth Developer Kit Appendix 1, v1.00, © 2006 The LEGO Group), the PDF as hosted in `corywalker/nxt-plus-plus` `doc/developers/` | `8ae39d8` | LEGO's document (the hosting repo is GPL-2.0; the PDF is LEGO's own) | telegram types, system commands |
| **BDK-A2** | LEGO, *LEGO MINDSTORMS NXT Direct Commands* (BDK Appendix 2, v1.00, © 2006), same place | `8ae39d8` | LEGO's document | every direct command's bytes, status list |
| **HDK-A7** | LEGO, *NXT Ultrasonic Sensor I²C Communication Protocol* (HDK Appendix 7, v1.00, © 2006), same place | `8ae39d8` | LEGO's document | ultrasonic registers and commands |
| **FW** | `schodet/nxt-firmware` ("NXT Improved Firmware", derived from LEGO's open-source NXT firmware 1.29) | `f309220` | LEGO Open Source License (MPL-1.0-based) plus other open licences per file | remote-command handler (`src/c_cmd.c`), status numbers (`src/c_cmd.iom`), system commands (`src/c_comm.c`), output flags (`src/c_output.iom`, `src/c_output.c`), versions (`src/c_loader.iom`), sleep default (`src/c_ui.c`), low-speed buffer (`src/c_lowspeed.iom`) |
| **FWD** | `dlech/nxt-firmware` (the same lineage) | `99b10c1` | as FW | the output driver (`AT91SAM7S256/Source/d_output.c`) |
| **NP** | `schodet/nxt-python` | `fdc1b04` | GPL-3.0 | cross-check of layouts as a host sends/parses them |
| **NBC** | John Hansen's NBC/NXC headers (`NBCCommon.h`, `NXCDefs.h`, version 63) as shipped in `CrispStrobe/legacy-lego-compiler` `bin/nbc_includes/` | `f2a7723` | MPL-1.1 (the wrapper repo is MIT) | cross-check of status, output and I²C constants |
| **NXOS** | `danderson/nxos` (`nxos/base/drivers/radar.h`) | `bbed11a` | GPL-2.0 (file header) | ultrasonic address convention |

Also looked at, nothing taken: `rvs/libnxt` (GPL-2.0; firmware flashing over SAM-BA, no direct
commands), `xlcteam/nxtIDE` (MIT; an NXC-subset editor and emulator, no `.rxe`), `PeterOrneholm/PenemuNXT`
(MIT; a .NET host library), `sebgiles/arduino-nxt-servo` (MIT; motor servo on an Arduino),
`maarten-pennings/Lego-Mindstorms` `nxt/` (no licence file; NXT-G club material, no protocol
documents), `LEGO-Robotics/LEGO-Robotics` (no licence; example programs only), `gmsanchez/nxtOSEK` (no
licence; install scripts only — the nxtOSEK sources themselves are not in that repository). No LEGO
*Executable File Specification* PDF was found in any of these repositories.

**Where the BDK and the firmware disagree, the firmware is taken as the authority** (it is what a real
brick answers); every such case is listed in §Disagreements.

## §Telegram

| Fact | Value | Source |
|---|---|---|
| Byte 0, telegram type | 0x00 direct + reply, 0x01 system + reply, 0x02 reply, 0x80 direct without reply, 0x81 system without reply | BDK-A2 p.4; BDK-A1 |
| No-reply bit | 0x80; the firmware strips it before dispatching and passes no reply buffer, so nothing comes back | FW `src/c_comm.c:362`, `:392–414` |
| Incoming reply telegram (0x02) | never answered | FW `src/c_comm.c:416–424`; `src/c_cmd.c` handler head |
| Unknown telegram type | ignored, no reply | FW `src/c_comm.c:439–444` |
| Maximum telegram | 64 bytes including the type byte | BDK-A2 p.4 "Maximum command length" |
| Bluetooth framing | two length bytes, LSB first, before every telegram, **not** counted in the length and not in the 64 | BDK-A2 p.4 "Bluetooth messages" |
| Reply | 0x02, the command, the status, then the data; status 0 = success | BDK-A2 p.5, p.12 |
| Short telegrams | the firmware does not check a direct command's length (it reads its buffer) | FW `src/c_cmd.c:330–1080` (no length test) |

## §Statuses

Numbers per BDK-A2 p.12; the firmware's own names and numbers agree (FW `src/c_cmd.iom:30–68`; NBC
`NBCCommon.h:437–508`): 0x20 pending, 0x40 mailbox empty, 0xBD request failed, 0xBE unknown opcode,
0xBF insane packet, 0xC0 out-of-range values, 0xDD bus error, 0xDE comm buffer full, 0xDF channel
invalid, 0xE0 channel not configured or busy, 0xEC no active program, 0xED illegal size, 0xEE illegal
mailbox queue, 0xEF invalid field, 0xF0 bad input/output, 0xFB out of memory, 0xFF bad arguments.

What the firmware actually returns (FW `src/c_cmd.c`):

- **A bad port in any direct command is 0xC0**, not 0xF0 (`:477`, `:514`, `:536`, `:597`, `:654`,
  `:695`, `:747`, `:767`, `:784`).
- **Unknown direct opcode: 0xBE**, reply = the status alone (`:1022`).
- The reply length is fixed per command; on an error the data is zero-filled to that length —
  GETOUTPUTSTATE 22 data bytes (`:537`), GETINPUTVALUES 13 (`:598`), GETCURRENTPROGRAMNAME 20,
  MESSAGEREAD 61, LSREAD 17 — **except** LSGETSTATUS, LSWRITE and LSREAD given a port above 3, which
  answer with the status alone (`:747`, `:767`, `:784`: they break out before writing any data).

## §Commands (direct)

Request bytes count from byte 0 (the type). "Reply" is the full reply telegram length.

| Command | Opcode | Request | Reply | Errors (firmware) | Source |
|---|---|---|---|---|---|
| STARTPROGRAM | 0x00 | 2–21 file name (15.3 chars + NUL) | 3 | missing file 0xC0 | BDK-A2 p.5; FW `c_cmd.c:407–425` |
| STOPPROGRAM | 0x01 | — | 3 | no program 0xEC | BDK-A2 p.5; FW `:427–437` |
| PLAYSOUNDFILE | 0x02 | 2 loop? (bool), 3–22 file name | 3 | missing file 0xC0 | BDK-A2 p.5; FW `:439–458` |
| PLAYTONE | 0x03 | 2–3 Hz (UWORD, 200–14000), 4–5 ms (UWORD) | 3 | none (no range check) | BDK-A2 p.6; FW `:460–469` |
| SETOUTPUTSTATE | 0x04 | 2 port (0–2, 0xFF all), 3 power (SBYTE), 4 mode, 5 regulation, 6 turn ratio (SBYTE), 7 run state, 8–11 tacho limit (ULONG, 0 = forever) | 3 | port 0xC0; **power not checked** | BDK-A2 p.6; FW `:471–504` |
| SETINPUTMODE | 0x05 | 2 port (0–3), 3 type, 4 mode | 3 | port 0xC0; marks the input's data invalid until the input module refreshes it | BDK-A2 p.7; FW `:506–525` |
| GETOUTPUTSTATE | 0x06 | 2 port (0–2) | 25: 3 port, 4 power, 5 mode, 6 regulation, 7 turn ratio, 8 run state, 9–12 tacho limit (ULONG), 13–16 TachoCount, 17–20 BlockTachoCount, 21–24 RotationCount (SLONG) | port 0xC0 + 22 zeros | BDK-A2 p.8; FW `:527–586`; NP `nxt/brick.py` get_output_state |
| GETINPUTVALUES | 0x07 | 2 port (0–3) | 16: 3 port, 4 valid?, 5 calibrated?, 6 type, 7 mode, 8–9 raw, 10–11 normalized (UWORD 0–1023), 12–13 scaled (SWORD), 14–15 calibrated (SWORD) | port 0xC0 + 13 zeros | BDK-A2 p.8; FW `:588–645`; NP `brick.py:524` |
| RESETINPUTSCALEDVALUE | 0x08 | 2 port | 3 | port 0xC0; zeroes the scaled value only | BDK-A2 p.8; FW `:647–661` |
| MESSAGEWRITE | 0x09 | 2 inbox, 3 size (incl. NUL), 4… data | 3 | size 0, size > 59 or last byte not NUL: 0xC0; queue ≥ 20: 0xEE; no program: 0xEC | BDK-A2 p.9; FW `:663–686`, `cCmdMessageWrite` `:2991` |
| RESETMOTORPOSITION | 0x0A | 2 port (0–2), 3 relative? | 3 | port 0xC0 | BDK-A2 p.9; FW `:688–704` |
| GETBATTERYLEVEL | 0x0B | — | 5: 3–4 mV (UWORD) | — | BDK-A2 p.9; FW `:706–715` |
| STOPSOUNDPLAYBACK | 0x0C | — | 3 | — | BDK-A2 p.9; FW `:717–722` |
| KEEPALIVE | 0x0D | — | 7: 3–6 sleep limit, ms (ULONG) | — (also restarts the sleep timer) | BDK-A2 p.10; FW `:724–736` |
| LSGETSTATUS | 0x0E | 2 port (0–3) | 4: 3 bytes ready | port > 3: 0xC0, 3 bytes; else the channel status (§LS) | BDK-A2 p.10; FW `:738–757` |
| LSWRITE | 0x0F | 2 port, 3 tx length, 4 rx length, 5… tx data | 3 | port > 3: 0xC0; tx or rx > 16: 0xED; port not low-speed: 0xE0 | BDK-A2 p.10; FW `:759–773`, `cCmdLSWrite` `:6436–6475` |
| LSREAD | 0x10 | 2 port | 20: 3 bytes read, 4–19 data zero-padded | port > 3: 0xC0, 3 bytes; else the channel status | BDK-A2 p.10; FW `:775–808` |
| GETCURRENTPROGRAMNAME | 0x11 | — | 23: 3–22 name | no program: 0xEC, name all zeros | BDK-A2 p.11; FW `:810–830` |
| MESSAGEREAD | 0x13 | 2 remote inbox (0–19), 3 local inbox (0–9), 4 remove? | 64: 3 local inbox, 4 size, 5–63 data zero-padded | no program 0xEC, queue ≥ 20 0xEE, empty 0x40 — always the full 64 bytes | BDK-A2 p.11; FW `:832–865`, `cCmdMessageGetSize` `:3044` |

Opcode 0x12 is unused by the BDK (the firmware's enum names it but has no handler: 0xBE). The firmware
also answers community/enhanced opcodes above 0x13 (datalog, Bluetooth tables, properties, a TachoCount
reset at 0x21: FW `:867–1015`); the Virtual NXT does not implement them (0xBE).

## §Messages

- 20 queues of 5 messages; queues 0–9 are a program's inboxes, 10–19 hold what a slave program sends
  its master (FW `src/c_cmd.h:296–297`; BDK-A2 p.11). A message is a NUL-terminated string of at most
  59 bytes including the NUL (FW `src/c_cmd.h:305`; BDK-A2 p.9).
- MESSAGEREAD reads **the remote inbox** (byte 2) and echoes **the local inbox** (byte 3) in its reply
  (FW `c_cmd.c:836–841`; NP `brick.py:721–740` sends remote, local, remove and parses local, size).
- The queues exist only while a program runs: without one, MESSAGEWRITE and MESSAGEREAD both answer
  0xEC (FW `cCmdMessageWrite` `:2991`, `cCmdMessageGetSize` `:3044`, `cCmdMessageRead`).
- Writing to a full queue drops its oldest message (FW `cCmdMessageWrite`).

## §Outputs

| Fact | Value | Source |
|---|---|---|
| Mode bits | MOTORON 0x01, BRAKE 0x02, REGULATED 0x04 (high nibble 0xF0 reserved) | BDK-A2 p.6; FW `src/c_output.iom:24–27`; NBC `:1231–1235` |
| Regulation | IDLE 0, MOTOR_SPEED 1, MOTOR_SYNC 2 (MOTOR_POS 4 is an Improved-Firmware addition) | BDK-A2 p.6; FW `c_output.iom:52–55`; NBC `:1279–1282` |
| Run state | IDLE 0x00, RAMPUP 0x10, RUNNING 0x20, RAMPDOWN 0x40 (HOLD 0x60 enhanced-firmware only) | BDK-A2 p.6; FW `c_output.iom:44–47`; NBC `:1265–1269` |
| Update flags (program side) | UPDATE_MODE 0x01, SPEED 0x02, TACHO_LIMIT 0x04, RESET_COUNT 0x08, PID 0x10, RESET_BLOCK_COUNT 0x20, RESET_ROTATION_COUNT 0x40 | FW `c_output.iom:30–40`; NBC `:1200–1206` |
| SETOUTPUTSTATE | stores power/mode/regulation/turn ratio/run state/limit and raises UPDATE_MODE, SPEED, TACHO_LIMIT — **never RESET_COUNT** | FW `c_cmd.c:471–504` |
| Power | not range-checked on receipt; GETOUTPUTSTATE echoes it as stored; the driver bounds the drive to ±100 | FW `c_cmd.c:493`; FWD `d_output.c:22–23`, `:876–883` |
| TachoCount | counts since the last RESET_COUNT (power-on for a direct-command host) | FWD `d_output.c:70`, `:147`, `:255–271` |
| BlockTachoCount | reset only by RESET_BLOCK_COUNT | FWD `d_output.c:72`, `:148`, `:275–278` |
| RotationCount | reset only by RESET_ROTATION_COUNT | FWD `d_output.c:75`, `:149`, `:282–285` |
| RESETMOTORPOSITION | relative TRUE → RESET_BLOCK_COUNT (BlockTachoCount); FALSE → RESET_ROTATION_COUNT (RotationCount); TachoCount untouched | FW `c_cmd.c:702`; BDK-A2 p.9 ("TRUE: relative to last movement, FALSE: absolute") |
| Tacho limit | **added to the running target** (in TachoCount units), subtracted for a negative power; the move ends when TachoCount reaches the target; while a port runs without a limit the target follows TachoCount | FWD `d_output.c:319–357`, `:691–701`, `:711–760` |
| End of a limited move | run state IDLE, regulation idle; brake or float per the BRAKE bit | FWD `d_output.c:1117–1150` |
| Sleep default | 10 minutes (setting 3 of 0/2/5/10/30/60) → KEEPALIVE 600 000 ms | FW `src/c_ui.c:316–318`, `c_cmd.c:731` |

nxt-python's host-side `turn()` computes its target as the current TachoCount plus the limit — the same
reading (NP `nxt/motor.py:151`).

## §Inputs

- Types 0x00–0x0B (NO_SENSOR … LOWSPEED_9V), modes 0x00 RAW … 0xE0 ANGLESTEPS, slope mask 0x1F, mode
  mask 0xE0 (BDK-A2 p.7).
- GETINPUTVALUES "calibrated?" is always FALSE, and the firmware puts the **normalized** value into the
  calibrated field (FW `c_cmd.c:618–641`); the BDK calls that field "currently unused" (p.8).
- SETINPUTMODE marks the data invalid ("valid?" FALSE) until the input module has refreshed it
  (FW `c_cmd.c:521–523`).

## §LS (low-speed / I²C channel)

- At most 16 bytes each way (BDK-A2 p.10; FW `src/c_lowspeed.iom:23`).
- Channel status (FW `c_cmd.c:6379–6410`): port type not LOWSPEED/LOWSPEED_9V, or data not yet valid →
  0xE0; idle → 0x00; a transaction under way → 0x20; failed → 0xDD (a NACKed address ends here).
- LSWRITE only starts the transaction (FW `cCmdLSWrite` `:6436–6475`): a bad address is not an error
  of LSWRITE itself; it shows later as 0xDD from LSGETSTATUS / LSREAD.
- LSGETSTATUS always returns the bytes-ready byte with whatever status (`:738–757`); LSREAD always
  the count and 16 bytes (`:775–808`) — with nothing pending that is status 0, count 0.

## §Ultrasonic sensor (HDK-A7 pp.2–3)

| Register | Content | Access |
|---|---|---|
| address | 0x02 in the 8-bit form LSWRITE carries (7-bit 0x01: NXOS `radar.h:36`); reads re-address with 0x03 | — |
| 0x00 | version, 8-byte string "V1.0" | read |
| 0x08 | product id, 8-byte string "LEGO" | read |
| 0x10 | sensor type, 8-byte string "Sonar" | read |
| 0x11 / 0x12 / 0x13 | factory zero 0x00 / scale factor 0x01 / scale divisor 0x0E | read, 1 byte each |
| 0x14 | measurement units, 7 bytes "10E-2m" (centimetres) | read |
| 0x40 | continuous-measurement interval | read / write |
| 0x41 | command state | read / write |
| 0x42–0x49 | measurement bytes 0–7 | read |
| 0x50 / 0x51 / 0x52 | actual zero / scale factor / scale divisor | read / write |

Commands written to 0x41: 0x00 off, 0x01 single shot (one measurement per command, up to 8 echoes
stored in 0x42–0x49), 0x02 continuous (the default, at the set interval), 0x03 event capture (listens
for other ultrasonic sensors), 0x04 warm reset. NBC agrees (`NBCCommon.h:1558–1592`), as does NP
(`nxt/sensor/generic.py:111–150`, `nxt/sensor/digital.py:62`). NXC documents the distance as 0..255
(`NXCDefs.h:3249`).

## §System

| Command | Bytes | Reply | Source |
|---|---|---|---|
| GET FIRMWARE VERSION | 0x01 0x88 | 7: 3 protocol minor, 4 protocol major, 5 firmware minor, 6 firmware major | BDK-A1 p.11; FW `c_comm.c:805–813`; NP `brick.py:873–885` |
| GET DEVICE INFO | 0x01 0x9B | 33: 3–17 name (14 chars + NUL), 18–24 Bluetooth address (6 bytes + 1), 25–28 signal strength, 29–32 free user flash (ULONG) | BDK-A1 p.14; FW `c_comm.c:1033–1055`; NP `brick.py:1085–1112` |

Versions in the open-source release: protocol 0x017C (1.124), firmware 0x011D (1.29)
(FW `src/c_loader.iom:24–26`).

## §Disagreements

| Point | BDK | Firmware (taken) |
|---|---|---|
| Bad port in a direct command | 0xF0 "bad input or output" is in the list | 0xC0 everywhere |
| STARTPROGRAM / PLAYSOUNDFILE, missing file | 0xBD "request failed (i.e. file not found)" | 0xC0 |
| GETINPUTVALUES calibrated value | "currently unused" | the normalized value |
| GET DEVICE INFO bytes 25–28 | one ULONG signal strength | one link-quality byte per connection (4) |
| Unknown system command | — | no answer defined (the system handler leaves the length unset) — the Virtual NXT answers 0xBE (ours) |
| NBC on RESET_COUNT | "resets all rotation counters" (NBC comment) | resets TachoCount and the target only (FWD `d_output.c:255–271`) |

## Unverified (no source settles it)

- What the ultrasonic sensor reads when nothing echoes (we use 255) and what bytes 1–7 hold in continuous
  mode (we use 255); the interval's power-up value (we use 1, NxOS's default) and its unit.
- Whether off mode clears or keeps the last measurement (we keep it).
- The ultrasonic sensor on LOWSPEED (no 9 V) — we let it answer.
- The exact timing of the firmware's asynchronous paths (input data invalid after SETINPUTMODE, I²C
  transactions pending): the Virtual NXT completes them at once.
- The firmware's regulation, ramp and synchronisation loops (RAMPUP/RAMPDOWN, MOTOR_SYNC turn ratio) —
  our model, `docs/ROBOT-LAB-EV3-NXT.md` "Motor control".
- Firmware 1.31 (LEGO's last release) versus the 1.29 source read here.
