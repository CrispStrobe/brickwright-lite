# Bound public corpus failure diagnostics

Status: CLAIMED. Owner: corpus delivery maintainer.

The corpus differential failure helper captures a child's stdout for public CI
logs; the child can print exception text containing absolute paths. Own only the
new `scripts/lib/corpus-child-output.mjs` helper and its focused test in the
current Arcade integration. On failure, report bounded, recognized case IDs and
verdicts rather than arbitrary child text; preserve and rethrow the exact original
error. Successful output and all corpus selections, assertions, thresholds,
workflow inputs and compilation behavior remain unchanged. Controls must cover
real child failure, success, malformed/unknown lines, private-path or secret-like
text, and diagnostic-write failures. This is not a fix or rerun of the retained
nightly differential failure.
