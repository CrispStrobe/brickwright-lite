# External blockers

Only dependencies that cannot be resolved by repository work belong here.
Ordinary unfinished engineering remains in [PLAN.md](PLAN.md).

| Blocker | Affected gate | Safe work that can continue | Unblock evidence |
|---|---|---|---|
| No physical SPIKE hub attached | Real-hardware transport and firmware verification | Simulator, protocol, fixture, and fault-path work | Named hub/firmware/host matrix run with captured verdicts |
| Official LEGO, Pybricks, or TI image absent locally | Corresponding unchanged-image Renode scenario | Public synthetic images and local-image loader tests | Local hash manifest selects a lawfully obtained image |
| TI CC2564C service pack redistribution is not permitted by this repository | Real controller initialization with TI patch | Synthetic HCI controller and local private-input path | User supplies the service pack under TI terms; no artifact leaves the runner |
| Apple signing or store credentials unavailable | Signed iOS/macOS distribution | Unsigned builds and platform-neutral tests | Credentialed protected workflow succeeds |
| Android hardware unavailable | Physical Android Bluetooth/USB verdict | Emulator and desktop broker tests | Named device/API-level run succeeds |

## Rules

- A blocker may skip only its named gate and must emit a visible reason.
- A local secret or firmware input must not be copied into fixtures, caches, logs,
  screenshots, or CI artifacts.
- Three repeated encounters with the same external condition justify pausing
  that gate, not unrelated work.
- Remove a row when its prerequisite becomes routinely available; record the
  resulting durable capability in [HISTORY.md](HISTORY.md).
