// SPDX-License-Identifier: BSD-3-Clause
// Retain sampled explicit program failure flags even if a later frame clears them.
export function latchProgramFailures(observed, variables) {
    for (const name of ['failed', 'fault']) if (Number(variables[name]) === 1) observed.add(name);
    return observed;
}
