# WeDo clone: protocol and physical observations — 2026-10-17

This records actual acceptance work and source research. Raw BLE receipts,
paired identifiers, local SDK downloads and machine paths stay in ignored local
context. No audible success, working alternate firmware mode, or new driver fix
is claimed.

## Which protocol applies

LEGO's [WeDo 2 communication SDK download](https://education.lego.com/en-us/product-resources/wedo-2/downloads/developer-kits/)
(version 2.4.0 in the official archive) defines the legacy IO service `4F0E`,
input command characteristic `1563` and output command characteristic `1565`.
The cloned hub exposes these services and characteristics. Full reversed output
power on numeric port 2 lights the user's 88005 on physical A, visibly brighter
than its previous iPad setting; the iPad's previous brightness value is unknown.
The app's light block defaults to 100 and clamps directly to 0–100, without a
motor minimum-power mapping. Use 100%, reversed polarity, logical B for this
observed physical-A mapping before diagnosing a remaining brightness defect.
Do not globally remap genuine hubs or exceed the documented power range.

LEGO's [Wireless Protocol 3 GATT specification](https://lego.github.io/lego-ble-wireless-protocol-docs/#lego-specific-gatt-service)
uses service `00001623-1212-EFDE-1623-785FEABCD123` and characteristic
`00001624-1212-EFDE-1623-785FEABCD123`. It also names WeDo in its system-type
and IO-type tables; that does not make a legacy hub expose its transport.
This clone's complete service/characteristic discovery, repeated after reconnect,
contains neither LWP3 endpoint; a lookup for `1624` also finds none. **Legacy
WeDo works for outputs; LWP3 is unavailable in the observed firmware mode.**
No LWP3 tone was transmitted, because its required endpoint does not exist.
Sending LWP3 bytes to `1565` would not be a valid LWP3 test.

A future dual-protocol implementation must select the transport from real GATT
services, retain each protocol's framing and port discovery, and test a hub that
actually exposes LWP3. An undocumented alternate mode on this unbranded clone is
unknown. No model label or product link is available; no mode-switch sequence
or firmware flashing is justified by these observations.

## Tone command checked against the implementations

In the official SDK archive, `LEIOServiceDefinition.m`, `LEOutputCommand.m`,
`LEBluetoothIO.m`, `LEPiezoTonePlayer.m` and the output-command unit tests agree:
write `connectID, 02, 04, frequency-low, frequency-high, duration-low,
duration-high` to output characteristic `1565`; duration is milliseconds.
Stop is `connectID, 03, 00`. The SDK's documented maximum frequency is 1500 Hz.
Its iOS and Android transports use write without response. No separate piezo
mode/enable operation was found in their initialization or tone-player path.
The SDK was inspected privately for research and was not copied into the app.

OpenRoberta's [iOS actuator dispatch](https://github.com/OpenRoberta/app-ios/blob/6639a2d3d0e47fcfb69b138bb4790b3ab2ff5d3c/Sources/Bluetooth/WeDoDevice.swift)
and [Android actuator dispatch](https://github.com/OpenRoberta/app-android/blob/25deb222a10a322c6979772782c7df4e6c8e2d08/app/src/main/java/de/fhg/iais/roberta/robot/wedo/WeDoCommunicator.java)
forward requested frequency and duration to LEGO's piezo service. The iOS
[encoder](https://github.com/OpenRoberta/app-ios/blob/6639a2d3d0e47fcfb69b138bb4790b3ab2ff5d3c/LEGODevice/LEGODevice/LEOutputCommand.m)
and [BLE writer](https://github.com/OpenRoberta/app-ios/blob/6639a2d3d0e47fcfb69b138bb4790b3ab2ff5d3c/LEGODevice/LEGODevice/LEBluetoothIO.m)
match that framing and write method. Piezo registration has no additional enable
operation; sensor-mode setup elsewhere applies to motion/tilt sensors.

### node-poweredup cross-check

The [node-poweredup piezo implementation](https://github.com/nathankellenicki/node-poweredup/blob/589eebed184d3785872ba177d496f911ba381f56/src/devices/piezobuzzer.ts)
supports the genuine WeDo hub's built-in buzzer. Its `playTone(frequency, time)`
encodes exactly the same legacy command: `05 02 04`, then little-endian frequency
and milliseconds. For example, 440 Hz for one second is `05 02 04 b8 01 e8 03`.
The [characteristic constants](https://github.com/nathankellenicki/node-poweredup/blob/589eebed184d3785872ba177d496f911ba381f56/src/consts.ts)
resolve that write to `1565`, not the LWP3 endpoint. Its
[WeDo connection path](https://github.com/nathankellenicki/node-poweredup/blob/589eebed184d3785872ba177d496f911ba381f56/src/hubs/wedo2smarthub.ts)
discovers services and subscribes to IO announcements; the piezo has no extra
mode initialization. Its constructor uses an empty sensor-mode map.

The [Noble transport](https://github.com/nathankellenicki/node-poweredup/blob/589eebed184d3785872ba177d496f911ba381f56/src/nobleabstraction.ts)
uses writes **with response**, whereas LEGO/OpenRoberta use writes without
response. Both methods have already been tried on this clone with the correct
output characteristic and user-confirmed silence. The library's tone promise
resolves after a timer with feedback disabled; it does not confirm audible output.
The installed npm release 10.1.0 has the same encoder; its published source
revision is `0e29a079129fed9218a241357f01b5e35c9e94d0` (distinct from the
repository revision inspected above).

An isolated installation of npm release 10.1.0 successfully loaded on the Mac.
Its actual `PiezoBuzzer` encoder was invoked with a recording transport and
verified to emit the example bytes and characteristic above; this is an encoder
check, not physical acceptance. A separate real Noble Bluetooth scan reached
`poweredOn` but did not discover the target within its 40-second deadline.
It connected to no hub and played no notes. After the user switched the hub on,
a fresh run **did connect**, discovered piezo type 22 on port 5, and invoked the
library's real `playTone` for 440/1000/440 Hz, 750 ms each, with a three-second
quiet pause after connection and explicit stops/quiet gaps between notes. The
user reported **no sound**. The probe stopped the buzzer and disconnected after
the sequence. This is independent library/transport evidence, not merely the
recording-transport encoder check.

The user subsequently confirmed that the hub itself makes connection beeps and
a connection-confirmation tone. Working sound hardware is therefore established;
remote command handling remains unresolved. The independent-library result makes
an application-specific problem less likely. A genuine-hub comparison is now
more informative than repeating the same bytes. Genuine-hub support in a compatibility
table does not establish that an unbranded clone implements the advertised piezo
IO. A connection chime alone would not count as successful tone playback.

The pinned [Python SDK piezo service](https://github.com/jannopet/LEGO-WeDo-2.0-Python-SDK/blob/00d8e736e04998bca657d2724994f6241a2c9b78/wedo2/services/piezo_tone_player.py)
also converts notes to frequency and sends the same command. Its actual encoder
matches the valid 440/514/1000 Hz packets already tested. Its zero-seeking
`put_unsigned_short` helper corrupts some other frequencies, so it must not be
copied as an alternative encoder. Its service manager unsubscribes from IO
announcements after discovering RGB; reproducing that lifecycle, then optionally
trying the SDK's generic service-state reset on the announced piezo, are bounded
exploratory tests. The first availability scan found no hub; neither experiment
has yet run physically. Neither is a documented piezo-enable requirement.

## Actual clone tests and limits

The hub announces piezo IO type `0x16` on connect ID 5 and reports 100% battery.
The following tests used the correct output characteristic on a live connection:

- 514/1028/514 Hz, 257 ms each, with explicit stops and quiet gaps. Byte-symmetric
  words remove an endianness ambiguity. Every acknowledged write succeeded;
  the user heard no sound.
- After reconnect: 1000 Hz for 1000 ms, with a successful write acknowledgement.
  The user reported no tone while the external lights were on.
- Exact SDK write-without-response method: 440 Hz for 1000 ms, external power
  off, followed by stop. The user again reported silence. There is no ATT write
  acknowledgement for this method; do not label it acknowledged.
- Independent node-poweredup 10.1.0 discovery/initialization and its own tone
  API: 440/1000/440 Hz, 750 ms each. The user again reported no sound.

An initial test in this session mistakenly wrote to input characteristic `1563`.
It was disclosed and corrected; its silence/off-light observations are excluded
from the valid output-test evidence. Earlier long-note and write-without-response
attempts are retained as historical evidence, not a new proposed fix.

The LED success proves that the connection and power-output path work. Neither
an IO advertisement nor an ATT acknowledgement proves a functioning piezo.
The current evidence leaves clone hardware/firmware compatibility unresolved.
Next useful discriminator: compare the same bytes on a genuine WeDo hub or
identify this clone's model and buzzer hardware. Do not silently replace hub
notes with iPad/Mac audio or present software sample playback as hub output.
