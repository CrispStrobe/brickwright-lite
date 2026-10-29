# Current SPIKE Runtime support and installed qualification

## Combined consumer acceptance, 29 October 2026

Firmware57 merged as `878e930dba99f0ee0d6e72ba9621b92856c717aa`; Runtime66 merged
as `85a51d1305c8e53c61c1e64779e312131e2da230`. PR1547 is folded into PR1533 for
one final fast-CI queue. Source checks and normal landing remain required.

A fresh private package combines published SPIKE source
`d328498b5dd88d127152699e1e5d5f99ba8b644e` and SAMD source
`48df0f93f9b6b642238c13448e6f075d8871eb83`. Its actual source commit is
`845d082c845dd70e88835ad608a8c545b6609436`, tree
`14d6e42c4676baec7bc18dc859af9f9e1bcfd1c0`. The frontend contains the verified
locked SAMD assets. Reviewed candidate frontend/package inputs are identical;
the native difference is the separately qualified test-only JSON-line repair.
Qualifier scripts and dated evidence have separate identities. This is a
frozen private package result, not a final-head binary or release-byte claim.

| Input | SHA256 |
| --- | --- |
| Combined Debian package | 605f1748bf5908e28105bab828a56e3531765e253f1c2da976ddda46b8a663ca |
| Installed native executable | a9978467a39d8edeb6875785fa007a21b64a50143b22f7e6e31a2a79267ea68d |
| Source-built Runtime executable | cdc11fcd0d1c97583fe8059462bf2dde8b582fcd034212ba36994195d2ec2793 |
| NuttX userspace | 9ed800e046a78a2599f5aa2bd9dccf5bf1858258e65326d776e7529570920985 |

All13 actual installed cases passed with that same image/executable: native and
Python programs, native/Python cancellation, native/Python storage, native/Python
app-restart storage, backend switching, pane disposal, four live view switches,
exact owned-simulator process loss and natural session expiry. Expiry was observed
at 120.14 seconds within the unchanged 119–125-second observation window; the old
owner released and a fresh guest completed. Every case exited zero without OOM.
Independent readback joined source/helper/app/firmware identities, Docker image,
full inspection/log records and the unchanged two-CPU, 2 GiB, network-disabled
limits. Controller inventories remain independently hash-verified.

The initial combined installer was started before archive compression finished;
its failed original is retained. The corrected attempt requires the completed
package receipt and matching digest before dpkg. The earlier frontend build
without engine assets is retained separately; it was never packaged or credited.
No guest/resource/assertion deadline was widened. The current hosted native
repair passed 275 standard tests (11 existing ignored) plus nine explicit controls.

All earlier evidence below remains scoped to its original source/package. The
combined package retains `redistributionValidated: false`, bundles only the
source-built NuttX profile, and makes no external MicroPython raw-REPL, physical
motor-accuracy, normal SAMD GUI-route or distribution-clearance claim. Official
SAMD game acceptance is separately recorded in
[the SAMD handoff](SAMD-NATIVE-GAME-HANDOFF.md).


Current Runtime support imports `tools/spike_lockstep.py`. The previous compiled
MicroPython support assembler and native manifest admission rejected that helper.
The support union now accepts exactly this optional digest-bound file and carries
its resource mapping; the preparer requires it when the state service imports it.
Legacy support, unknown-file refusal, changed/missing helper refusal and exact
runtime/profile identity remain enforced. Default dependency pins are unchanged.

Validation: 29 focused Node controls passed. The production native transport and
planner suite passed 150 tests, with ten existing ignored fixtures. The offline
Linux desktop builder produced a complete package with current compiled Runtime,
source-built NuttX, native-library inventories and 651 crate notice files.

## Installed source and artifact boundary

Native source: `6362180a16918e2e369e450ada9f348477584403`. Retained frontend source:
`3b95855d7966ebe0281d8f2aacdd55acd5f3b7ef`. Their complete source delta
contains only documentation/claims, native manifest admission, support preparation
and its tests; the frontend source closure is unchanged. This is a private local
assembly with recorded component identities, rather than an official hosted
native-producer artifact or a newly rebuilt frontend at the native source.

Runtime build source: `b7aca81430ee2e1ea6706102fefc3c573ae1aa0c`; Infrastructure:
`bb2c96fd2656f686d4b06683df4ece234f33b206`; support resources:
`9d7824771f3db67663950cae06f5bb7f89fbf33b`. Firmware build source:
`91cf0c07784441ac114b85a1705737327db2d9f8`. Both protected ARM images
passed their source/TI/resource gates. Independent compiled Linux and macOS
guest workloads and cold-storage evidence are recorded in
[Runtime PR66](https://github.com/CrispStrobe/renode-spike-prime/pull/66);
Classic recovery and cold calibration in
[firmware PR57](https://github.com/CrispStrobe/brickwright-spike-prime-fw/pull/57).

| Bound artifact | SHA-256 |
| --- | --- |
| Linux installer | `1a4ef0bbb8cb719ce7e65af144c860972072ee3b9c6ea5d4cb1c1b780fe6152a` |
| Installed native executable | `3c3a8e7c1ac3b05d47979b849544e0a73a19b3d8e8c17c01c08439281b928494` |
| Compiled Runtime executable | `cdc11fcd0d1c97583fe8059462bf2dde8b582fcd034212ba36994195d2ec2793` |
| Installed qualification summary | `ac579dbdaea39c900527d776b9b3cc9c69603b766f637cc6423ae10fea4c28c6` |

Complete frontend, native source, compile-pin, resource and install-layout
inventories remain retained with the original artifacts. Every selected case
checks the same installed executable, source helpers and image identity.

## Actual installed acceptance

Twelve separate isolated Tauri/WebKit instances passed. Each uses two CPUs, a
2 GiB memory limit, no network, a private display/profile and disabled compositing.
The native broker and actual protected guest execute all programs. Python here
is the source-built NuttX embedded-Python route; no external MicroPython image
or raw-REPL firmware is qualified by these results.

| Case | Original passing result SHA-256 |
| --- | --- |
| source | `879e5022133d12315a05c73bdf12d4dbc871bab6ac00e9202334695dcbd9a675` |
| python | `2a3836e301c284660ef6d6904ce078e6d994cdbcc342c4de45b47d269cdce6b7` |
| cancellation | `03bd13e0486a35440de54c6b00262b7bf7f80689a1a1efd5258b0afbcc1b8813` |
| storage | `e689f31457726771db234fc96587b0ce8a8d23d32e99a1ed0f22f5d0ee25c820` |
| python-storage | `bc8b9ebf48f53e0b47d0fc29a4a10e5c902578e149dd7d8c07db4cebe27b5c34` |
| python-cancellation | `66557004600024c3225b33aa83a40dafbdff83ab5738875ec53140870d898d8c` |
| app-restart-storage | `cc73b34a3f6fe7935401954dca324fd8282eba00d665ac750227594f48a749c2` |
| python-app-restart-storage | `349e0a84b125da80420c5f3d81949b432e40981e0456601ba145cac072176e4d` |
| backend-switch | `a51be00657cfe298ea73e32dbbc3dff5ba605f025ac1839ca6676d46b4a2f5a8` |
| pane-disposal | `9334a6c1dbad766133d3a0ed234f251f85b0272c472fdcca3db4530c9aa1edd4` |
| view-switch | `1ac5b2496f17ddacabc7ba0ff5abe39672927a6cca2552027cecf39375d07e18` |

| process-loss | `3c6c7da150efee8e72cd5185e1df1d21e4c6dd00cd7be0cb13ba05708d1a55f9` |

Native and Python programs complete against distinct E/F ultrasonic inputs.
Cancellation releases demands and retained programs restart. Native and Python
storage survive app closure/relaunch. Backend switching, pane disposal and four
live 2D/3D transitions preserve or release the expected session/clock ownership.
The view case then runs a replacement in the same guest session. A further
case terminates the exact owned simulator PID during powered motion, observes
old-session/clock/configuration cleanup, and completes a program in a fresh
guest session with the same image identity.

Original failures stay retained. The first launch batch preceded image commit
completion, then encountered private config permissions; the corrected input
mount leaves product files unchanged. The existing app-restart controller retries
its Code-tab click within the same original wait, retaining its assertions.

One original view run lost its session during replacement; its coarse error
does not establish a cause. A later terminal capture showed CANCELLED while
serial motor demands were still nonzero. The final controller waits for both
CANCELLED and actual zero demands within the original 30-second wait, then runs
the replacement. Every original assertion and native/guest/resource deadline
remains. The final case passes; this does not retroactively diagnose the first
coarse transport failure. A separate observation-only run also passed.

This records selected software acceptance, not physical silicon, analog motor
accuracy, a distribution clearance or SAMD engine adoption. The package remains
private and its existing `redistributionValidated: false` marker is retained.
Enabled final-head hosted checks and matched-head landing remain required.
