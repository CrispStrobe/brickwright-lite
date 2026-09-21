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

## The three runs

| file | program | slot | chunks |
| --- | --- | --- | --- |
| `t-slot3.log` | `t.nqc` | 3 | one task |
| `mine-native-slot1.log` | `mine-native.nqc` | 1 | one task, four blocks |
| `c-slot2.log` | `c.nqc` | 2 | a subroutine and a task |

`c-slot2.log` is the one that settles chunk ordering: `35` (begin subroutine
download) precedes `25` (begin task download) on the wire.
