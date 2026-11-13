# Robot Lab instruction printing

Status: CLAIMED.

Restore the Print action after an instruction-rendering or print-window failure, with a clear message so the user can retry. Preserve successful printing and blocked-popup behavior.

Scope: `sim-lab-instructions.jsx`, `sim-lab-instructions-text.js` in the Robot Lab component directory, and focused print-flow tests. No model, physics, instruction generation or persistence changes.
