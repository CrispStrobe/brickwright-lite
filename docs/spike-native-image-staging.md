# Native-owned image staging

The BSD-3-Clause staging capsule accepts only already-admitted canonical bytes
and a native-created private root. `AdmittedImage::stage` connects image
admission to it in desktop builds. No source filename, editor path, download,
monitor command or firmware bytes are returned to the editor.

On Unix the root must be a real private directory owned by the current effective
user. A fresh random child contains only `image.bin`. Creation, reads and cleanup
use retained directory descriptors with no-follow opens. Verification checks
identities, regular-file/link bounds, size and canonical SHA-256. Hold the capsule
until its owned emulator has fully stopped; verify immediately before loading.
Drop removes only its own file and empty child directory. Changed identities and
unknown entries are preserved. Non-Unix operations fail closed until private ACL
and stable file-identity checks exist.

These checks detect substitutions at verification time; POSIX does not provide
atomic inode-matching unlink, and path-based loading is not an immutable handoff
against a hostile same-user process. The final startup integration must address
its handoff contract. This component adds no native chooser, UART handler or
Renode launch profile, and does not enable a GUI firmware option.

The standalone admission parser remains std-only. Staging reuses existing
`sha2`, `getrandom`, and Unix `libc` dependencies (MIT OR Apache-2.0); no new
dependencies or firmware assets are added.

Run the synthetic capsule tests with the native app test build:

```sh
cargo test --manifest-path apps/tauri/src-tauri/Cargo.toml spike_staged_image::tests
```

Tests cover private files/modes and hashes, content/size changes, distinct
capsules, bounds, wrong roots, file/directory replacement, symlinks and hardlinks,
nonregular files, unknown entries, and renamed-root substitution while preserving
unrelated targets. The coordinator also tested admission/staging against an
existing local MicroPython image and detected an implementation mutation removing
the content digest check. Generated inputs, results and complete implementation
transcripts are retained privately. Restrictions for the fresh capsule author
were instruction-based; tool-call audit applies only to that component.
