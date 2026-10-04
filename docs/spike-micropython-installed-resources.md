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

The generated `support/pins.json` contains four compile-time values:

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

Configure the Tauri bundle to map only the reviewed runtime distribution and
closed support package to their matching destinations. Tauri supports explicit
[source-to-destination resource mappings](https://v2.tauri.app/reference/config/#resources).
The tool also emits `support/tauri-support-resources.json`, an override containing
exact mappings for the 16 support artifacts and `manifest.json`. Use that config
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
