# mbit05-combined — expected behaviour

## Program
Temperature alarm: >25°C → LED on, buzzer 880 Hz, diamond pattern.

```assert
sensor: temperature
threshold: 25
buzzer_hz_hot: 880
pin0_hot: digital 0
pin0_cold: digital 1
```
