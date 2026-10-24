# Local Linux desktop package

The offline builder assembles a Linux x64 `.deb` from a built Brickwright GUI,
a separately supplied Renode distribution and the closed MicroPython support
profile. Optional source-built guest and full NuttX profiles can be included.
It does not download firmware, bundle external user images, upload artifacts,
or install anything into the system. Keep its output outside public repositories.

```sh
node scripts/build-spike-linux-desktop.mjs \
  /private/staged-micropython-support /path/to/renode-distribution \
  /path/to/qualified-gui-build /private/new-linux-package
```

Prepare support with the Renode repository's `tools/stage_prime_micropython.py`.
Use a GUI build from the same source revision. Cargo dependencies must already
be cached: the builder uses `--locked --offline`. Linux development prerequisites
are the normal Tauri GTK/WebKit packages, Node, Rust/Cargo and `dpkg-deb`.
Allow several GB of free build space. `--prepare-only` verifies/stages resources
without invoking a compiler or building an installer. An existing output,
including a partial build, is preserved and refused. A dedicated existing cache
can be selected with `BW_LINUX_BUILD_TARGET_DIR`; use only a cache you own.

The builder copies the native source closure into a private build directory and
selects only the Rust library target needed by desktop. The repository retains
its mobile library targets. Desktop embeds the GUI in the executable; the mobile
entry point still creates its context in the mobile library. This prevents a
second large GUI copy in desktop Rust library metadata.

The installed layout is `usr/bin/brickwright-tauri` with resources under
`usr/lib/Brickwright` (the configured Tauri product name). Compile pins use paths relative to that resource
directory. The resource closure includes the exact Renode executable, fourteen
named native libraries, the runtime root marker and upstream monitor helper,
supplied notices and the seventeen verified support
artifacts. Test tools, plugins and firmware directories from the runtime input
are excluded. File hashes and package receipts are recorded privately.

You can inspect/extract the installer without changing the system:

```sh
dpkg-deb --info /private/new-linux-package/brickwright_0.1.23_amd64.deb
dpkg-deb --extract /private/new-linux-package/brickwright_0.1.23_amd64.deb /private/new-install
/private/new-install/usr/bin/brickwright-tauri
```

This builder configures the independent browser simulator and the supplied
MicroPython arena route. In the sandbox select MicroPython, choose your local
`.bin`, `.hex` or single-application `.dfu` through the native file chooser, and
run supported Code-tab Python. Six-motor topology exposes A–F with A/B as rover
wheels. The virtual hub panel exposes raw hub inputs while a supported firmware
session is running. Stop closes only that session. Images are local user inputs;
checks establish supported geometry/integrity, not firmware authenticity.

To include already staged source builds, add `--guest /private/staged-guest` and
`--nuttx /private/staged-nuttx`. These options freeze the closed manifests without
building firmware. The freezer verifies each digest, firmware identity and ARM
ELF32 header, preserves required notices, checks flash seed geometry, and accepts
only the known scenario templates. It rewrites their staging paths relative to
the included scenario origin, then regenerates scenario and manifest digests.
The flash seed uses that monitor origin explicitly because Renode changes the
process working directory to its runtime directory.
These checks establish consistency of supplied source-build declarations; they
are not proof of firmware origin or physical-hardware behavior.

Guest, NuttX and MicroPython live in separate resource directories and share one
verified Renode executable. The supervisor resolves fixed profile leaves under
Tauri's resource directory and refuses mixed relative/absolute profile modes.
Legacy separately configured absolute profiles remain supported. The builder
clears inherited `BW_RENODE_*` compile variables before applying its own pins, so
an unrelated workspace profile cannot override the installed package. Receipts
list included source-built profiles and continue marking redistribution as
unqualified. Full installed-GUI qualification of these optional combined profiles
must be recorded separately from the previously tested MicroPython-only package.

The supervisor registers launch ownership before starting its worker. A creation
timeout requests cancellation and keeps that ownership until process and private
resource cleanup completes; another launch cannot overlap the pending cleanup.
Normal Stop, close and timeout terminate the owned process group. On Linux the
persistent spawning thread also installs a parent-death signal, so abrupt desktop
termination kills the direct simulator child. This additional crash protection
does not cover forked descendants and is not qualified on other operating systems.

Original LEGO images remain a private bring-up path, without a
qualified Code-tab arena backend. See [NuttX](../SPIKE-NUTTX.md),
[MicroPython](spike-micropython-gui.md) and
[flash persistence](spike-flash-persistence.md) for their tested boundaries.

New builder and desktop packaging additions are BSD-3-Clause. Existing notices
remain applicable. Copying runtime notices alone does not establish redistribution
compliance. The current Renode distribution audit still needs matching .NET
native notices/provenance, an embedded-component inventory and applicable
copyleft source/relink evidence. Receipts therefore explicitly record
`redistributionValidated: false`; assembled packages stay private until that
review is complete. The commands reproduce the assembly process and record exact
inputs; they do not claim byte-identical Rust builds or physical SPIKE accuracy.


## Restarting a retained NuttX program

With retained-restart-capable full NuttX firmware, the arena offers **Restart
program** after completion, Stop or a runtime fault. This sends START for the
program already retained by the guest; it does not compile the current editor,
upload replacement bytes, reload storage or create a new emulator session. Use
the Code-tab Run action to upload edited source. Loading saved storage remains
explicit and reaches READY; **Run loaded program** starts that loaded program.

The arena exposes Stop while a program start is pending. Stop cancels a queued
START or sends STOP after an in-flight START, retaining the program/session.
Closed, uncertain, busy or uncommitted sessions refuse restart; errors from older
firmware remain visible. Completion feedback is rearmed only after an accepted
RUNNING response, and late responses cannot update a disposed/replacement pane.
Restarting a faulting program may reproduce its fault. No physical hub upload is
involved.

The focused command/session and actual-pane-method regressions are reproducible
from the repository root:

```sh
node --test test/spike-nuttx-restart.test.mjs test/spike-renode-arena-session.test.mjs test/spike-code-run-feedback.test.mjs
```

These synthetic boundary tests do not replace the actual guest and installed
GUI qualification required when adopting new firmware/package inputs.

The source-only native qualification driver imports the production policy,
supervisor, image-admission/staging and program-UART contract modules. Its unit
checks are reproducible independently of a WebView:

```sh
cargo test --locked --offline --manifest-path tools/renode-arena-proof/Cargo.toml
```

Execution through this closed test transport still requires the exact staged
package pins. It exercises the native runtime boundary, but does not establish
installed-GUI or Tauri ACL acceptance.


## Linux staging permissions

Use a new output directory on a filesystem that preserves Unix permission modes.
Preparation verifies its private mode before copying resources or compiling the
native application. Mounts with fixed modes are refused with an explicit staging
error; choose a POSIX staging directory and archive the completed package and
receipts afterward. Build targets also need executable filesystem support.

Before Debian assembly, the builder sets directories to `0755`, ordinary resource
and control files to `0644`, and only the desktop application and Renode executable
to `0755`. This makes resources readable after installation assigns root ownership,
independently of the build umask or input modes. Symlinks, special files and missing
native executables are refused. File contents, source pins and digest seals remain
unchanged. These checks do not close component provenance or redistribution review.

```sh
node --test test/spike-linux-package-modes.test.mjs test/spike-linux-package.test.mjs
```

## Distributed component inventory (G05, Linux, unqualified)

Derived from `scripts/build-spike-linux-desktop.mjs`, `apps/tauri/src-tauri/tauri.conf.json`,
`Cargo.toml`/`Cargo.lock` and the generated Rust section of
[THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md). This is an inventory, not a
licence clearance; `redistributionValidated` stays `false`.

| Installed component | Origin / provenance pointer | Licence (as declared) | Status |
|---|---|---|---|
| `usr/bin/brickwright-tauri` (debug-symbol-free dev build, desktop `rlib` profile) | This repository, `apps/tauri/src-tauri`; source closure hashed in `native-source-inputs.json` | BSD-3-Clause | Source-to-binary join is the recorded binary SHA only; no reproducible-byte claim |
| Statically linked Rust crates (608 in the generated list, all targets) | `Cargo.lock`; list regenerated by `scripts/gen-rust-notices.mjs`, checked by the Rust notices workflow | Mostly MIT / Apache-2.0 / BSD; see flags below | Per-target subset actually linked on Linux is not separately enumerated (unverified) |
| `tauri-plugin-blec` git fork | Exact `rev` pin in `Cargo.toml` | Declared permissive in the generated list | Fork provenance by commit pin only |
| Embedded GUI (`frontendDist`) | Supplied GUI build; every file hashed in `build-inputs.json` | Lite BSD-3 plus [package notices](PACKAGE-UPSTREAM-NOTICES.md) | Must come from the same source revision; not re-verified at compile time |
| `renode/renode` + 14 named native libraries (.NET runtime `libcoreclr`, `libclrjit`, `libhostfxr`, `libhostpolicy`, `libSystem.*`, `libMono.Unix`, `libmscordaccore`, `libmscordbi`, `libllvm-disas`) | Separately supplied Renode distribution; hashes in `build-inputs.json` | Renode MIT; .NET runtime MIT; `libllvm-disas` LLVM (Apache-2.0 WITH LLVM-exception) — **unverified**, only supplied `licenses/*-license` notices are copied | Matching .NET native notices and source provenance still open |
| `renode/.renode-root`, `renode/scripts/monitor.py` | Renode distribution | Renode MIT (unverified per file) | Copied byte-exact |
| `renode/licenses/*-license` (must include `renode-license`, at most 128) | Renode distribution | As supplied | Copied, not reviewed for completeness |
| `micropython/` support profile (17 verified artifacts incl. Renode models, platform `.repl`, state/mailbox tools, boot seed, `licenses/renode-models-MIT.txt`, `licenses/brickwright-BSD-3-Clause.txt`) | `stage_prime_micropython.py` output; manifest digests checked by `prepare-spike-micropython-pins.mjs` | MIT / BSD-3-Clause | See [installed resources](spike-micropython-installed-resources.md) |
| Optional `guest/`, `nuttx/` profiles | Source-built staged profiles frozen by `scripts/lib/spike-resource-profile.mjs` | Per their preserved notices (NuttX Apache-2.0; firmware notices per L11) | Firmware L11 / Runtime coordination open |
| `usr/share/applications/brickwright.desktop`, `DEBIAN/control` | Generated by the builder | BSD-3-Clause | — |

External user firmware images are never bundled. System libraries named in
`Depends` (GTK 3, WebKitGTK 4.1, libstdc++, zlib) are not distributed.

Licences outside the accepted MIT/BSD/Apache/MPL/LGPL set, from the generated
Rust list (all targets), needing an explicit review before any redistribution claim:
`Unicode-3.0` only (icu4x crates, `litemap` and related, 18 entries);
`ISC` (`libloading`, `rustls-webpki`, `untrusted`; `ring` is `Apache-2.0 AND ISC`);
`Zlib` (`foldhash`); `CC0-1.0` (`tiny-keccak`); `CDLA-Permissive-2.0`
(`webpki-roots`, data). `unescaper` (`MIT OR GPL-3.0-only`) is taken under MIT.
MPL-2.0 file-level obligations apply to `cssparser`, `cssparser-macros`,
`dtoa-short`, `option-ext`, `selectors` and `serialport`; source-availability
evidence for those files in a distributed build is not yet recorded. Two crates
offer LGPL-2.1-or-later only as an alternative to MIT/Apache.

Builder refusals covered by `test/spike-linux-package-refusals.test.mjs`: output
reached through a symlinked alias inside an input (fixed: the output parent is now
resolved before the containment check), missing/empty native libraries, a missing
`renode-license`, runtime helpers behind a directory link escaping the runtime
root, frontend links and missing broker assets, a tampered support artifact, and
compile pins free of staging paths. Owned-child cleanup is covered by the native
supervisor tests, not by this host test.
