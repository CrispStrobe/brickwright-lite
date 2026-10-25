# Rover basics 9 in SPIKE App 3 Python: stop 10 cm (100 mm) from the cliff.
from hub import port
import runloop
import motor_pair
import distance_sensor

async def main():
    motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)
    motor_pair.move(motor_pair.PAIR_1, 0, velocity=330)
    await runloop.until(lambda: distance_sensor.distance(port.D) < 100)
    motor_pair.stop(motor_pair.PAIR_1)

runloop.run(main())
