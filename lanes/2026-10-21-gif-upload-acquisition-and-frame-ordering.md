## GIF upload acquisition and frame ordering — SOURCE candidate

Within the merged initial-import envelope, own file-uploader and its overlay
mirror plus focused controls. Acquire the existing GIF decoder only after GIF
selection; preserve its complete decoder body and direct synchronous frame-zero
contract. Upload callbacks become asynchronous with acquisition. Per-upload
frame collection waits for all PNG conversions and preserves decoder order.
Initial decoder/acquisition errors retain their identities through the existing
upload error callback; new uploads may retry acquisition. No new dependency,
workflow, parser, supplier, budget, GIF pixel algorithm or multi-file batch change.
Native Canvas, browser interaction and emitted bundle qualification remain pending.

The acquisition change is at costumeUpload, not the direct decoder API. Its
returned value stays undefined; callers continue to use existing callbacks.
Acquisition and initial decode throws are now delivered to the owning upload's
error callback. A later decoder timer throw keeps its existing asynchronous
channel. Completion waits for every actual frame conversion and flattens results
in decoder index order, rather than using completion of the last-numbered frame
as a proxy for all frames. Multi-file modal completion and cancellation semantics
are unchanged. Controls use the real GIF reader/decoder with a declared Canvas
unit model; they do not establish native Canvas, browser or emitted bundle savings.

Each decoded frame settles at most once. Late frame callbacks after success are
ignored; the exact exception thrown by the final costume callback still reaches
the existing PNG error chain. A throwing error handler is not swallowed by the
acquisition catch. The focused factory returns its acquisition promise for
observation; public costumeUpload still returns undefined and remains callback
based. This promise does not represent completion of later decoder timers.

