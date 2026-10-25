## STM32 faithful model pin adoption (sb3-creator + bw-board) — 2026-10-15

CLAIM — Claude, branch chore/stm32-faithful-pins-20261015, [local path omitted].
Adopt sb3-creator a13f92b8bc4b06f0cb9ffec22bab71f06db7ac76 (merge of its PR #155:
clock setup, G030 GPIO, F103 pull-up/TIM2 PWM/DS18B20, G030 ADC and temperature,
tone fixes, named refusals for servo/NeoPixel/LCD/OLED/broadcast, timer) and
bw-board 04f19952cea008b7498c701c16be5cc7ea1bdf63 (merge of its PR #600: faithful
STM32 F0/G0 model — G0 memory map, RCC clock tree so speed follows firmware, RAM
pattern at reset, USART/PWM need AF; STM32 adapters refuse a `clockHz` option).
Sequenced AFTER bw-circuit-ui adoption PR #965, whose pin is kept exactly.

Envelope: this ledger; vendor-pins.json; root and packages/scratch-gui package
specifications/locks; outputs of the repo's writers and their tracked packages
twins; exact-pin and count assertions in existing tests the bump moves;
removal of any `clockHz` Lite passes to the STM32 debug targets/adapters
(debug-runner and its tracked twin) and tests or gates that depended on the
old fixed clock or zeroed RAM; gallery/example/reach expectations regenerated
by the repo's measurement scripts where the new refusals move them. Merge this
claim first; implementation lands only after full CI and owner review.
