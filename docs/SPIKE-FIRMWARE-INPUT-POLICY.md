# SPIKE firmware input policy

The browser virtual hub is an Apache-2.0 protocol model. Profile names describe
wire compatibility; selecting one never downloads or executes third-party
firmware.

Brickwright may bundle a firmware image only after its complete distributable
closure passes the repository's permissive-license gate. LEGO, Pybricks,
spike-nx, and TI binaries must not be bundled, fetched by public CI, proxied,
uploaded, or cached by Brickwright.

A future desktop/developer Renode workflow may accept an explicit local file.
It must verify a local hash manifest, keep the bytes outside projects and
telemetry, show the selected board/profile and third-party-license warning,
and delete temporary copies. Supplying a file does not grant rights that its
license withholds; hardware-bound images must not be presented as generally
authorized for simulation.

Remote URLs are disabled. A user-entered URL would still make Brickwright copy
the bytes and adds provenance, credential-leak, and request-forgery risks. Any
future exception requires a separately reviewed direct-download design with no
Brickwright proxy or persistent cache.
