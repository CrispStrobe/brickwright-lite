# ESP LEGO SPIKE simulator assessment

Reviewed 2026-10-01 at commit `dc83b895ff2aac5cf2fe576d0ba98426fea60827`.

[rundhall/ESP-LEGO-SPIKE-Simulator](https://github.com/rundhall/ESP-LEGO-SPIKE-Simulator)
provides legacy `from spike import PrimeHub, Motor, MotorPair` style Python APIs
for an ESP32/MicroPython environment. Its package imports `machine`, uses pin/PWM
peripherals, and supplies examples organized by API operation. This differs from
SPIKE App 3's `hub`, `motor`, `motor_pair` and `runloop` API supported by our importer.

Useful follow-up: compare the documented legacy API surface with our existing
Classic transport command coverage; write original synthetic tests for missing
methods. It does not supply a browser arena or evidence of physical motor
accuracy. Its README explicitly documents incomplete behavior and substantial
peripheral differences. It should not replace our deterministic motor model.

The [repository licence](https://github.com/rundhall/ESP-LEGO-SPIKE-Simulator/blob/dc83b895ff2aac5cf2fe576d0ba98426fea60827/LICENSE)
is MIT, Copyright (c) 2021 rundhall. No code or dependency was incorporated.
Any future reuse must retain attribution and verify notices for individual
peripheral driver files rather than assuming the top-level licence covers all
third-party drivers. This assessment was performed by the coordinator after
independent controller authorship; none of this source was sent to implementers.
