# mbit03-pins — expected behaviour

## Program
Blinks LED on P0 (active-low) and beeps at 440 Hz, 0.5 s on / 0.5 s off.

```assert
pin0_write: digital
buzzer_freq_hz: 440
cycle_ms: 1000 ± 100
```
