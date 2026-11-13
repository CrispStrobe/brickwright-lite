# DOSBox explicit disk geometry

Owner: x86 implementation. Status: implemented; hosted checks pending.

Scope: DOSBox `imgmount` geometry parsing in the mirrored
`overlay/scratch-gui/src/lib/bw-machines/importers.js` and
`packages/scratch-gui/src/lib/bw-machines/importers.js`, focused local DOSBox
and Machine Manager CLI tests, and the existing x86 user guide.

Reject malformed, repeated or non-512-byte explicit `-size` declarations rather
than silently inferring a different geometry. Each image mount starts with no
geometry; a later mount cannot inherit the previous image's declaration.
Parse geometry only from options following the filename. Omitted geometry and
valid 512-byte CHS remain supported.

Validation: Node 22 local DOSBox and Machine Manager CLI suites pass 17 tests.
The new tests failed on the original unsupported-sector and inherited-geometry
behavior. This changes configuration admission; it adds no CPU, device, media
format, supplier pin or workflow behavior. No new guest compatibility is claimed.
