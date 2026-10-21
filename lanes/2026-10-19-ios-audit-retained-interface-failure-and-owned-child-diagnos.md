## iOS audit: retained interface failure and owned-child diagnostic — 2026-10-19

The first interface-only event failed on its initial `simctl help`: no stream bytes
were observed before command refusal, its direct child was still pending at cleanup,
and the owned group was signaled and the leader reaped with signal exit. Earlier
Xcode/tool-location/launchctl-help queries completed; the selected Xcode was 26.6.
Original log/artifact/report and the independent partial-reader refusal are retained.
The cause is unknown. No simulator ownership or complete interface result passed.

Prepare an explicitly opt-in diagnostic within the same audit workflow envelope:
retain command phase, PID and monotonic boundaries; after two seconds sample only
that still-unreaped owned help child. The sample requests one second at ten-ms
intervals, has its own bounded output and a deadline inside the original ten-second
help deadline. It targets no shared service and adds no warm-up, retry, download,
simulator operation, or timeout expansion. Sampling can perturb the target; it is
not a performance measurement or resource/ownership admission. Diagnostic-only
requests exclude app builds even when the interface flag is missing, and then
refuse admission. A separately frozen source-bound event is required; keep the
first event failed and all app/main/release holds.
