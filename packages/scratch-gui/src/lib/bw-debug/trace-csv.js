/**
 * Trace → CSV. The debugger's execution trace is a time series (every row
 * carries machine time, registers, SFRs and the captured user variables),
 * and a time series belongs in tools built for time series — spreadsheets,
 * pandas, gnuplot. One function, no UI: the drawer's export button and any
 * future headless use serialize through the same code.
 *
 * Column policy, deliberate: `t_ms` is decimal milliseconds (plotting
 * software's native axis), machine words are hex with the 0x prefix
 * (register values are bit patterns, not quantities — 0x80 in PSW is a
 * flag, not "128"), user VARIABLES are decimal (they are the program's
 * own quantities), and variable columns are the UNION across all rows —
 * a variable that appears mid-run gets empty cells before its first
 * capture rather than silently vanishing from the export.
 *
 * @module
 */

const hex = (v, w) => (v === undefined || v === null) ? ''
    : `0x${Number(v).toString(16).toUpperCase().padStart(w, '0')}`;

const quote = (s) => {
    const str = String(s ?? '');
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

/**
 * @param {Array<object>} rows createTrace()'s rows
 * @returns {string} CSV text, header first, newest row last
 */
export function traceToCsv(rows) {
    const sfrNames = [];
    const varNames = [];
    for (const row of rows) {
        for (const name of Object.keys(row.sfr || {})) {
            if (!sfrNames.includes(name)) sfrNames.push(name);
        }
        for (const name of Object.keys(row.variables || {})) {
            if (!varNames.includes(name)) varNames.push(name);
        }
    }
    const header = ['seq', 't_ms', 'why', 'pc', 'bytes', 'asm',
        'a', 'b', 'dptr', 'sp', 'psw', 'bank',
        ...Array.from({ length: 8 }, (_, i) => `r${i}`),
        ...sfrNames,
        ...varNames.map((n) => `var_${n}`)];
    const lines = [header.map(quote).join(',')];
    for (const row of rows) {
        const asm = typeof row.text === 'object' && row.text ? row.text.text : row.text;
        const cells = [
            row.seq,
            row.tNs === undefined ? '' : (Number(row.tNs) / 1e6).toFixed(6),
            row.why ?? '',
            hex(row.pc, 4),
            (row.bytes || []).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' '),
            asm ?? '',
            hex(row.a, 2), hex(row.b, 2), hex(row.dptr, 4),
            hex(row.sp, 2), hex(row.psw, 2),
            row.bank ?? '',
            ...Array.from({ length: 8 }, (_, i) => hex(row.r ? row.r[i] : undefined, 2)),
            ...sfrNames.map((n) => hex(row.sfr ? row.sfr[n] : undefined, 2)),
            ...varNames.map((n) => (row.variables && n in row.variables) ? row.variables[n] : ''),
        ];
        lines.push(cells.map(quote).join(','));
    }
    return `${lines.join('\n')}\n`;
}

/** Trigger a browser download of the CSV. Kept beside the serializer so
 *  the drawer stays one line; harmless to import headlessly (unused). */
export function downloadTraceCsv(rows, filename = 'bw-trace.csv') {
    const blob = new Blob([traceToCsv(rows)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export default traceToCsv;
