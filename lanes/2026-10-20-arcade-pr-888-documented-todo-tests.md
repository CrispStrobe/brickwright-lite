## Arcade PR #888 documented TODO tests — 2026-10-20

CLAIMED and done in one PR — Claude, at the owner's request. Turns the tests
listed in docs/ARCADE-888-OPEN-FAILURES.md back into passing tests by fixing
product code, removing each `todo` option only once its test passes and
recording "fixed in <sha>" in the doc row. A case that would be unsound to
accept keeps its TODO, and its row records the concrete counter-example. No
assertion is weakened; refusal suites stay red on wrong input. Paths: the Arcade
VM overlay and GUI MakeCode libraries the failing tests reach, the listed test
files (todo options only) and docs/ARCADE-888-OPEN-FAILURES.md.
