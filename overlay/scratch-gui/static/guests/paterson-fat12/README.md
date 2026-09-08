# Tim Paterson / Microsoft CHKDSK FAT12 routines

Preserved original source and explicit adapted assembly, MIT. See LICENSE and
SOURCE.json for the exact upstream revision and hashes. This is PACK/UNPACK
from CHKDSK, not the whole utility or a DOS boot image.

In Brickwright: Settings → 8086 execution diagnostics → Open experimental 286
board lab → Enable → Load Paterson FAT12 routines → Run up to 4096 clocks.
Expected halt: DI = 2748 (0ABC hex), SI = 3, SP = 61440 (F000 hex).
The guest writes the CHGCLS byte at physical 0500h and packs FAT cluster 3 at
physical 1604h/1605h. All accesses use the wired memory board.

Alternatively import `paterson-fat12.board.json` through Import recipe file.
The `.asm` is the adapted routine harness at ORG 0100h; HLT ends the board
test. It is not a DOS `.COM` application and should not be labelled as one.

Rebuild from the pinned bw-board checkout:

    node scripts/preserve-paterson-lab.mjs /path/to/bw-board <engineRevision from SOURCE.json>

Original source remains in `original-chkdsk.asm`; adaptation is separately
named `paterson-fat12.asm`. Keep the Microsoft copyright and MIT notice with
both when redistributing. The engine pin is experimental, separate from the
production bw-board vendor pin. These assets have not been deployed by this work.
