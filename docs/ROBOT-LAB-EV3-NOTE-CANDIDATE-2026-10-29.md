# EV3 note-frequency candidate

The candidate branch `lane/ev3-note-to-frequency-20261029`, head
`b8d10ffcdcba72e83518a76d990f1deb24f88901`, adds the EV3 VM's
`NOTE_TO_FREQ` instruction. It recognizes the firmware's 36 uppercase natural
and sharp names in octaves 4–6 and returns the firmware's 440 Hz fallback for
other strings. This is a candidate, not a landed or hardware-qualified change.

The branch includes compiler-produced fixtures for literal, mutable and
array-handle strings. Focused tests also exercise invalid handles and snapshot
continuation. A source-bound CPU run passed seven note tests, 26 existing VM
regressions, and three selected virtual-brick tests; ten unrelated brick tests
were intentionally filtered. The earlier wrapper failure is retained, and each
successful compiler input and run must not be repeated merely to recover output.

The [Robot Lab restart handoff](ROBOT-LAB-RESTART-2026-10-29.md) records the
integration dependency, queue policy, full qualification and normal merge
requirements. After qualified main is available, open a PR for this branch,
verify its actual checkout and affected clean virtual-brick tests, pass all
enabled checks, independently inspect required retained originals, and merge
with matched-head and tree/parent verification. Update this status only after
those steps actually complete.
