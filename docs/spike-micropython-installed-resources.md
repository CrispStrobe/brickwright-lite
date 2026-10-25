# Relocatable MicroPython resource paths

The optional desktop MicroPython profile can resolve its runtime and support
relative to Tauri's native resource directory. This removes build-machine paths
from those compile-time pins. Native app setup supplies the resource directory
once; the editor cannot choose it, override pins or supply executable paths.
The configured absolute-path mode remains available for local development.
This change covers the MicroPython route; guest/NuttX/EV3 packaging is unchanged.

Prepare a dedicated local resource tree with a qualified Renode distribution at
`runtime/`, retaining its required files, executable permissions and notices.
Assemble public support using the
[Renode support instructions](https://github.com/CrispStrobe/renode-spike-prime/blob/main/docs/spike-micropython-support.md),
then freeze it under that tree:

```sh
node scripts/prepare-spike-micropython-pins.mjs \
  /absolute/assembled-support \
  /absolute/native-resources/runtime/renode \
  /absolute/native-resources/support \
  --resource-root /absolute/native-resources
```

The generated `support/pins.json` contains four compile-time values for the
legacy source-overlay profile:

| Pin | Purpose |
| --- | --- |
| `BW_RENODE_RESOURCE_EXECUTABLE` | Executable relative to the native resource directory, for example `runtime/renode`. |
| `BW_RENODE_MICROPYTHON_RESOURCE_ROOT` | Support directory relative to native resources, for example `support`. |
| `BW_RENODE_SHA256` | SHA-256 of the qualified executable. |
| `BW_RENODE_MICROPYTHON_MANIFEST_SHA256` | SHA-256 of the closed support manifest. |

Supply those values to the Rust build. Do not also set the corresponding absolute
`BW_RENODE_EXECUTABLE` or `BW_RENODE_MICROPYTHON_ROOT`; configuring both variants
for one location is refused. Relative pins use forward slashes, forbid empty,
`.`/`..` and interpreted path components, and resolve canonically within the
native resource directory. A symlink that escapes that directory is refused.
The executable digest and every support artifact are checked before launch.

For a runtime with compiled Prime models, assemble an explicit compiled support
profile before freezing it. The legacy source-overlay platform uses different
model type names; omitting its model include alone does not make it compatible.
The desktop helper reads four native platform files from an immutable local
Runtime Git commit without fetching or changing that checkout. Its model
contract must match the selected commit's MicroPython stager. It applies the
same application clock/storage settings and retains the legacy package's UART
helper, authored seed, state helpers, model source and notices byte for byte.
The retained model source remains credited but is not included at runtime.

```sh
node scripts/prepare-spike-compiled-micropython-support.mjs \
  assembled-support renode-spike-prime PLATFORM_COMMIT MODEL_CONTRACT_COMMIT \
  native-resources/runtime/renode compiled-support
```

Use the resulting `compiled-support` as the pinning tool's support input. It has
17 manifest entries, including `profile.json`. That descriptor records schema
version 1, kind `compiled-prime-models/v1`, the runtime executable SHA-256 and
the platform/model contract commits. Pin generation also emits
`BW_RENODE_MICROPYTHON_PROFILE_SHA256`; supply this fifth value to the native
build. The existing Linux desktop packager propagates it automatically. The
descriptor is included in the resource mapping and closed manifest. Both the
manifest and descriptor are checked before image staging and checked again
before supervisor handoff. A missing native profile pin, different runtime pin,
changed descriptor or descriptor omitted from the manifest is refused. The
editor cannot select or override this profile.

These pins bind selected build inputs; they do not establish that a runtime
binary was built from the stated source contracts or qualify an application.
The compiled route needs its own installed selected-image/raw-REPL, error,
Stop and fresh-recovery evidence. Historical legacy results below do not
qualify this new route. No runtime or application is fetched by either helper.

Configure the Tauri bundle to map only the reviewed runtime distribution and
closed support package to their matching destinations. Tauri supports explicit
[source-to-destination resource mappings](https://v2.tauri.app/reference/config/#resources).
The tool also emits `support/tauri-support-resources.json`, an override containing
exact mappings for the 16 legacy or 17 compiled support artifacts and
`manifest.json`. Use that config
when building the Tauri package; it preserves each support path and excludes
pin metadata, firmware and adjacent files. Add your reviewed runtime mapping
separately, for example `/absolute/native-resources/runtime/` to `runtime/`.
Generated pins and resource config are local build metadata, not shipped support
artifacts. The generated config's source paths are build-machine paths; the
compiled runtime/support pins and installed destinations are relative.
The pinning tool stages only the closed support package; it does not fetch,
copy or bundle a runtime distribution. The packager supplies that distribution
with applicable dependency licenses/notices and platform/signing requirements.
Do not map a workspace, qualification directory or firmware backup folder into
resources. The application image is selected separately by the native chooser.

The runtime file is bounded to 512 MiB when generating pins. Its remaining files
and host-library requirements are those of the qualified distribution; only the
executable has the existing runtime digest pin. This is resource-path relocation,
not a new runtime dependency-closure signature or automatic installer/download.
Default desktop builds still have no runtime/support profile configured.

Synthetic tests cover moving resource roots, invalid paths, mixed modes, missing
native setup, symlink escape and preserving existing packages. Run:

```sh
node --test test/native-spike-micropython-pins.test.mjs test/renode-supervisor.test.mjs
cargo test --manifest-path apps/tauri/src-tauri/Cargo.toml --lib package_paths
```

Live qualification passed with the same compiled native host, resource pins and supplied
MicroPython 1.26.1 application before and after moving the entire resource tree.
The production frontend/native/Renode/shared-arena path, Python motor feedback,
completion and cleanup passed in both locations. Changed executable and support
files were refused before execution and left no staging capsules. A containment
check mutation made the compiled symlink-escape test fail. Generated packages, supplied
images, fixtures, observations and raw transcripts remain private. This does not
qualify a signed installer, OS-dialog automation, macOS/Windows packaging or
non-Unix image staging. New packaging additions use BSD-3-Clause; retained runtime
and model attribution remains applicable.
