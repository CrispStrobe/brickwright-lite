# Reference frames from NQC itself

Every `TX` line here is a frame NQC's own `rcxlib` put on the wire while
downloading the matching program from `test/fixtures/rcx-images/`. They are the
oracle `test/rcx-nqc-oracle.test.mjs` compares our encoder against, and they
replace an earlier comparison that was made by *reading* NQC's source — a
reading that got the download order backwards, because the branch it came from
is dead from NQC's own command line.

## How they were captured

No hardware, and no change to any NQC source file. NQC's serial port is an
abstract class (`platform/PSerial.h`) with a do-nothing implementation used for
builds without a port (`PSerial_none.cpp`). A third implementation was written
for this purpose — it logs every byte written, echoes it the way a serial tower
does, and answers with the reply `RCX_Link::GetReplyLength` says that opcode
expects, so NQC walks the whole download and we capture all of it:

```
# in a scratch checkout of https://github.com/jverne/nqc at 21c24ec1
cp PSerial_oracle.cpp platform/
make POBJS="PStream PSerial_oracle PHashTable PListS PDebug" \
     USBOBJ=RCX_USBTowerPipe_none LIBS= bin/nqc
RCX_ORACLE_LOG=cap-t.log ./bin/nqc -TRCX2 -Soracle -d -pgm 3 t.nqc
```

`PSerial_oracle.cpp` is not in this repository and nothing from it ships. It is
about 140 lines and reproducing it from this paragraph is the intent — the
captures are the artefact worth keeping, not the harness.

## What is in a file

```
OPEN oracle                      the port name NQC was given
SPEED 2400 data=8 parity=odd stop=1   the line settings NQC ASKS FOR
TX <bytes>                       a frame NQC transmitted
RX <bytes>                       what the model answered (echo is not logged
                                 separately; it is part of the modelled reply)
```

The `SPEED` line is worth as much as the frames: it is the only independent
confirmation that `lib/rcx/rcx-serial.js` opens the port correctly, and it was
previously only a citation.

## The runs

| file | program | slot | chunks |
| --- | --- | --- | --- |
| `t-slot3.log` | `t.nqc` | 3 | one task |
| `mine-native-slot1.log` | `mine-native.nqc` | 1 | one task, four blocks |
| `c-slot2.log` | `c.nqc` | 2 | a subroutine and a task |

`c-slot2.log` is the one that settles chunk ordering: `35` (begin subroutine
download) precedes `25` (begin task download) on the wire.

Beyond the downloads, one capture per simple action, so the corpus covers
opcodes the download path never reaches:

| file | command | frames |
| --- | --- | --- |
| `run.log` | `-run` | `10 71` |
| `getversion.log` | `-getversion` | `10 15` |
| `batterylevel.log` | `-batterylevel` | `10 30` |
| `near.log` | `-near` | `10 31` |
| `sleep.log` | `-sleep 5` | `10 b1` |
| `msg.log` | `-msg 7` | `f7` |
| `clear.log` | `-clear` | `10 50` then select/delete/delete per slot, then `52` |

`clear.log` earns its place twice over. It is the only thing in NQC that sends
`0x52`, which settled a row the first comparison had to leave unresolved — and
it shows that `-clear` deletes subroutines before tasks (`70` then `40`),
which is the opposite of the order a download uses.

`msg.log` is the only capture with no leading ping, and its opcode `0xf7` is
one we deliberately do not tabulate.

## What the corpus is used for

59 frames across 16 distinct opcodes, and they serve two different purposes:

  * as an **encoder** oracle — what we transmit for the same program must
    match, frame for frame and payload for payload;
  * as a **decoder** corpus — these bytes were produced by NQC rather than by
    us, so parsing them is not the circular exercise that round-tripping
    through our own encoder would be. The checksum rule and the value/
    complement pairing are re-derived from the raw bytes in the test rather
    than taken from the decoder, so the two are independent statements.

Corrupting a single byte in any file turns three assertions red; that was
checked rather than assumed.


## The corrupted runs

`corrupt/` holds one download per way of damaging a reply, captured the same
way with `RCX_ORACLE_CORRUPT=<mode>` — the model mangles every reply it sends
and NQC's exit status records whether it noticed.

| mode | what is damaged | NQC |
| --- | --- | --- |
| `checksum` | the sum byte | rejects |
| `cksumcomp` | the sum's complement | rejects |
| `opcomp` | the opcode's complement | rejects |
| `opcode` | a different opcode, complement consistent | rejects |
| `truncate` | one byte short | rejects |
| `datacomp` | a payload byte's complement | rejects |
| `header` | `55 fe 00` — one header byte lost | **accepts** |
| `garbage` | three junk bytes before the frame | **accepts** |

**The two it accepts are the point.** Rejecting everything malformed would be
easy and wrong: the header's job is to warm up the serial link, so its leading
bytes are the ones a cold link eats, and `FindSync` in
`rcxlib/RCX_PipeTransport.cpp` searches for `55 ff 00`, then `ff 00`, then
`00` — dropping a byte from the front each time — always requiring the next
byte to be the complement of the command it just sent.

Our reader was stricter than that and reported `NO_REPLY` for the `header`
case, which on real hardware means a download that fails intermittently for a
reason nobody can see. It now shortens the same way, keeps the same guard, and
`test/rcx-nqc-oracle.test.mjs` holds both halves: all eight verdicts match,
and a damaged header still must not vouch for an opcode nobody is waiting for.
