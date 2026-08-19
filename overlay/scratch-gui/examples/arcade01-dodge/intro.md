---
level: intermediate
age: 10+
prereqs: [mbit01-display]
teaches: [game-loop, collision, buttons, variables, micro:bit]
---
## What you see
A dodge game on the 5×5 LED matrix. You control a pixel on the bottom row
with buttons A (left) and B (right). Enemies fall from the top. Dodge them
to score points — hit one and the game shows your score and stops.

## Try this
1. Click **Run on Simulator** and use buttons A/B to dodge.
2. Change `0.3 seconds` to `0.2` to make the game faster.
3. Add a second enemy that falls simultaneously.

## What is going on
The game loop clears the display, draws the player and enemy, advances the
enemy downward, checks for collision (same x at row 4), and reads button
inputs. This is the classic game-loop pattern: update state → render → check
input → repeat.
