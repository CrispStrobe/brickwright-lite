import React from 'react';
import {useSelector} from 'react-redux';
import snapshotSpikePorts, {isSpikeExtensionLoaded, spikeText} from '../../lib/spike-port-snapshot.js';

const EMPTY = {mode: 'offline', connected: false, ports: []};

const SpikePortMonitor = ({vm}) => {
    const locale = useSelector(state => state.locales.locale);
    const [snapshot, setSnapshot] = React.useState(EMPTY);
    const [expanded, setExpanded] = React.useState(false);
    const [loaded, setLoaded] = React.useState(() => isSpikeExtensionLoaded(vm));
    React.useEffect(() => {
        const virtual = window.__brickwrightVirtualSpike?.hubState;
        let previous = '';
        const refresh = () => {
            const nextLoaded = isSpikeExtensionLoaded(vm);
            setLoaded(previousLoaded => previousLoaded === nextLoaded ? previousLoaded : nextLoaded);
            if (!nextLoaded) return;
            const next = snapshotSpikePorts(vm?.runtime, virtual, locale);
            const serialized = JSON.stringify(next);
            if (serialized !== previous) {
                previous = serialized;
                setSnapshot(next);
            }
        };
        refresh();
        const interval = window.setInterval(refresh, 500);
        const unsubscribe = virtual?.subscribe?.(refresh);
        return () => { window.clearInterval(interval); unsubscribe?.(); };
    }, [vm, locale]);
    React.useEffect(() => {
        if (snapshot.mode !== 'offline') setExpanded(true);
    }, [snapshot.mode]);

    if (!loaded) return null;

    const virtual = snapshot.mode === 'virtual';
    const status = spikeText(locale, snapshot.mode === 'live' ? 'liveHub' :
        virtual ? (snapshot.connected ? 'virtualConnected' : 'virtualReady') : 'noHub');
    return (
        <section data-testid="bw-spike-port-monitor"
            style={{background: '#f5f3ff', borderBottom: '1px solid #ddd6fe', flexShrink: 0}}>
            <div style={{display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px'}}>
                <button type="button" onClick={() => setExpanded(value => !value)}
                    aria-expanded={expanded}
                    style={{background: 'none', border: 0, color: '#4c1d95', fontWeight: 700,
                        cursor: 'pointer', padding: 0, fontSize: 12}}>
                    {expanded ? '▾' : '▸'} {spikeText(locale, 'ports')}
                </button>
                <span style={{fontSize: 11, color: '#6b7280'}}>{status}</span>
                <span style={{flex: 1}} />
                <button type="button"
                    onClick={() => window.dispatchEvent(new Event('bw-open-virtual-spike'))}
                    style={{fontSize: 11, padding: '3px 7px', background: '#fff', color: '#5b21b6',
                        border: '1px solid #c4b5fd', borderRadius: 5, cursor: 'pointer'}}>
                    {spikeText(locale, 'configure')}
                </button>
            </div>
            {expanded && (
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))',
                    gap: 5, padding: '0 12px 9px', maxHeight: 170, overflowY: 'auto'}}>
                    {snapshot.ports.map(device => (
                        <div key={device.port} data-testid={`bw-spike-port-${device.port}`}
                            style={{background: '#fff', border: '1px solid #ddd6fe', borderRadius: 6,
                                padding: '5px 6px', minWidth: 0}}>
                            <div style={{fontWeight: 700, fontSize: 11, color: '#5b21b6'}}>
                                {device.port} · {device.label}
                            </div>
                            {device.detail && <div style={{fontSize: 10, color: '#475569',
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}
                                title={device.detail}>{device.detail}</div>}
                            {device.pixels && <div aria-label={spikeText(locale, 'matrixPixels')}
                                style={{display: 'grid', gridTemplateColumns: 'repeat(3,6px)', gap: 2, marginTop: 3}}>
                                {Array.from({length: 9}, (_, index) => (
                                    <span key={index} style={{width: 6, height: 6, borderRadius: 2,
                                        background: device.pixels[index] ? '#8b5cf6' : '#d1d5db'}} />
                                ))}
                            </div>}
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
};

export default SpikePortMonitor;
