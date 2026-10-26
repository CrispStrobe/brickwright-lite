# SPIKE runtime on macOS — feasibility (2026-10-26)

This is a feasibility study, not a macOS SPIKE delivery. Nothing here is signed with
a distribution identity, notarized, submitted to the Mac App Store, or installed by
the Brickwright app. It answers one question with hosted evidence: can the SPIKE
Renode runtime, with this project's own source-built NuttX guest, run inside the
macOS App Sandbox in the shape the Tauri app would use?

Claim: [`lanes/2026-10-26-spike-macos-runtime-feasibility.md`](../lanes/2026-10-26-spike-macos-runtime-feasibility.md).

## Short answer

Yes, on both architectures, in this finite probe. A sandboxed parent process that
spawns Renode as a child signed `app-sandbox` + `inherit` booted the own NuttX guest
to a live state snapshot on `osx-arm64` (macOS 14, `macos-14` runner) and `osx-x64`
(`macos-15-intel` runner), with the non-single-file Renode layout. No sandbox denial
was logged for the Renode or launcher processes. It also booted under the hardened
runtime, but with ad-hoc signing even the variants without `cs.allow-jit` or without
`cs.disable-library-validation` booted, so these runs do not establish which
hardened-runtime entitlements a Team-ID-signed build needs. The upstream single-file
Renode layout does **not** run in the sandbox (see below).

What this does not show: a Mac App Store signed build (Team ID, provisioning profile,
App Review), notarization, the real Tauri app as the parent, the GUI, any program
run, display frames, Bluetooth, long sessions, performance, or physical behaviour.

## Where the evidence is

All builds and runs happen on hosted GitHub runners in the owner's public fork
`CrispStrobe/renode-spike-prime`, workflow `.github/workflows/macos-sandbox-feasibility.yml`
(added by renode-spike-prime PR #61). It never touches this repository's
`release.yml`, which belongs to the model-delivery lane.

| Job | What it does |
|---|---|
| `own-guest` (Ubuntu) | Builds the own firmware `brickwright-spike-prime-fw@91cf0c07` (TI-free `simulation` profile only, TI-free image gate) and stages it with this repository's unchanged `scripts/prepare-spike-nuttx-package.mjs --compiled-models` (Lite `8bf40b2c`) |
| `renode-macos` (`macos-14` arm64, `macos-15-intel` x64) | Builds the pinned Runtime `renode-spike-prime@41338096`, Infrastructure `@1253d925`, tlib `antmicro/tlib@d50c868f`, resources `renode-resources@14b80cde` with upstream `./build.sh --net --no-gui -t`, plus a non-single-file `dotnet publish` of the same build; uploads the `.dmg`, the non-single-file tree and file inventories |
| `sandbox-probe` (both runners) | Wraps the build in minimal ad-hoc signed `.app` bundles, runs each variant headless and reads the first state-service snapshot over localhost |

The probe launches Renode with exactly the arguments `scripts/lib/sim-lab-renode-guest.mjs`
uses for NuttX (`--disable-gui`, monitor port, `nuttx.resc`, both ELFs, vector table,
`SP`/`PC`, `emulation RunFor "1.0"`, `spike_state_start`). It then connects to the state
service, reads one snapshot, asks the monitor for `emulation RunFor "4.0"`, and reads a
second snapshot. "Booted" below means: the snapshot reports `firmware: brickwright-nuttx`,
virtual time `clockNs` 1 000 000 000 and then 5 000 000 000, and two motors on the
expected ports. The snapshots carried no display frame (`0x0`), so this is a first
observable state, not a first frame.

### Runs and original failures

| Run | Head | Result |
|---|---|---|
| 40304342231 | first | Guest and both macOS builds pass (Renode 1.16.1, build `41338096`, .NET 8.0.30). Probe fails: the baseline ran with `--hide-log` and never answered; `bash -e` stopped after it. |
| 40308798502 | second (PR) | `osx-x64` build fails: `hdiutil: create failed - Resource busy` (runner flake after a good compile). |
| 40308804034 | second | All variants stop at `include models.cs`: `Tried to load assembly 'Antmicro.Renode.Peripherals.UART.ILpf2Device' that has been already loaded`. This Runtime already compiles the Prime models, so the package must use the existing `--compiled-models` mode. Nothing to do with the sandbox. |
| 40322587494 | third | Guest boots on both arches. But `codesign` refused to sign the bundle main executable with the Renode tree inside `Contents/MacOS` ("code object is not signed at all"), so the "sandbox" variants ran with the linker's ad-hoc signature and no entitlements. Counted only as unsandboxed boots. |
| 40330534426, 40331442550 | fourth, fifth | Probe script errors (`find` EPIPE under `pipefail`; empty array under `set -u` on bash 3.2). |
| 40336234971 | sixth (PR) | `osx-x64` `hdiutil` flake again. The workflow now retries only that command. |
| **40336239431** | sixth | Tauri-shaped variants boot sandboxed on both arches (table below). |
| **40343918260** | seventh | Parent/child single-file and no-LGPL layouts and negative controls (table below). |

## Results

### What booted, sandboxed (run 40336239431)

| Variant | osx-arm64 | osx-x64 | Sandbox evidence |
|---|---|---|---|
| Unsandboxed baseline, unsigned, non-single-file layout | boots (snapshot after 7.7 s) | boots (27.4 s) | — |
| Sandboxed launcher → Renode child, no hardened runtime | **boots** (7.7 s) | **boots** (20.2 s) | `libsystem_secinit` logs `AppSandbox` for `launcher` and `renode`; container created; no denials |
| Same, hardened runtime on both | **boots** (8.3 s) | **boots** (19.5 s) | as above; `flags=0x10002(adhoc,runtime)` |
| Renode signed `app-sandbox` and executed directly (not a bundle main launched by LaunchServices) | traps (`EXC_BREAKPOINT`, exit 133) | traps (exit 132) | secinit refuses; not the Tauri shape, not pursued |

The snapshot times are wall time from launch to the first state-service answer and
include CoreCLR start-up and the Prime model set-up; they are not performance claims.

### Layouts and negative controls, all sandboxed parent → child (run 40343918260)

| Variant | osx-arm64 | osx-x64 | Detail |
|---|---|---|---|
| Non-single-file, no hardened runtime | boots (11.0 s) | boots (25.4 s) | repeat of 40336239431 |
| Non-single-file without `PacketDotNet.dll`/`.pdb` and `Lib/ensurepip/` | **boots** (9.4 s) | **boots** (21.6 s) | same snapshot |
| Upstream single-file apphost | fails (`SIGABRT`) | fails | `UnauthorizedAccessException: Access to the path '.../Library/Containers/<id>' is denied`: Renode's `Misc.TryGetRootDirectory` walks up from the extraction directory looking for `.renode-root` and enumerates the container's parent |
| Single-file with `DOTNET_BUNDLE_EXTRACT_BASE_DIR` in the container | fails | fails | same exception |
| Parent without `network.server` | fails (`SIGABRT`) | fails | `Unable to create '0.0.0.0:39554' socket: [AccessDenied]`: the entitlement is required. Renode's monitor `-P` binds all interfaces, not loopback |
| Hardened runtime, `allow-jit` + `disable-library-validation` | boots | boots | |
| Hardened runtime without `allow-jit` | boots | boots | ad-hoc signing: not a valid negative control |
| Hardened runtime without `disable-library-validation` | boots | boots | ad-hoc signing (no Team ID anywhere): not a valid negative control |


### Entitlements that were sufficient

Launcher (the app's main executable, in the real app the Tauri binary):

| Entitlement | Why |
|---|---|
| `com.apple.security.app-sandbox` | Required for the Mac App Store |
| `com.apple.security.network.server` | Renode's monitor and the SPIKE state service listen on `127.0.0.1` |
| `com.apple.security.network.client` | The app connects to those localhost ports |
| `com.apple.security.cs.allow-jit` | Hardened runtime only; whether it is required was not established (ad-hoc runs booted without it) |
| `com.apple.security.cs.disable-library-validation` | Hardened runtime only; likely needed for the extracted tlib library once a Team ID and library validation apply (not tested) |

Renode child (`Contents/Resources/renode/renode`):

| Entitlement | Why |
|---|---|
| `com.apple.security.app-sandbox` + `com.apple.security.inherit` | Child inherits the parent's sandbox and container |
| `com.apple.security.cs.allow-jit` | Hardened runtime only, as above |
| `com.apple.security.cs.disable-library-validation` | Hardened runtime only, as above |

Shown required by a negative control: `network.server` on the parent. The child form
`app-sandbox` + `inherit` is Apple's documented one; a Renode signed `app-sandbox`
alone and executed outside LaunchServices trapped in secinit. Not needed in any booted variant:
`cs.allow-unsigned-executable-memory`,
`cs.disable-executable-page-protection`, file-access entitlements (the guest package is
read from the bundle; Renode writes only to the container's `tmp`). The Mac App Store
requires the sandbox, not the hardened runtime, so the non-hardened row is the
App Store shape; the hardened runtime matters for a notarized direct download and needs
its own measurement with a Team ID.

### Packaging facts the app integration must respect

- **Layout.** Keep `Contents/MacOS` for the main executable only. With the Renode tree
  (managed `.dll`, scripts, platforms, `Lib/`) inside `Contents/MacOS`, `codesign`
  refuses the bundle. Under `Contents/Resources/renode/` it signs and verifies with
  `codesign --verify --strict`. Every nested Mach-O (the Renode apphost, 15 `.dylib`
  files, `createdump`) must be signed individually; `--deep` was not used.
- **Environment.** A sandboxed app started by LaunchServices sees its container as
  `HOME`/`TMPDIR`; the probe sets both to the container explicitly. The app's Renode
  supervisor should pass the container's `tmp` explicitly as well.
- **Single-file vs separate files.** Upstream builds Renode for macOS as one
  single-file apphost with `IncludeNativeLibrariesForSelfExtract` and
  `IncludeAllContentForSelfExtract`, so at start it writes native libraries and
  content into an extraction directory and loads them from there. In the sandbox it
  then aborts in `Misc.TryGetRootDirectory`, which searches upward from that directory
  for `.renode-root` and is denied the container's parent (run 40343918260, with and
  without `DOTNET_BUNDLE_EXTRACT_BASE_DIR`). The non-single-file `dotnet publish` (383
  managed `.dll`, separate `.dylib` files) needs no self-extraction, finds
  `.renode-root` beside the host, and keeps every component a separate, individually
  signed, replaceable file. That layout is the one to package.
- **Monitor socket.** `renode -P <port>` listens on `0.0.0.0`, not loopback (the SPIKE
  state service does bind `127.0.0.1`). Inside the sandbox this needs `network.server`
  either way; binding loopback only would be a small Renode change worth making before
  shipping.
- **tlib is loaded from a written file in every layout.** The `translate-*.so` tlib
  libraries are `EmbeddedResource`s of `Infrastructure.dll`; Renode extracts the one it
  needs to a temporary file and `dlopen`s it. That worked under the sandbox and the
  hardened runtime with ad-hoc signing (the extracted file carries the linker's ad-hoc
  signature) and `disable-library-validation`. With a Team ID and library validation
  on, a freshly written library is expected to be refused, and App Review may object to
  loading code that is not in the signed bundle. Shipping tlib as a separate signed file
  in the bundle and loading it from there would need an Infrastructure change in the
  owner's fork. This is the main open technical item.
- **`dotnet` single-file apphost name.** The non-single-file publish names the host
  `Renode`; the dmg names it `renode`. The default macOS file system is
  case-insensitive, so the probe replaces one with the other.

### JIT status

- **CoreCLR** uses `MAP_JIT` itself. It ran under the hardened runtime with
  `cs.allow-jit`.
- **tlib `d50c868f` does not use `MAP_JIT` or `pthread_jit_write_protect_np`.** On
  Apple arm64 (`tlib-alloc.c`) it maps the code buffer twice: an anonymous
  `MAP_SHARED` read-write mapping and a `mach_vm_remap` alias that it `mprotect`s
  read-execute (`tcg_wx_diff` between them). On x86-64 macOS it uses one
  read-write-execute anonymous mapping.
- **Observed:** that unchanged tlib translated and ran the guest under the App Sandbox
  without the hardened runtime (the Mac App Store shape) on arm64 (macOS 14.8) and x64
  (`macos-15-intel` image), and under the ad-hoc hardened runtime with or without
  `allow-jit`. A `MAP_JIT` + `pthread_jit_write_protect_np` path (as QEMU has for
  Darwin) was therefore not needed in any tested configuration, and no tlib fork was
  made. Because the ad-hoc hardened-runtime negative control also booted, these runs do
  not prove the double mapping is accepted under a Team-ID-signed hardened runtime.
  `MAP_JIT` stays an option if that measurement, a later macOS release, or App Review
  rejects the double mapping. It would need a fork of tlib (the Infrastructure gitlink
  points at `antmicro/tlib`) and touches every code-patching path, so it is not a
  small change.

## Licence inventory (macOS)

This is an inventory and notice-obligation note, not a licence clearance.

### Rust crates linked into `brickwright-tauri` on macOS

Generated by the new `scripts/gen-spike-macos-crate-inventory.mjs`, which reuses the
Linux generator's classifier with `cargo metadata --locked --offline --filter-platform`
for each macOS triple (features `custom-protocol`):
[`aarch64-apple-darwin`](generated/spike-macos-crate-inventory-aarch64-apple-darwin.json),
[`x86_64-apple-darwin`](generated/spike-macos-crate-inventory-x86_64-apple-darwin.json).

| Target | Linked | Build-time only | Not linked on target |
|---|---|---|---|
| `x86_64-unknown-linux-gnu` (existing) | 365 | 92 | 161 |
| `aarch64-apple-darwin` | 304 | 62 | 252 |
| `x86_64-apple-darwin` | 305 | 62 | 251 |

The 28 crates linked on macOS but not on Linux are the Apple bindings (`objc2*`,
`block2`, `dispatch2`, `core-foundation*`, `core-graphics*`, `io-kit-sys`, `mach2`,
`swift-rs`, `window-vibrancy`, `embed_plist`, `foreign-types*`, `base64 0.21`). All are
MIT, Apache-2.0, Zlib or BSD-2-Clause, alone or as alternatives. The flagged licences
from the [Linux review](SPIKE-LINUX-DESKTOP.md#licence-review-of-the-linked-crate-set-2026-10-24)
recur on macOS with the same crates: the same five MPL-2.0 crates (`cssparser`,
`dtoa-short`, `option-ext`, `selectors`, `serialport`), Unicode-3.0, ISC, Zlib,
CDLA-Permissive-2.0, and the dual-licensed ones taken as before. No GPL-only crate is
linked. Eight of the 13 crates without a licence file are linked on macOS
(`alloc-stdlib`, `seahash`, `selectors`, five `unic-*`); the reviewed supplemental texts
in `docs/notices/rust-crates-supplemental/` cover them.

### macOS Renode bundle

From the file inventories of build run 40304342231 (osx-arm64; 982 files in the dmg
app, 943 in the non-single-file tree). Licences are as declared by the notices Renode's
packaging copies into `licenses/` (58 files on macOS).

| Component | Shipped on macOS | Licence (as declared) | Note |
|---|---|---|---|
| Renode (`renode`/`Renode` apphost, `Renode.dll`, `Infrastructure.dll`, platforms, scripts) | yes | MIT | Source `renode-spike-prime@41338096`, `renode-infrastructure-spike-prime@1253d925` |
| .NET 8 runtime (`libcoreclr`, `libclrjit`, `libclrgc`, `libhostfxr`, `libhostpolicy`, `libSystem.*`, `libmscordaccore`, `libmscordbi`, `createdump`, BCL `.dll`) | yes | MIT | **No .NET runtime notice in the macOS `licenses/`** (the Linux builder requires `dotnet-runtime-*-license`); must be added |
| tlib (`translate-*.so`, embedded in `Infrastructure.dll`) | yes | LGPL-2.1 | Notice present. Source `antmicro/tlib@d50c868f`. Embedded, so not replaceable as a file today |
| `libllvm-disas.dylib` | yes | Apache-2.0 WITH LLVM-exception | From `renode-resources@14b80cde` |
| `libMono.Unix.dylib`, `Mono.Unix.dll`, `Mono.Posix.dll` | yes | MIT | |
| NetMQ (`NetMQ.dll`) | yes | LGPL-3.0 with static-link exception | Notice present; needed by Renode's external control |
| AsyncIO (`AsyncIO.dll`, NetMQ dependency) | yes | MPL-2.0 (its notice mentions GNU licences as secondary licences) | Notice present |
| Packet.Net (`PacketDotNet.dll`) | yes | LGPL-3.0 | Notice present. Source `renode-spike-prime@41338096` `lib/Packet.Net` |
| pip 19.2.3 wheel in IronPython's `Lib/ensurepip/_bundled/` | yes | MIT, with LGPL-2.1 notice for a vendored module | Unused by Renode |
| IronPython, Microsoft.Scripting/Dynamic | yes | Apache-2.0 | |
| GLib binding (`GLib-2.0.dll`, gir.core) | yes | MIT | Gtk#, Atk#, Cairo#, Gdk#, Gio#, Pango# notices are copied but those assemblies are not shipped in the headless build |
| mcs | notice only | — | Not shipped |

### Can Packet.Net and the pip module be dropped for SPIKE?

In the non-single-file layout both can be removed as files: the probe deletes
`PacketDotNet.dll`/`.pdb` and the whole `Lib/ensurepip/` directory. That layout booted
the guest unsandboxed on both architectures (run 40322587494, `nsf-nopacket` variant,
same snapshot as with them) and sandboxed in the parent → child shape on both
architectures (run 40343918260, `nsf-parent-child-nolgpl`). Packet.Net is a compile-time
reference of `Infrastructure.dll` (Ethernet models); the SPIKE platform never loads
those types, so .NET never resolves the assembly. That is a runtime observation for
this guest, not a guarantee for other platforms. In the single-file layout neither can
be removed without rebuilding. NetMQ (LGPL-3.0 with exception) and tlib (LGPL-2.1)
remain and are needed.

## Mac App Store notes

- LGPL components should stay **separate, individually signed, replaceable files** in
  the bundle (non-single-file layout), each with its notice and a source pointer
  (exact commits above). tlib is the exception today: it is embedded in
  `Infrastructure.dll` and written out at run time.
- Re-signing a replaced LGPL file breaks the bundle signature; how the LGPL relinking
  obligation interacts with App Store distribution needs its own review. This document
  makes no licence-clearance claim.
- Packet.Net and the vendored pip wheel can be left out of a SPIKE-only bundle
  (above), which removes two LGPL-noticed items.
- Add the .NET runtime notices to the macOS bundle.

## Remaining work for full App Store packaging

Owned by the model-delivery lane (`release.yml`) or needing its coordination:

1. Measure the hardened runtime with a real Team ID (does the double-mapped tlib buffer
   and the extracted tlib library still load, which `cs.*` entitlements are needed).
2. Build the non-single-file Renode for `osx-arm64` and `osx-x64` (or universal) inside
   the release pipeline from the same pins, and stage it as Tauri resources under
   `Contents/Resources/renode/` with the compiled-models NuttX profile.
3. Sign every nested Mach-O with the Mac App Store identity and the entitlements above
   (child: `app-sandbox` + `inherit`; app: `app-sandbox`, `network.server`,
   `network.client`), then the app; `productbuild` as today. Decide whether the
   hardened runtime is used (only needed for notarized direct download).
4. Teach the Rust Renode supervisor to pass the container `tmp` and to spawn the
   bundled child; the macOS resource-path checks and refusal tests the status doc lists.
5. Resolve the tlib loading question (separate signed library in the bundle instead of
   extraction) and test with a real Team ID, library validation on, and TestFlight /
   App Review.
6. Notice closure for the macOS bundle (.NET runtime notices; drop Packet.Net and
   `ensurepip`), and an installed-app test of the signed artifact on macOS.
