/** PXT appends frame identifiers to the simulator URL; require its exact path. */
export function isArcadeSimulatorUrl (value, origin) {
    try {
        const url = new URL(value);
        return url.origin === origin && url.pathname === '/arcade/sim/simulator.html';
    } catch {
        return false;
    }
}
