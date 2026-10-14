// A missing blob is an ABSENCE, not a finding — shared so the classifier can be
// tested without importing a suite (which would run it).
/**
 * AN ABSENCE, NOT A FINDING — the same distinction scripts/audit-job-steps.mjs
 * draws, for the same reason.
 *
 * CI checks out a PARTIAL (blobless) clone. `--is-shallow-repository` says
 * false for one, because the commits are all there; what is missing is blobs,
 * which git fetches lazily from the promisor remote the moment something reads
 * file CONTENT — which `log -p` does. When that fetch fails, this suite throws
 * while being CONSTRUCTED, so the TAP summary does not count it and the build
 * job's own guard has to notice the discrepancy ("a suite probably threw while
 * being CONSTRUCTED").
 *
 * Seen for real on 2026-09-23:
 *   fatal: unable to access '…': server certificate verification failed
 *   fatal: could not fetch 98f9b86e… from promisor remote
 *
 * A raw git error there reads like this repository's pins are broken. They are
 * not: nothing about the pins was examined. So say which it is.
 *
 * @returns {string|null} an explanation when the failure is a missing blob, else null
 */
export const explainGitFailure = message => {
    const text = String(message || '');
    if (!/promisor remote|unable to access|could not fetch|fatal: failed to (?:fetch|run)/i.test(text)) return null;
    return 'this repository is a PARTIAL (blobless) clone and git could not fetch the blobs '
        + 'this check reads from the promisor remote, so NOTHING ABOUT THE PINS WAS EXAMINED — '
        + 'this is an absence, not a finding. Re-run once (the fetch is usually transient), or '
        + 'work in a full clone: `git fetch --refetch origin`. Original error: '
        + text.split('\n').filter(Boolean).slice(0, 2).join(' | ');
};

