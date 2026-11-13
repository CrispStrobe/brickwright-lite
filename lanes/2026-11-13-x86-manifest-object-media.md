# x86 manifest object media references

Status: implementation complete locally; awaiting review and normal CI.

Scope: Machine Manager media-manifest import in `overlay/scratch-gui/src/lib/bw-machines/importers.js`, its tracked packages mirror, and `test/machine-manifest-media.test.mjs`.

Object-shaped disk references now resolve relative `url`/`href` beside their manifest, matching filename slots. Absolute references retain their location. Copying object slots before sibling floppy geometry overrides also preserves caller-owned manifests.

Validation: five focused regressions, including repo import through activation and media dispatch with authored raw disk bytes; existing local DOSBox, media-order and runner checks pass (14 tests combined). The new regressions fail on the previous implementation. No engine pin, CPU behavior, workflow or event dispatch changes. Installed guest compatibility is outside this importer-only fix.
