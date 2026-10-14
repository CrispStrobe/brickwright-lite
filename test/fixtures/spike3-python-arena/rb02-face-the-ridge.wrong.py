# WRONG: reads the yaw with the app's sign, so the turn never ends.
# tilt_angles() is in decidegrees, and turning clockwise makes yaw NEGATIVE.
from hub import port, motion_sensor
import runloop
import motor_pair

def yaw():
    return motion_sensor.tilt_angles()[0]

async def main():
    motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)
    motion_sensor.reset_yaw(0)
    motor_pair.move(motor_pair.PAIR_1, 100, velocity=166)
    await runloop.until(lambda: yaw() > 860)
    motor_pair.stop(motor_pair.PAIR_1)

runloop.run(main())
