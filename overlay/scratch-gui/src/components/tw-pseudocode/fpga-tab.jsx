import React from 'react';
import TANG_NANO_20K from 'bw-circuit-ui/parts-data/tang_nano_20k.json';
import {parseCst} from '../../lib/bw-fpga/cst.js';
import {bridge} from '../../lib/bw-fpga/port-bridge.js';

/**
 * The FPGA / HDL surface — TN2 and TN2b of docs/TANG-NANO.md.
 *
 * SHIPPED HIDDEN. Reached only when a build sets BW_ENABLE_FPGA=1; gui.jsx gates
 * both the <Tab> and this <TabPanel> on a webpack-substituted literal, so an off
 * build does not carry this file, the bridge, or the board JSON. Turning it on
 * by default is a separate, later decision that MAY NEVER BE TAKEN.
 *
 * WHY ITS OWN SURFACE. The Code tab's premise is blocks <-> pseudocode <->
 * Python/JS as representations of ONE program. Verilog is not a representation
 * of a Scratch script, and putting it there would imply a conversion that will
 * never exist.
 *
 * WHAT THIS DOES: answers "can these ports reach the board, and where" by
 * reading Gowin constraints against the real Tang Nano 20K part. That question
 * is answerable today, needs no toolchain, and is the piece that makes an FPGA
 * design meet the breadboard at all.
 *
 * WHAT IT DOES NOT DO, and must not imply: synthesis (TN3), gate-level
 * simulation (digitaljs), flashing (TN4), or any SoC (TN5a/TN5b).
 *
 * The plan, the phases and the decisions behind them: docs/TANG-NANO.md.
 */

const EXAMPLE = `// Gowin constraints. Pin numbers are the ones silkscreened
// on the board and used by a real .cst.
IO_LOC  "led" 73;
IO_PORT "led" IO_TYPE=LVCMOS33 DRIVE=8;

IO_LOC  "btn" 74;

// Pin 15 is also onboard LED0 — usable, but it moves the board's own LED too.
IO_LOC  "shared" 15;

// Pin 33 is an HDMI pair. Real silicon, not on a header.
IO_LOC  "video" 33;
`;

const Row = ({tone, children}) => (
    <li style={{
        margin: '0.25rem 0', padding: '0.4rem 0.6rem', borderRadius: 4,
        borderLeft: `3px solid ${tone}`, background: 'rgba(127,127,127,0.08)'
    }}>{children}</li>
);

const FpgaTab = () => {
    const [text, setText] = React.useState(EXAMPLE);
    const {bindings, refusals, warnings} = React.useMemo(() => {
        const {constraints, problems} = parseCst(text);
        const out = bridge({constraints, part: TANG_NANO_20K});
        return {...out, refusals: [...problems, ...out.refusals]};
    }, [text]);

    return (
        <div style={{padding: '1.25rem', maxWidth: '52rem', lineHeight: 1.5, overflowY: 'auto'}}>
            <h2 style={{marginTop: 0}}>{'FPGA — Tang Nano 20K'}</h2>
            <p style={{marginTop: 0}}>
                {'Which of a design’s pins can actually reach the breadboard. This reads '}
                {'Gowin constraints against the real board part. It does not synthesise, '}
                {'simulate or flash anything — none of that is built yet.'}
            </p>

            <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                spellCheck={false}
                style={{width: '100%', minHeight: '11rem', fontFamily: 'monospace',
                    fontSize: '0.85rem', padding: '0.6rem'}}
            />

            <h3>{`Reaches the board (${bindings.length})`}</h3>
            <ul style={{listStyle: 'none', padding: 0, margin: 0}}>
                {bindings.map(b => (
                    <Row key={`${b.port}-${b.pin}`} tone="#3a8a3a">
                        <code>{b.port}</code>{' → pin '}<code>{b.pin}</code>
                        {' → terminal '}<code>{b.terminal}</code>
                        {b.sharedWith ? <em style={{opacity: 0.8}}>{' (shares onboard hardware)'}</em> : null}
                    </Row>
                ))}
                {bindings.length ? null : <li style={{opacity: 0.7}}>{'Nothing placed yet.'}</li>}
            </ul>

            {warnings.length ? (
                <>
                    <h3>{`Usable, with a caveat (${warnings.length})`}</h3>
                    <ul style={{listStyle: 'none', padding: 0, margin: 0}}>
                        {warnings.map((w, i) => (
                            <Row key={i} tone="#b8860b"><strong>{w.port}</strong>{`: ${w.reason}`}</Row>
                        ))}
                    </ul>
                </>
            ) : null}

            {refusals.length ? (
                <>
                    <h3>{`Cannot reach the board (${refusals.length})`}</h3>
                    <ul style={{listStyle: 'none', padding: 0, margin: 0}}>
                        {refusals.map((r, i) => (
                            <Row key={i} tone="#b34747">
                                <strong>{r.port || `line ${r.lineNumber}`}</strong>{`: ${r.reason}`}
                            </Row>
                        ))}
                    </ul>
                </>
            ) : null}

            <p style={{opacity: 0.7, marginTop: '1.5rem'}}>
                {'Planned next: driving these terminals from the circuit engine, then hosted '}
                {'synthesis, then flashing from the native app.'}
            </p>
        </div>
    );
};

export default FpgaTab;
