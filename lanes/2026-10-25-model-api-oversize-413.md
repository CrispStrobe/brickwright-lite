# Model API: bounded 413 for over-limit chunked bodies — 2026-10-25

**Status: DONE (implementation commit; claim merged in PR #1365 before it).** Owner: Claude Code model-API cutover
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

## Result

- `readBody()` now reads with event listeners instead of the async iterator,
  whose `return()` also destroyed the request. An over-limit chunk or the 10 s
  deadline pauses the stream and rejects with the unchanged 413/408 `ApiError`;
  the handler passes its response, and the request is destroyed only after that
  response finishes or closes, with `Connection: close`. Without a response
  object the request is still destroyed at once. Limits, deadline, refusal codes
  and authentication-before-body order are unchanged.
- Focused tests in `test/model-api-resource.test.mjs`: a real loopback HTTP
  request through the production handler with the hosted probe's shape (16 x
  64 KiB chunks + 1 byte, no `Content-Length`) failed before the fix with
  `ECONNRESET` and no response, and now receives the JSON 413; plus deferred-end
  controls for 413 and 408 with and without a response. The existing stalled
  control keeps its 408 and immediate-destroy assertions with an event-emitter
  request.
- Hosted A/B on Vercel previews with fixture-only configuration and
  `NODEJS_HELPERS=0`: the previous source answered the chunked over-limit body
  with HTTP 500 `FUNCTION_INVOCATION_FAILED` (twice), this source with HTTP 413
  `too-large` JSON (twice); malformed JSON stayed 400 on both.
- Stalled body: the handler answers 408 after 10 s over loopback HTTP. On Vercel
  a stalled upload is held by the host and never reaches the function; after
  about 72 s the host itself returned a platform 500. That is host buffering, not
  a server deadline defect, so the probe's 20 s client deadline is recorded as
  inconclusive rather than changed.
- Reports now include `runtime.engineAsset` (`lib/engine-identity.mjs`): the
  installed `jolt-physics` version, lockfile resolved URL/integrity, whether the
  installed version matches the lockfile, and the SHA-256 of the entry module
  jolt-core selects (SIMD or baseline), or `available: false`. Unit-tested with a
  fixture install; the native Docker control asserts it on the real install.
  This makes the engine generation checkable from a report: main currently pins
  `jolt-physics 1.1.0-bw.6`.
