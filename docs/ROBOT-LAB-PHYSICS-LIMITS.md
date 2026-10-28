# Robot Lab physics limits for measurement lessons

The current material coefficients are simulation estimates. [Validation](ROBOT-LAB-VALIDATION.md) records ABS and tyre restitution and tyre/tread rolling coefficients, and the analytic controls they passed. The pair restitution table is active, but impacts below 1 m/s do not bounce. Flat impacts across multiple contact points can leave solver spin, so a second landing can lean. Neither effect is a measurement of a physical brick.

Wheel normal load is the rolling model's estimate from configured wheel mass, vertical velocity change and hinge impulses. It is not an aggregate contact force. The model applies rolling resistance to a hinged tyre or tread sprocket; it does not model hard-plastic wheels rolling on a rim. The tracked-frame coasting control in [Validation](ROBOT-LAB-VALIDATION.md) records that floored sprocket mass and inertia can make the frame coast 4.4 times longer than its configured parts would. Model mass and weight readings use configured mass; solver mass floors are separate.

The shipped differential-steering circle passes its analytic geometry control, but this does not establish imported vehicle steering, tyre slip or hardware fidelity. [Real model limits](ROBOT-LAB-REAL-MODELS.md) record simplified colliders and steering linkages, an unmodelled CV planetary reduction, a locked differential that is exact only when driving straight, and remaining unstable imported models. Those limits need model-specific tests and, for physical accuracy, physical measurements before coefficient or solver changes.

The live panel reports signed hinge motor torque, local limit torque and mechanical motor power from the last completed solver step. Passive friction while the motor is off is kept separate. It does not report total contact force, electrical power or energy. Acceleration is a sampled velocity difference; multiplying it by configured mass would omit constraints and solver mass adjustments. Rope tension is a rope constraint impulse per step; pneumatic pressure is the connected network's gauge pressure. Neither is a general contact-force sensor.

The assembly inspector makes configured and effective solver masses explicit.
Its local COM inertia tensor includes the solver's numerical and reflected rotor
terms; separate flags identify the initial small-body fallback repair and later
additions. Those values explain numerical behavior and are not catalogue or
hardware mass measurements.

The rolling-load estimator now uses effective inertial mass for vertical
acceleration and the actual gravity factor for weight. The prior configured-mass
expression was inconsistent for accelerating bodies whose solver mass was
floored. This correction retains all mass/inertia floors and rolling coefficients;
it does not compensate away the documented 4.4× steady-coasting approximation.
The imported locked differential, Cardan-style CV proxy and unknown planetary
reduction remain model-specific limits, not newly calibrated steering behavior.
