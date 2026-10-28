# Rover basics 7 in SPIKE App 3 Python: drive until the colour sensor sees black.
from hub import port
import runloop
import motor_pair
import color_sensor
import color

async def main():
    motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)
    motor_pair.move(motor_pair.PAIR_1, 0, velocity=330)
    await runloop.until(lambda: color_sensor.color(port.C) is color.BLACK)
    motor_pair.stop(motor_pair.PAIR_1)

runloop.run(main())
