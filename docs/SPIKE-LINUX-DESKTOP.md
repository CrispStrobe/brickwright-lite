# Local Linux desktop package

The offline builder assembles a Linux x64 `.deb` from a built Brickwright GUI,
a separately supplied Renode distribution and the closed MicroPython support
profile. It does not download or bundle a hub firmware image, upload artifacts,
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
named native libraries, supplied notices and the seventeen verified support
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

The full NuttX and small guest routes retain their existing separately configured
package paths; this builder does not yet produce a portable combined package for
those routes. Original LEGO images remain a private bring-up path, without a
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
