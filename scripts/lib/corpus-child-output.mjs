// Report public corpus identities and verdicts without forwarding arbitrary child
// exception text, which may contain local paths or credentials. Preserve the
// failure status for the test runner and leave successful output untouched.
export function runWithFailureOutput(run, write) {
    try { return run(); }
    catch (error) {
        if (typeof error?.stdout === 'string' && error.stdout.length) {
            const rows = [];
            for (const line of error.stdout.split(/\r?\n/)) {
                const match = line.match(/^([a-z0-9][a-z0-9._-]{0,99} -> (?:nano|pico)): (AGREE|DIFF|SKEW|ERROR|SKIP)\b/);
                if (match) rows.push(`${match[1]}: ${match[2]}`);
                if (rows.length === 64) break;
            }
            const summary = rows.length ? rows.join('\n') + '\n' : 'Corpus child failed without a recognized case verdict.\n';
            try { write(summary); } catch { /* Still report the child failure. */ }
        }
        const status = Number.isInteger(error?.status) ? `exit ${error.status}` : 'without an exit status';
        throw new Error(`Corpus child failed (${status}); see sanitized verdicts above.`);
    }
}
