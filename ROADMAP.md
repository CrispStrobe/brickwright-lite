# Brickwright roadmap

This is the dependency order for unfinished work. Task-level contracts and
gates are in [PLAN.md](PLAN.md).

| Order | Outcome | Depends on | Exit condition |
|---:|---|---|---|
| 1 | Renode snapshots drive the virtual SPIKE dashboard | stable snapshot schema | One motor-and-sensor scenario works for each locally available firmware family |
| 2 | Bluetooth controller simulation covers Classic and BLE | deterministic HCI service | RFCOMM and GATT sessions pass success, timeout, disconnect, and malformed-input tests |
| 3 | Brick devices reach interactive fidelity | shared brick clock and state | ports, display, IMU, buttons, battery/power, audio, and storage are observable and fault-injectable |
| 4 | SPIKE Essential joins the matrix | distinct Essential board definition | Official and Pybricks local images reach asserted boot and peripheral milestones |
| 5 | LEGO block/code coverage expands by hub | generated opcode censuses | Every supported opcode is mapped or explicitly classified |
| 6 | Native capability isolation closes | reviewed broker caller identity | Desktop/mobile permission and teardown scenarios pass |
| 7 | Arduino and RP2040 debugger fidelity improves | per-target capability declarations | Required peripherals, symbols, and source stepping pass target-specific gates |
| 8 | Circuit/project integrity closes | authoritative serialized model | Rendering, solving, save/load, autosave, and recovery agree |
| 9 | Lessons and releases reflect measured support | stable runtime contracts | Curriculum and platform claims pass browser and packaging gates |

## Scheduling rules

- Work the earliest unblocked row unless a maintainer explicitly reprioritizes.
- Split independent repository work into separate worktrees and branches.
- Integrate producer changes upstream first, then update the pin and generated
  mirror in this repository.
- A simulator result never satisfies a physical-hardware gate.
- A skipped private-image test is visible and cannot satisfy an exit condition.
- Update this table only when dependencies or priorities change; completed
  evidence belongs in [HISTORY.md](HISTORY.md).
