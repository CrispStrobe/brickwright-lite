# Preserved upstream package licenses

After verifying installed content against the pinned Git sources, run
`node scripts/package-upstream-notices.mjs` to preserve the installed packages'
exact `LICENSE` bytes in both `overlay/scratch-gui/static/licenses` and
`packages/scratch-gui/static/licenses`. Run with `--check` in CI after installation
and integration; it performs no writes and fails on stale or missing assets.

The bounded generated files in each directory are:

- `bw-board.MIT.txt`: upstream engine MIT license, including its notice.
- `bw-circuit-ui.MPL-2.0.txt`: upstream UI Mozilla Public License 2.0 text.
- `bw-packages.sources.json`: full pinned commits, license byte SHA-256 hashes,
  and expected public GitHub source tree, archive, and LICENSE URLs.

The generator checks installed package names and expected LICENSE headings;
it never substitutes `package.json`'s license field for the actual license.
Those checks are not source provenance: the separate installed-content gate
must establish that these are the reviewed pinned bytes. It does not fetch or
assert present network availability of the source URLs. The manifest's explicit
source links support finding corresponding upstream source; they are not a
legal-compliance certification or a substitute for preserving applicable
notices, publishing required modifications, and reviewing distribution terms.

Defaults read the root `vendor-pins.json` and root `node_modules`. For isolated
generation, `--pins /path/vendor-pins.json` and `--installed-root /path/node_modules`
override those inputs only; output stays in this checkout. Existing unrelated
license files are never changed or removed. This tool intentionally does not
edit THIRD-PARTY-NOTICES prose, install packages, or wire CI/integration hooks.
