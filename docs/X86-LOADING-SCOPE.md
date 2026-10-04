# x86 loading scope in Lite

Use [the GUI recipe](I80386-GUI.md) for the actual local-file fields and screen controls. The [bw-board loading guide](https://github.com/CrispStrobe/bw-board/blob/master/docs/X86-LOADING-GUIDE.md) describes the distinct Node CLI loaders and the architecture/backend boundaries. Public software examples use freely licensed or freeware guests, including FreeDOS, ELKS, xv6 and owned fixtures. MIT-released DOS versions remain valid free-software examples; their licensing does not apply to unrelated commercial releases or game data.

## Formats and execution paths

The Machine Manager imports pasted configuration text or manifests and saves media references. On Run, URL-backed media is fetched and hashes are checked when supplied. A local HDD or FreeDOS VGA form reads selected File objects into this tab; those media bytes are not uploaded or saved in the machine library. Importing a DOSBox `.conf` does not unpack a DOSBox package or execute its autoexec as a host shell. Browser URL references do not grant access to arbitrary host directories.

The **Boot disk** form uses a raw HDD with explicit DOSBox `imgmount -size` geometry or the loader's constrained 4-head/17-sector inference. The separate **Boot FreeDOS VGA** form selects the named functional 386 profile, its supported raw floppy/HDD geometry and optional BIOS/VGA files. Media is applied before reset/start. Its **Native blocks (experimental)** option selects the shared-board WebAssembly block dispatcher with ordinary execution at unsupported/debug boundaries; it does not select the separately reviewed Bochs Node addon.

No reviewed x86 GUI route provides a CD-ROM/ISO slot or ISO boot implementation. Accepting a filename or parsing an `imgmount` line does not create a CD-ROM device. Use a supported raw floppy/HDD or program format. No general ZIP/package extractor is exposed by these loading forms.

The functional 8086 DOS-service bench loads programs directly; its 80286 variant is not the separate experimental 286 AT BIOS/protected-mode profile. A wired configuration instead needs its own circuit reference and realization. Functional software acceptance does not establish execution on a wired 8086/Harris 286 board. The experimental 386 GUI is a functional board route, while the Bochs addon currently has source-authenticated bounded diagnostic fixtures rather than a general GUI package loader.

## Read the language/device matrix correctly

[LANGUAGE-DEVICE-MATRIX](generated/LANGUAGE-DEVICE-MATRIX.md) describes programming-language/toolchain routes. Its current x86 device column is **8086 (DOS bench)**, with the direct-import/export contracts recorded there. It does not enumerate separate 80286 or 80386 media-loading columns. The matrix's **N**/“native” notation means the language itself runs on the chip, in the matrix's language/toolchain classification; it does not mean native Bochs CPU execution or prove OS boot, disk, GUI, or physical timing compatibility.

The absence of a 286/386 column is a documentation scope gap, not proof that the functional 386 loader is missing. Conversely, the 8086 column does not qualify every 286/386 guest. The concrete GUI recipe and pinned upstream architecture/results remain the evidence for each route. This note does not regenerate or relabel the generated matrix.

## Display and evidence limits

The **Controller**/Widgets screen provides **Full screen** and **Exit full screen** controls; enlarging its pane does not change emulated VGA resolution. **Play** enables widget interaction, while CPU Run/Pause/Step live in the debugger. Local FreeDOS VGA boot already applies the media, resets and starts its runner. Keyboard focus and enabled guest mouse reporting are required for input; the screen uses pointer capture, not Pointer Lock.

This document audits source at Lite revision `598febf364969f42483821c87bbdc0317e3cdb61`. It introduces no new browser, guest, build or timing acceptance. Existing FreeDOS and owned-fixture evidence remains public; licensed-guest reproduction narratives are retained separately in private documentation with exact original Markdown provenance.
