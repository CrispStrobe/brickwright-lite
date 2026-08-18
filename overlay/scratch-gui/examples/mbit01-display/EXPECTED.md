# mbit01-display — expected behaviour

## Program
Alternates between two 5×5 LED patterns (large heart, small heart) every 500 ms.

## Observable behaviour
- Large heart: rows 01010, 11111, 11111, 01110, 00100
- Small heart: rows 00000, 01010, 01110, 00100, 00000
- Cycle period: 1.0 s (500 ms per frame)

```assert
display_pattern_1: 01010:11111:11111:01110:00100
display_pattern_2: 00000:01010:01110:00100:00000
cycle_ms: 1000 ± 100
```
