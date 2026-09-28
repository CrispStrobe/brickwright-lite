# Rover basics 1 in SPIKE App 3 Python: drive 60 cm.
# A 5.6 cm wheel travels 17.6 cm per turn, so 60 cm is 1227 wheel degrees.
from hub import port
import runloop
import motor_pair

async def main():
    motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)
    await motor_pair.move_for_degrees(motor_pair.PAIR_1, 1227, 0, velocity=500)

runloop.run(main())
