## iOS audit: installed manuals without simulator startup — 2026-10-19

The same optional-audit workflow now has a separate default-off manual-only
selection: Xcode version, launchctl help for print/procinfo/managerpid, and the
installed sample manual through a fixed noninteractive pager. It executes no
simctl command and no sampler. Interface selection is still required; mixing
manual and sampler modes refuses before commands. Any audit-only selection
excludes normal app builds, including malformed mixed requests. Existing command,
output, time and cleanup bounds remain unchanged. Authored controls verify the
exact five-command graph and negative selection cases. A new source-bound actual
manual observation and independent packet joins are required before relying on
the installed text; manuals alone admit no app, service, runtime or resource scope.
