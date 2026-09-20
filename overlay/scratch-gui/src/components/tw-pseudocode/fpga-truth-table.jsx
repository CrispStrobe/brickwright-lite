import React from 'react';
import {synthesizeTruthTable} from '../../lib/bw-fpga/synthesize.js';

/**
 * Combinational analysis (CircuitVerse-style): describe what a circuit should DO
 * as a truth table, and generate the gate circuit that does it. Name the inputs
 * and outputs, click the output cells to set each row, and "Generate" builds a
 * sum-of-products model (via the tested pure synthesiser) onto the canvas.
 */
const clean = s => s.split(',').map(x => x.trim().replace(/[^A-Za-z0-9_]/g, '')).filter(Boolean);
const MAX_INPUTS = 6; // 64 rows — beyond that a table is the wrong tool

export function TruthTableModal ({onGenerate, onClose}) {
    const [inStr, setInStr] = React.useState('a, b');
    const [outStr, setOutStr] = React.useState('y');
    const [bits, setBits] = React.useState({}); // `${row}:${out}` -> 0|1
    const inputs = clean(inStr);
    const outputs = clean(outStr);
    const n = inputs.length;
    const rowCount = (n >= 1 && n <= MAX_INPUTS) ? (1 << n) : 0;
    const rowBit = (ri, i) => (ri >> (n - 1 - i)) & 1; // MSB-first display
    const cell = (ri, o) => (bits[`${ri}:${o}`] ? 1 : 0);
    const toggle = (ri, o) => setBits(b => ({...b, [`${ri}:${o}`]: b[`${ri}:${o}`] ? 0 : 1}));

    const generate = () => {
        const rows = [];
        for (let ri = 0; ri < rowCount; ri++) {
            const row = {};
            inputs.forEach((nm, i) => { row[nm] = rowBit(ri, i); });
            outputs.forEach(o => { row[o] = cell(ri, o); });
            rows.push(row);
        }
        onGenerate(synthesizeTruthTable({inputs, outputs, rows}));
    };

    return (
        <div data-testid="bw-fpga-tt-modal" style={{position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}
            onMouseDown={onClose}>
            <div onMouseDown={e => e.stopPropagation()} style={{background: '#fff', borderRadius: 8, padding: 16,
                width: 'min(560px, 92vw)', maxHeight: '86vh', overflow: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.3)'}}>
                <div style={{fontWeight: 'bold', marginBottom: 4}}>{'Truth table → circuit'}</div>
                <div style={{fontSize: 12, color: '#64748b', marginBottom: 8}}>
                    {'Name the inputs and outputs, click the output cells to set each row, then Generate.'}
                </div>
                <div style={{display: 'flex', gap: 10, marginBottom: 8, fontSize: 12}}>
                    <label>{'inputs '}<input value={inStr} onChange={e => setInStr(e.target.value)}
                        data-testid="bw-fpga-tt-inputs" style={{width: 120, fontFamily: 'monospace'}} /></label>
                    <label>{'outputs '}<input value={outStr} onChange={e => setOutStr(e.target.value)}
                        data-testid="bw-fpga-tt-outputs" style={{width: 100, fontFamily: 'monospace'}} /></label>
                </div>
                {rowCount ? (
                    <table style={{borderCollapse: 'collapse', fontFamily: 'monospace', fontSize: 12, width: '100%'}}>
                        <thead>
                            <tr>
                                {inputs.map(nm => <th key={nm} style={{padding: '2px 6px', color: '#0284c7', borderBottom: '1px solid #cbd5e1'}}>{nm}</th>)}
                                <th style={{width: 8}} />
                                {outputs.map(o => <th key={o} style={{padding: '2px 6px', color: '#ca8a04', borderBottom: '1px solid #cbd5e1'}}>{o}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {Array.from({length: rowCount}, (_, ri) => (
                                <tr key={ri}>
                                    {inputs.map((nm, i) => <td key={nm} style={{textAlign: 'center', color: '#475569', padding: '1px 6px'}}>{rowBit(ri, i)}</td>)}
                                    <td />
                                    {outputs.map(o => (
                                        <td key={o} style={{textAlign: 'center', padding: '1px 4px'}}>
                                            <button type="button" onClick={() => toggle(ri, o)}
                                                data-testid={`bw-fpga-tt-cell-${ri}-${o}`}
                                                style={{width: 26, cursor: 'pointer', fontWeight: 'bold',
                                                    color: cell(ri, o) ? '#16a34a' : '#94a3b8',
                                                    background: cell(ri, o) ? '#f0fdf4' : '#f8fafc',
                                                    border: '1px solid #cbd5e1', borderRadius: 3}}>{cell(ri, o)}</button>
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div style={{color: '#b91c1c', fontSize: 12}}>{`Enter 1–${MAX_INPUTS} inputs and at least one output.`}</div>
                )}
                <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12}}>
                    <button type="button" onClick={onClose} style={{cursor: 'pointer'}}>{'Cancel'}</button>
                    <button type="button" onClick={generate} disabled={!rowCount || !outputs.length}
                        data-testid="bw-fpga-tt-generate"
                        style={{cursor: rowCount ? 'pointer' : 'default', fontWeight: 'bold',
                            border: '1px solid #16a34a', borderRadius: 6, background: '#f0fdf4', color: '#166534', padding: '4px 12px'}}
                    >{'⚙ Generate circuit'}</button>
                </div>
            </div>
        </div>
    );
}

export default TruthTableModal;
