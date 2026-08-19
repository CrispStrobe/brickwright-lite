---
level: intermediate
age: 10+
prereqs: [arcade01-dodge]
teaches: [game-loop, physics, paddle, bounce, micro:bit]
---
## What you see
A single-player pong game on the 5×5 matrix. A ball bounces around the
screen. Your paddle is a 3-pixel bar on the right column — move it with
buttons A (up) and B (down) to keep the ball in play.

## Try this
1. Click **Run on Simulator** and use buttons A/B to move the paddle.
2. Change `0.2 seconds` to speed up the ball.
3. Make the paddle smaller (1 pixel) for a harder game.

## What is going on
The ball has position (bx, by) and velocity (dx, dy). Each tick it moves
by (dx, dy). When it hits the top, bottom, or left wall, the velocity
component reverses (bounce). When it reaches column 3, it checks if the
paddle covers that row — hit = bounce + score, miss = game over.
