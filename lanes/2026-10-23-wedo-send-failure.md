# WeDo asynchronous send-failure follow-on to transport UI #1274

ACTIVE — Codex transport/buttons owner. Own only the asynchronous send outcome
boundary in CrispStrobe/extensions `extensions/CrispStrobe/lego_wedo2_universal.js`
and its focused producer controls. Real VM teardown exposes an unhandled rejected
write after the virtual connection closes. Observe and report failed sends while
returning the original rejecting promise to awaiters. Preserve command bytes,
limiter decisions, dispatch order, stop actions and connection refusal. Do not
suppress global rejections or invent acknowledgements.

Supplier implementation and qualification are owner-authorized in the supplier
fork, which has no lane-claim prerequisite. Qualify normal sends, awaited error identity,
fire-and-forget motor-stop reporting, throttled sends and actual VM/Jolt WeDo
BLE and Scratch Link guests with meaningful mutations. Preserve original failed
CI and local reproduction. Land the supplier only after all enabled exact-head
checks succeed, then, after this Lite claim merges, adopt only `wedo2unified` through Lite's canonical scoped
pin, generated wrapper and receipt. Other pins and global baseline stay fixed.

Owner commands authorize this work in the user's fork; no inherited reviewer
quota applies. No upstream contact, native changes, model ownership takeover or
acceptance-bound changes. The transport UI claim, measurement seam and all
other owners remain intact. Final Lite browser and exact-head qualification
remain required before #1274 can merge.
