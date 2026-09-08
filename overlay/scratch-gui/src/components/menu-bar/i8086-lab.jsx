import React, {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {getI8086MemoryMode, setI8086MemoryMode} from '../../lib/bw-i8086-preferences.js';
import styles from './i8086-lab.css';

export default function I8086Lab () {
    const dialog = useRef(null);
    const active = useRef(null);
    const [open, setOpen] = useState(false);
    const [memoryMode, setMemoryMode] = useState(getI8086MemoryMode);
    const [workload, setWorkload] = useState('registers');
    const [status, setStatus] = useState('');
    const [storageNote, setStorageNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const close = () => { active.current?.abort(); active.current = null; setBusy(false); setOpen(false); };
    useEffect(() => {
        const show = () => { setMemoryMode(getI8086MemoryMode()); setOpen(true); };
        window.addEventListener('bw-open-i8086-lab', show);
        return () => { window.removeEventListener('bw-open-i8086-lab', show); active.current?.abort(); };
    }, []);
    useEffect(() => {
        if (open && !dialog.current.open) dialog.current.showModal();
        if (!open && dialog.current.open) dialog.current.close();
    }, [open]);
    const run = async () => {
        const controller = new AbortController();
        active.current = controller; setBusy(true); setResult(null); setStatus('Loading isolated benchmark…');
        try {
            const {compareSandbox} = await import(/* webpackChunkName: "bw-i8086-lab" */ '../../lib/bw-i8086-lab/benchmark.js');
            if (controller.signal.aborted) return;
            const report = await compareSandbox({workload, signal: controller.signal,
                onProgress: message => { if (active.current === controller) setStatus(message); }});
            if (active.current === controller) { setResult(report); setStatus('Complete — all measured states match JavaScript.'); }
        } catch (error) {
            if (active.current === controller) setStatus(`No accepted result: ${error.message}`);
        } finally {
            if (active.current === controller) { active.current = null; setBusy(false); }
        }
    };
    return createPortal(<dialog ref={dialog} className={styles.dialog} aria-labelledby="i8086-lab-title"
        data-testid="i8086-lab" onMouseUp={event => event.stopPropagation()}
        onCancel={event => { event.preventDefault(); close(); }}>
        <h2 id="i8086-lab-title">8086 execution diagnostics</h2>
        <button className={styles.close} onClick={close} aria-label="Close 8086 diagnostics">Close</button>
        <label className={styles.row}>Project RAM word access
            <select data-testid="i8086-memory-mode" value={memoryMode} onChange={event => {
                const value = event.target.value;
                const persisted = setI8086MemoryMode(value);
                setMemoryMode(value);
                setStorageNote(persisted ? 'Preference saved.' : 'Storage unavailable; applied for this tab only.');
            }}>
                <option value="optimized">Optimized (default)</option>
                <option value="reference">Reference byte access (diagnostic)</option>
            </select>
        </label>
        <p>Applies to newly created 8086/80186 targets. Rebuild or reattach the target to apply.
            Existing targets are unchanged. Reference mode disables only the RAM word shortcut;
            REP optimizations and correctness fixes remain enabled.</p>
        <p role="status">{storageNote}</p>
        <h3>Experimental benchmark sandbox</h3>
        <p>Bundled programs only, with separate CPU and RAM. This does not run or modify your project.
            Decoded blocks and Wasm are not supported project backends: no devices, interrupts or debugger integration.
            Timer batching is not offered because it changes observable counter state.</p>
        <label className={styles.row}>Bundled workload
            <select data-testid="i8086-lab-workload" value={workload} disabled={busy}
                onChange={event => { setWorkload(event.target.value); setResult(null); setStatus(''); }}>
                <option value="registers">Register-only counted loop (Wasm best case)</option>
                <option value="mixed">Mixed arithmetic and RAM</option>
                <option value="strings">REP word copies</option>
            </select>
        </label>
        <button data-testid="i8086-lab-run" disabled={busy} onClick={run}>Compare JS / decoded / Wasm</button>
        {busy && <button data-testid="i8086-lab-cancel" onClick={() => active.current?.abort()}>Cancel benchmark</button>}
        <p role="status" data-testid="i8086-lab-status">{status}</p>
        {result && <div data-testid="i8086-lab-results">
            <p>{result.scope} Three samples after warmup. Smaller time is better;
                overlapping ranges are inconclusive. A synthetic-loop gain is not a general emulator speedup.</p>
            {result.unavailable.length > 0 && <p>Unavailable: {result.unavailable.join(', ')}</p>}
            <table><thead><tr><th>Backend</th><th>Median / range ms</th><th>RT</th><th>vs JS</th><th>Warmup ms</th><th>State</th></tr></thead>
                <tbody>{result.rows.map(row => <tr key={row.mode}>
                    <td>{row.mode}</td><td>{row.medianMs.toFixed(2)} / {row.minMs.toFixed(2)}–{row.maxMs.toFixed(2)}</td>
                    <td>{row.realTimeRatio.toFixed(1)}×</td><td>{row.speedup.toFixed(2)}×</td>
                    <td>{row.warmupMs.toFixed(2)}</td><td>{row.correctness}</td>
                </tr>)}</tbody></table>
            <details><summary>Compilation and fallback counts (per sample)</summary>
                <pre>{JSON.stringify(result.rows.map(row => ({mode: row.mode,
                    samples: row.samples.map(sample => sample.stats)})), null, 2)}</pre>
            </details>
        </div>}
    </dialog>, document.body);
}
