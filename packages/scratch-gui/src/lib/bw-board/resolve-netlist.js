/**
 * Resolve the ONE board the runner drives: the designer's live circuit if it
 * is up, the example's own bench next, and only then the inferred LED-per-pin
 * netlist — loudly. Extracted from debug-runner.js so the bare-metal debug
 * path and the MicroPython simulator Run (pico-sim-run.js) resolve the board
 * the SAME way, and the phantom-inferred-bench rejection lives in ONE place:
 * two copies would be two truths, and the next fix would land in one.
 *
 * The rejection is load-bearing (owner reports 2026-08-16/17): a circuit the
 * engine rejected leaves the designer board empty, and inventing an inferred
 * bench there drove a phantom set of auto-generated LEDs while the canvas
 * showed the real circuit — the "Blink stopped blinking" family. A rejection
 * is the user's to see, never ours to paper over.
 *
 * @module
 */

/**
 * One-board-one-truth, with the CLOCK taken seriously: the designer board
 * and the auto-run race. An example loads its PROGRAM first (loadProject
 * fires the run token, and a cache-warm compile returns in well under a
 * second) while the circuit fetch and the designer's own render are still
 * in flight — so at attach time vm.runtime.circuitBoard can be legitimately
 * empty for a few hundred milliseconds and legitimately full right after.
 * Falling back to the inferred netlist on that first read is how the
 * pendant ran on a synthesized LED_colX bench while the real ATtiny88 +
 * matrix sat on screen (owner report, 2026-08-16). Wait briefly; fall back
 * only when the designer genuinely never shows up.
 */
export async function resolveNetlist(vm, stc, inferNetlist, waitMs = 2500) {
    const fromDesigner = () => {
        const b = vm && vm.runtime && vm.runtime.circuitBoard;
        return (b && Array.isArray(b.parts) && b.parts.length &&
            typeof b.getNets === 'function')
            ? { parts: b.parts, nets: b.getNets() } : null;
    };
    let n = fromDesigner();
    const deadline = Date.now() + waitMs;
    while (!n && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        n = fromDesigner();
    }
    if (!n) {
        // Distinguish "designer not mounted" from "designer REJECTED the
        // netlist": a rejected netlist leaves the board empty, and falling
        // back to inference here made the emulator drive a phantom bench of
        // auto-generated LEDs while the canvas showed the real circuit (the
        // retro console, 2026-08-16 — the 'Blink stopped blinking' family).
        // A rejection is the user's to see, never ours to paper over.
        const model = vm && vm.runtime && vm.runtime.circuitModel;
        if (model && model.netlistError) {
            throw new Error('the circuit on the canvas was rejected by the engine — ' +
                'refusing to run against a phantom inferred bench. First error: ' +
                String(model.netlistError).split('\n')[0]);
        }
        // Second choice before inventing anything: the EXAMPLE'S OWN
        // circuit, stashed by the importer at load time. Bench files carry
        // nets directly; authored circuits carry wires, whose connected
        // components ARE the nets (union-find).
        const stash = (typeof window !== 'undefined') && window.__bwExampleBench;
        if (stash && stash.benchPath) {
            try {
                const res = await fetch(`examples/${stash.benchPath}`);
                if (res.ok) {
                    const data = await res.json();
                    const built = netlistFromCircuitFile(data);
                    if (built) {
                        announceBoardSource(vm, 'example', stash.exampleId);
                        return built;
                    }
                }
            } catch { /* fall through to inference */ }
        }
        console.warn('[bw-debug] designer board not ready after ' + waitMs +
            'ms — falling back to the inferred netlist');
        // LAST resort, and loudly: the panel shows a warning strip keyed on
        // this — an inferred LED-per-pin board must never impersonate the
        // example's circuit again (owner requirement, 2026-08-17).
        announceBoardSource(vm, 'inferred');
        return inferNetlist(stc);
    }
    announceBoardSource(vm, 'designer');
    return n;
}

/** Tell the UI which board the runner is actually driving. */
function announceBoardSource(vm, source, exampleId) {
    try {
        if (vm && vm.runtime) vm.runtime.bwBoardSource = source;
        if (typeof window !== 'undefined') {
            window.__bwBoardSource = {source, exampleId: exampleId || null};
            window.dispatchEvent(new CustomEvent('bw-board-source', {detail: window.__bwBoardSource}));
        }
    } catch { /* announcement must never break the boot */ }
}

/** Designer-format circuit file → {parts, nets}. Bench files ship nets;
 *  authored files ship wires — union-find turns endpoints into nets. */
function netlistFromCircuitFile(data) {
    if (!data || !Array.isArray(data.parts)) return null;
    const parts = data.parts
        .filter((p) => p.kind !== 'breadboard')
        .map((p) => ({id: p.id,
            // Only the designer's stc*_mcu alias maps to the engine's 'mcu';
            // board kinds (pi_pico, arduino_nano, ...) are native BoardImpl
            // parts and keep their extra behavior (onboard LEDs).
            kind: /^stc\w*_mcu$/.test(p.kind) ? 'mcu' : p.kind,
            params: p.params || {}, terminals: p.terminals || []}));
    if (Array.isArray(data.nets) && data.nets.length) {
        const withTerms = parts.map((p) => p.terminals.length ? p : {...p,
            terminals: data.nets.flatMap((nn) => nn.terminals)
                .filter((t) => t.part === p.id).map((t) => t.terminal)});
        return {parts: withTerms, nets: data.nets};
    }
    if (!Array.isArray(data.wires) || !data.wires.length) return null;
    const parent = new Map();
    const find = (k) => { let r = k; while (parent.get(r) !== r) r = parent.get(r); return r; };
    const union = (x, y) => {
        if (!parent.has(x)) parent.set(x, x);
        if (!parent.has(y)) parent.set(y, y);
        const rx = find(x), ry = find(y);
        if (rx !== ry) parent.set(rx, ry);
    };
    const K = (pid, t) => `${pid}\u0000${t}`;
    for (const w of data.wires) union(K(w.from, w.fromTerminal), K(w.to, w.toTerminal));
    const groups = new Map();
    for (const k of parent.keys()) {
        const r = find(k);
        if (!groups.has(r)) groups.set(r, []);
        const [part, terminal] = k.split('\u0000');
        groups.get(r).push({part, terminal});
    }
    const nets = [...groups.values()].map((terminals, i) => ({id: `n${i}`, terminals}));
    const termsOf = new Map();
    for (const nn of nets) for (const t of nn.terminals) {
        if (!termsOf.has(t.part)) termsOf.set(t.part, []);
        termsOf.get(t.part).push(t.terminal);
    }
    return {parts: parts.map((p) => p.terminals.length ? p : {...p, terminals: termsOf.get(p.id) || []}), nets};
}
