# Arcade 2c: native literal logical staging

Owner: Arcade delivery maintainer. Status: IMPLEMENTED candidate; application
qualification and landing pending.

Own the bounded literal-Boolean and forced local-overwrite proof in
console-inspect-values.js and focused native controls. Admit only a flat source
startup chain where a private local starts directly from a closed literal Boolean
comparison, one provably taken IF overwrites it with a pure finite numeric
expression, and a direct read follows without other exposure. Ordinary global
variable guards remain refused: monitors and host paths are not closed by block
writer enumeration. Calls, aliases, captures, extra reads/writers, branches,
loops, unknown conditions, division, modulo and non-finite intermediates refuse.
Existing Number/Text and Boolean/Number controls stay intact.

This prerequisite does not admit call-valued operands, global yes/no staging or
finish row 2c. Three initial logical shapes, nine finite arithmetic cases checked
against the actual Scratch operator implementation, near misses and ten source
cuts pass. Exact Scratch modulo and NaN-cast counterexamples remain refused.
Require affected clean application qualification before source landing. No
workflow, SDK/pin, threshold or actual guest-event change is owned.
