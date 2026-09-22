// Machine Manager — the library surface (design §4.6, §8 step 3).
//
// A modal over the shared machine store: browse the saved machines, run one,
// duplicate/delete, and import/export. Opened from the code-tab device
// dropdown's "Manage machines…" entry (it dispatches `bw-open-machine-manager`;
// gui.jsx renders this). It is a picker + config surface — it adds NO pane: a
// machine's screen/keyboard are its Widgets (§4.2/§4.5), reached by Run.
//
// Defensive by construction (every store call is async and may reject; the
// browser store can be a memory fallback) so a storage hiccup never blanks the
// app. Inline styles, matching the rest of tw-pseudocode.

import React from 'react';
import {
    fromMediaManifest, fromDosboxConf
} from '../../lib/bw-machines/importers.js';
import {
    newMachineConfig, validateMachineConfig
} from '../../lib/bw-machines/machine-config.js';

const T = {
    en: {
        title: 'Machines', empty: 'No machines yet — import one below.',
        run: 'Run', dup: 'Duplicate', del: 'Delete', close: 'Close',
        importL: 'Import a brickwright-media.json, a DOSBox .conf, or a machine config:',
        importB: 'Import', exportB: 'Export all', paste: 'Paste JSON or .conf here…',
        imported: 'Imported.', exported: 'Exported below — copy it.', removed: 'Deleted.',
        duped: 'Duplicated.', badImport: 'Could not import: '
    }
};
const tr = (locale, k) => (T[(locale || 'en').slice(0, 2)] || T.en)[k] || T.en[k] || k;

const modeBadge = m => (m === 'wired' ? '🔌 wired' : m === 'auto' ? '◐ auto' : '⚙ functional');

export default function MachineManager({store, onRun, onClose, locale}) {
    const [machines, setMachines] = React.useState([]);
    const [status, setStatus] = React.useState('');
    const [text, setText] = React.useState('');
    const t = k => tr(locale, k);

    const refresh = React.useCallback(async () => {
        try { setMachines(await store.list()); }
        catch (e) { setStatus(`${e.message}`); }
    }, [store]);

    React.useEffect(() => { refresh(); }, [refresh]);

    const run = cfg => { try { if (onRun) onRun(cfg); } finally { if (onClose) onClose(); } };
    const dup = async id => { try { await store.duplicate(id); setStatus(t('duped')); await refresh(); } catch (e) { setStatus(e.message); } };
    const del = async id => { try { await store.remove(id); setStatus(t('removed')); await refresh(); } catch (e) { setStatus(e.message); } };

    const doImport = async () => {
        const src = text.trim();
        if (!src) return;
        try {
            let cfg;
            if (/\[(dosbox|cpu|autoexec)\]/i.test(src)) {
                cfg = fromDosboxConf(src);
            } else {
                const obj = JSON.parse(src);
                // A media-lab manifest (has slots+machine, no executionMode) vs a
                // machine config (already normalized-ish).
                cfg = (obj && obj.slots && obj.machine && !obj.executionMode)
                    ? fromMediaManifest(obj) : newMachineConfig(obj);
            }
            const v = validateMachineConfig(cfg);
            if (!v.ok) { setStatus(t('badImport') + v.errors.join('; ')); return; }
            await store.put(cfg);
            setText(''); setStatus(t('imported')); await refresh();
        } catch (e) { setStatus(t('badImport') + e.message); }
    };

    const doExport = async () => {
        try { setText(JSON.stringify(await store.export(), null, 2)); setStatus(t('exported')); }
        catch (e) { setStatus(e.message); }
    };

    const stop = e => e.stopPropagation();
    const btn = {padding: '4px 10px', borderRadius: 6, border: '1px solid #cbd5e1',
        background: '#fff', cursor: 'pointer', fontSize: 12};
    const primary = {...btn, background: 'linear-gradient(135deg,#4c97ff,#4280d7)', color: '#fff', border: 'none'};

    return (
        <div onClick={onClose} data-testid="bw-machine-manager"
            style={{position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
                display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
            <div onClick={stop} style={{background: '#fff', borderRadius: 10, width: 'min(680px, 92vw)',
                maxHeight: '86vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
                boxShadow: '0 12px 40px rgba(0,0,0,0.3)'}}>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', borderBottom: '1px solid #e2e8f0'}}>
                    <strong style={{fontSize: 15}}>{t('title')}</strong>
                    <button onClick={onClose} style={btn} data-testid="bw-mm-close">{t('close')}</button>
                </div>

                <div style={{overflowY: 'auto', padding: '8px 16px', flex: 1}}>
                    {machines.length === 0 ? (
                        <div style={{color: '#64748b', padding: '18px 4px'}}>{t('empty')}</div>
                    ) : machines.map(m => (
                        <div key={m.id} data-testid="bw-mm-row"
                            style={{display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                                borderBottom: '1px solid #f1f5f9'}}>
                            <div style={{flex: 1, minWidth: 0}}>
                                <div style={{fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap',
                                    overflow: 'hidden', textOverflow: 'ellipsis'}}>{m.title || '(untitled)'}</div>
                                <div style={{fontSize: 11, color: '#64748b'}}>
                                    {m.machine || '?'} · {modeBadge(m.executionMode)}
                                    {m.cpu && m.cpu.variant ? ` · ${m.cpu.variant}` : ''}
                                </div>
                            </div>
                            <button onClick={() => run(m)} style={primary} data-testid="bw-mm-run">{t('run')}</button>
                            <button onClick={() => dup(m.id)} style={btn}>{t('dup')}</button>
                            <button onClick={() => del(m.id)} style={{...btn, color: '#b91c1c'}}>{t('del')}</button>
                        </div>
                    ))}
                </div>

                <div style={{borderTop: '1px solid #e2e8f0', padding: '10px 16px'}}>
                    <label style={{fontSize: 12, color: '#475569'}}>{t('importL')}</label>
                    <textarea value={text} onChange={e => setText(e.target.value)}
                        placeholder={t('paste')} data-testid="bw-mm-import-text"
                        style={{width: '100%', height: 72, marginTop: 6, fontFamily: 'monospace',
                            fontSize: 11, borderRadius: 6, border: '1px solid #cbd5e1', padding: 6,
                            boxSizing: 'border-box', resize: 'vertical'}} />
                    <div style={{display: 'flex', gap: 8, alignItems: 'center', marginTop: 6}}>
                        <button onClick={doImport} style={primary} data-testid="bw-mm-import">{t('importB')}</button>
                        <button onClick={doExport} style={btn}>{t('exportB')}</button>
                        <span style={{fontSize: 12, color: '#64748b'}} data-testid="bw-mm-status">{status}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
