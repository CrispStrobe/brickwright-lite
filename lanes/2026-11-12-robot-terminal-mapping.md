# Robot browser terminal scalar boundary correction

Owner: Robot CI mapping reviewer. Scope: only the three
BW_BROWSER_RUNNER_TERMINALS_V1 scalar mappings in .github/workflows/build.yml.
Base candidate: fcd7e4e3fdf4244876577550e41da4ebb605b47a.

Move the two existing terminal rows displaced by the new browser gates so the
unchanged runner admits all source IDs in the original 100-row segments. Keep
all source gates, IDs, terminal expressions, order, caps, assertions, concurrency
and dependency pins unchanged. Validate exact flattened row equality, original
source refusal, repaired scalar boundaries and nonvacuous boundary mutations.

Source candidate stays local until the existing CI batch is reviewed. No CI
rerun, dispatch, label, build, guest or source push is part of this correction.
