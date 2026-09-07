# Build and verification

## Web application

Requirements: current Node.js supported by CI, npm, Git, and enough memory for
the production webpack build.

```bash
npm run vendor
npm run integrate
cd packages/scratch-gui
npm install --ignore-scripts --legacy-peer-deps
node ../../scripts/apply-vm-overlay.mjs
node ../../scripts/apply-paint-overlay.mjs
NODE_ENV=production npm run build
```

`packages/` is generated from immutable pins. Do not hand-edit it. When an
owned overlay changes, rerun integration and commit any tracked mirror update
with the source change.

## Native application

Build the web application first, then:

```bash
cd apps/tauri
npm ci
npx tauri dev
```

Platform packages are built by `.github/workflows/release.yml` and
`.github/workflows/mobile.yml`. For a physical iOS development package use
`npm run ios:device-build`; `tauri ios dev --no-dev-server` does not create the
required offline production asset mode.

## Required local gates

Run the smallest focused test while iterating, then before handoff run:

```bash
npm test
npm run sync:bundled-extensions:check
npm run package:broker-proof-pins:check
npm run package:broker-assets:check
```

Run `npm run build:gui` when changing runtime integration, overlays, generated
assets, lazy loading, or packaging. Run the relevant browser verifier for any
user-visible path. A unit test does not replace a browser or package gate when
the defect is only observable after bundling.

SPIKE dashboard contract tests:

```bash
node --test test/virtual-spike-panel.test.mjs \
  test/virtual-spike-shared-state.test.mjs \
  test/virtual-spike-classic.test.mjs \
  test/virtual-spike-prime.test.mjs \
  test/spike-codec-fixtures.test.mjs
```

## Provenance and private inputs

Every fetched build input needs an immutable revision, content hash, license
entry, and check mode. Developer-side firmware and oracle inputs remain outside
the repository. A private-image test must identify the image by hash without
printing its bytes or uploading outputs derived from it.

Micro:bit firmware-specific instructions are in
[MBIT-BUILD.md](MBIT-BUILD.md).
