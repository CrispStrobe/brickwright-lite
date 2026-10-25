# Model API: bounded 413 for over-limit chunked bodies — 2026-10-25

**Status: claim only; no implementation yet.** Owner: Claude Code model-API cutover
session, owner-requested API fix. Branch `lane/model-api-oversize-413-20261025`,
base `8cfa25812efcac2369ac9269acdadc138bf43cfa`. Both earlier model-API claims
([measurement API](2026-10-23-model-measurement-api.md),
[resource takeover](2026-10-23-model-api-resource-takeover.md)) are DONE; this is a
new, narrow follow-up and does not reopen them.

## Observed defect

A hosted transport probe against the deployed service (worker
`6fd9e0bf446efa1a38c81a68fa639ba6a3aac9fd`, `NODEJS_HELPERS=0`) sent an
authenticated `Transfer-Encoding: chunked` body of 1 MiB + 1 byte to
`POST /api/v1/runs`. The host answered HTTP 500 `text/plain`
`FUNCTION_INVOCATION_FAILED` (reproduced twice) instead of the documented 413
`too-large` JSON refusal. A declared `Content-Length` over the limit is correctly
refused with 413, so the failure lies on the streamed-body path: `readBody()`
destroys the request (directly and through the async iterator's `return()`)
before the error response is written. No job or admission reservation was created.
The stalled-prefix probe saw no response within its 20 s client deadline; it is
reviewed below, not assumed to be a server defect.

## Owned paths

- `tools/model-api/lib/http.mjs` and `tools/model-api/api/handler.mjs`: stop
  reading an over-limit or expired body without destroying the request before the
  413/408 JSON response is written; end the request after the response. Keep the
  1 MiB body limit, 10 s body deadline, authentication-before-body order and every
  existing refusal code unchanged.
- `tools/model-api/native-runner.mjs`: report the actual installed physics engine
  asset identity (package name/version, lockfile resolved URL and integrity) in
  `runtime`, if it stays small; otherwise record it as open.
- `tools/model-api/README.md`, `tools/model-api/openapi.json`: only the matching
  documentation of the above.
- Focused tests in existing `test/model-api-*.test.mjs` files: a chunked
  over-limit request that fails before the fix and returns 413 after it, plus the
  stalled-body and engine-identity controls.

No change to the worker workflow, admission ledger protocol, limits, judges,
physics, compiler, measurement readers or any other owner's paths. No deployment
is implied by this claim; a redeploy and new hosted probes follow separately.
