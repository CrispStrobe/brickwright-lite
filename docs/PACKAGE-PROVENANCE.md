# Package metadata and installed-content verification

`node scripts/pin-packages.mjs --check` checks exact package specs, lock root
specs, and resolved GitHub owner/repository/full commit. It does **not** prove
what is installed. Package versions, `_resolved`, and a matching lockfile are
not content evidence. Unsupported URL spellings fail closed.

For actual installed payload verification, run:

```sh
node scripts/pin-packages.mjs --verify-installed \
  --source bw-board=/trusted/local/bw-board \
  --source bw-circuit-ui=/trusted/local/bw-circuit-ui \
  --installed-root node_modules \
  --installed-root packages/scratch-gui/node_modules
```

This first checks metadata, then checks each local repository's exact GitHub
origin and pinned commit, archives that Git object (ignoring dirty worktree
contents and replacement refs), and runs offline `npm pack --ignore-scripts`
in a clean temporary directory. Because some npm versions invoke `prepare`
despite `--ignore-scripts`, lifecycle definitions are removed from the disposable
pack input, and the exact pinned manifest bytes restored in the expected payload.
Every expected packed file must be installed
with identical bytes; missing, modified, unexpected files and symlinks fail.
No fetch, dependency install, prepare, or prepack runs. Temporary files are
removed on success or failure. Git, npm, and tar must be available.

Run this CI gate after **both** root and integrated GUI package installs: source
unit tests use the root install; the app bundles the GUI install. Each repeated
`--installed-root` names a `node_modules` directory relative to the invoking
working directory; every package in every supplied root must pass. Omitting
the option verifies only this repository's root install, never implicitly the
GUI install. Missing roots fail, not skip. Metadata checks remain root-scoped;
the existing integrated GUI spec test checks its derived manifest separately.
After byte verification, each UI must resolve `bw-board/package.json` to its
own verified sibling engine's physical path. A nested UI engine copy is refused,
even with identical version or bytes; an absent sibling cannot fall back to an
ancestor. This is a narrow single-engine architecture check, not a claim that
all transitive dependency versions or contents have been verified.

Trust boundaries: the reviewed pin and local Git object store are supplied by
the operator; a remote URL alone is not cryptographic proof of repository
ownership. The gate verifies packed payload bytes, not signatures, executable
mode bits, dependency contents, or files outside the package. A package's root
`node_modules` directory is excluded because npm owns dependency installation
separately. Source symlinks/submodules are unsupported and fail closed. Packages
requiring generated build outputs unavailable in the pinned tree need a
separately reviewed reproducible-build contract; this gate never silently runs
their lifecycle scripts. npm pack behavior is tool-version dependent; use the
same npm version for installation and verification. Run without concurrent
package writes: this is a point-in-time comparison, not a filesystem lock.

`--set package=40hex` is explicit pin-move authority and uses the shared pin
writer. It cannot be combined with read-only verification flags. It derives
specs and reinstalls; that operation alone still proves only metadata agreement.
