/**
 * What `@yowasp/yosys` resolves to in a build that did not ask for it.
 *
 * NOT a convenience. A flag-off build REDDENED without this, and the reason is
 * worth stating because it contradicts what this surface's comments assumed:
 *
 *   **webpack resolves the flagged modules even when BW_ENABLE_FPGA is off.**
 *
 * `process.env.BW_ENABLE_FPGA` is a DefinePlugin substitution, so the flag
 * removes the code from the OUTPUT — after resolution. `new Worker(new URL(...))`
 * is detected statically and pulls yosys-worker.js into the graph regardless, and
 * that file imports a 75 MB package this repository does not depend on. Build
 * run 35185515757: `Can't resolve '@yowasp/yosys'`.
 *
 * Adding the dependency would put 75 MB in every install to serve a tier almost
 * nobody enables, which is the trade the whole local tier exists to avoid. So the
 * default build resolves the import HERE, and this throws a named refusal if
 * anything ever reaches it — which nothing can, because the only caller is behind
 * the flag.
 *
 * A build that WANTS the local tier sets BW_ENABLE_FPGA=1 and installs the
 * package; webpack.config.js then leaves the specifier alone.
 *
 * @module
 */

const REFUSAL = 'The local synthesis toolchain is not in this build. It is opt-in: '
    + 'build with BW_ENABLE_FPGA=1 and install @yowasp/yosys. Nothing was downloaded, '
    + 'and nothing is broken — this build simply does not carry it.';

export function runYosys () {
    // Throwing beats returning a refusal object: this is unreachable, and an
    // unreachable path that returns something plausible is how a stub ends up
    // silently standing in for the real thing.
    throw new Error(REFUSAL);
}

export const commands = Object.freeze({});
export default {runYosys, commands};
