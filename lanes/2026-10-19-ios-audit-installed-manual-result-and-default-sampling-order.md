## iOS audit: installed manual result and default sampling order — 2026-10-19

The manual-only event39229551289 passed on Xcode26.6/17F113. Exact original metadata,
log and report were retained once; independent packet joins passed with manualComplete
true and simulator-interface/app/root-cause claims false. The installed sample manual
confirms that mayDie requests symbol information immediately, before sampling.
The next diagnostic candidate omits that optional prefetch and uses documented
default ordering. It preserves one-second/ten-ms sampling, the nested three-second
budget and original ten-second help deadline. This is a different diagnostic
configuration, not proof of the earlier cause or a waiver of either failed event.
The auxiliary-isolation fix and final requested-diagnostic failure gate remain.
