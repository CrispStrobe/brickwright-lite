# Preservation, 286 vectors and DOS packages

Research and preservation decision, 2026-09-08. Games/package import remain
research-only; this document does not authorize their inclusion or deployment.

## Preserve approved material

For each approved guest keep original source, exact upstream revision/URL,
licence and copyright notices, local content hashes, explicit normalization,
our adapted source, reproducible build instructions and executable acceptance.
Keep upstream originals and adaptations in separate named files. Adaptation
does not remove the original copyright or licence obligations.

Paterson CHKDSK source is MIT and is pinned in bw-board at
`test/fixtures/paterson/SOURCE.json`. The selected PACK/UNPACK routines are
translated explicitly from Seattle ASM: `JP` is short unconditional JMP,
single-operand shifts have count one, `SEG ES` becomes an ES memory prefix,
and `MOV B,` denotes byte size. These are routine-level tests, not a rewritten
whole CHKDSK acceptance. Brickwright's loadable recipe must say that too.

Approved MIT materials can be prepared for rehosting with their notices.
Publishing/deploying is a separate action. GPL guest images require their
corresponding-source/notices workflow; a download URL alone is not that workflow.
For freeware/shareware, preserve exact distribution terms before deciding
whether the original archive may be mirrored, repackaged or modified.

## Did we run SingleStepTests/80286?

**No verified full run.** The current engine branch has no 80286 vector runner,
CI invocation or receipt. Its previous 8086 and 80186/V20 results are not 286
results. The new wired 286 routine/differential tests do not change that answer.

The [upstream suite](https://github.com/SingleStepTests/80286), MIT, currently
describes version 1.1.0: 326 real-mode instruction forms, nearly 1.5 million
executions and over 32 million captured cycle states, generated on a Harris
N80C286-12. Unreal/protected directories are described as future work. Tests
assume 16 MiB writable memory, no wait states, and do not exercise IF/TF.
Prefetch is flushed before instruction execution, not tested as a general queue.

Future runner requirements:

1. Pin suite revision and `revocation_list.txt`; exclude revoked tests by hash
   and count/report them separately.
2. Read the suite's binary format, metadata, expected flags and injected HALT
   semantics; do not reuse the 8086 JSON adapter by assumption.
3. Provide a test-only memory/initial-state adapter matching the suite, separate
   from the 64 KiB physical-board recipe. Unsupported instructions and exceptions
   are explicit outcomes, not skipped into the pass denominator.
4. Grade register/defined-flag/memory semantics first. Grade bus order, cycle
   states and timing separately; our ideal phase model has no timing-equivalence
   claim. A semantic pass is not an electrical or timing pass.
5. Add independent READY, interrupt, reset, protected-mode and whole-machine
   tests: the upstream suite does not cover those contracts completely.

## Games: candidates, not approved bundles

[hotkeysoft/emulators](https://github.com/hotkeysoft/emulators) is MIT and names
many working games, but that is a compatibility report for its emulator, not a
grant to redistribute Sierra, LucasArts or other game data. Its listed AT/286
protected mode is partial, so even its game list is not proof of a complete CPU.

| Candidate | Research value | Distribution decision |
| --- | --- | --- |
| Commander Keen shareware episode | EGA scrolling, keyboard, speaker and DOS files | Audit exact shareware archive terms; not the registered episodes |
| Wolfenstein 3D v1.4 shareware episode | Later 286/VGA performance and input test | Official publisher offers this episode; audit archive terms, content suitability and assets before mirroring |
| Jill of the Jungle | Another EGA/input/file workload from hotkeysoft's list | GOG's free availability is not permission for us to rehost its package |
| Keen Dreams source | Source-visible 16-bit engine and reproducible build research | GPLv2+ code; original game data remains separately licensed |
| Sopwith | Small historical game and source-based regression candidate | Original source released under GPL; select/audit an actual DOS build, not the SDL port as if it were a DOS executable |

Sources: [publisher Wolf3D page](https://legacy.3drealms.com/wolf3d/index.html)
(286 minimum; shareware download), [Jill on GOG](https://www.gog.com/en/game/jill_of_the_jungle_the_complete_trilogy),
[Keen Dreams source/data distinction](https://github.com/keendreams/keen),
[Sopwith port's original-source history](https://github.com/fragglet/sdl-sopwith).
The old publisher page's historic territorial notices are not a current legal
assessment. No game binaries or assets were imported during this research.

## DOSBox package compatibility proposal

There is no single universal DOSBox package format. Start with a directory/ZIP
containing DOS files and `dosbox.conf`. The documented
[js-dos bundle](https://js-dos.com/jsdos-bundle.html) is ZIP with required
`.jsdos/dosbox.conf` and optional `.jsdos/jsdos.json`. GOG installers and Boxer
packages are separate adapters, not implied by ZIP support.

Import translates a small declared subset into a Brickwright guest manifest:
entry executable, DOS arguments, working directory, read-only mounted media,
separate writable save overlay, and required CPU/video/audio/memory features.
Offer the normal DOS application path or a specifically selected circuit-board
boot path. Never silently fall back to DOSBox and call that our board emulation.

Parse config; **do not execute it as host commands**. Permit a documented subset
of `[autoexec]` (virtual mount, drive selection, relative directory and launch).
Reject/diagnose host absolute paths, escaping paths, external executables,
unknown commands, network mounts and arbitrary URLs. Detect case-folded DOS
filename collisions, archive traversal, symlinks, oversized expansion and nested
archives. Import must not overwrite a user's original media or existing saves.

Unsupported CPU/graphics/audio/XMS/EMS/DPMI requirements are shown before launch.
DOSBox `cycles` and dynamic-core settings cannot be translated into a promised
physical MHz value. Unsupported settings must be visible, not silently ignored.

Acceptance: load/save/reopen an owned package, preserve file hashes and saves,
run exact app/input/output checks, then hostile-archive/config tests. Package
parsing, game runtime support and board authenticity are three separate gates.

Reference: [DOSBox configuration and AUTOEXEC](https://www.dosbox.com/wiki/Dosbox.conf).
No package importer or optional DOSBox execution backend implemented yet.
