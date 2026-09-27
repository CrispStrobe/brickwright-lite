# LEGO MINDSTORMS `.lms` projects

Brickwright can open a MINDSTORMS Robot Inventor `.lms` file from **File →
Load from your computer**. An `.lms` file is a ZIP containing `manifest.json`,
`scratch.sb3`, and optionally `icon.svg`. Brickwright opens the embedded Scratch
project and retains the LEGO manifest and icon. For a project opened this way,
**File → Save as LEGO MINDSTORMS (.lms)** writes the current project back into
the wrapper, preserving any additional archive entries. An unedited import
reuses the original embedded `.sb3` byte for byte. If editing causes a LEGO
`flipper` block to disappear, export refuses
instead of writing a damaged `.lms` file.

The terminal path uses this repository's `bwlite` command (see the
[CLI guide](CLI.md)) and the same converter:

```sh
bwlite mindstorms import 'Projekt 33.lms' --out project.sb3
bwlite mindstorms export project.sb3 --template 'Projekt 33.lms' --out revised.lms
```

Keep the source `.lms` file as the export template: it carries LEGO-only
project settings, remote widgets, animations, and artwork. Brickwright does
not execute LEGO `flipper` blocks or translate Brickwright-only blocks into
MINDSTORMS blocks. The USB pseudocode runner is a separate route for live
hub control.
