// A failed differential writes its useful case results to stdout. Preserve them
// before rethrowing the original subprocess error; successful output is unchanged.
export function runWithFailureOutput(run, write) {
    try { return run(); }
    catch (error) {
        if (typeof error?.stdout === 'string' && error.stdout.length) {
            try { write(error.stdout); } catch { /* Preserve the original child failure. */ }
        }
        throw error;
    }
}
