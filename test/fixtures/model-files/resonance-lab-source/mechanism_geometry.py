"""Original Resonance Lab: two retained band anchors drive a passive balance.

SPDX-License-Identifier: BSD-3-Clause
Copyright (c) 2026 Christian Ströbele (CrispStrobe)

Every rigid item is a real placed Technic part. Two ordinary 33 mm rubber
bands are declared through the application's standard BELT representation;
their off-axis attachments infer springs rather than a pulley ratio. The
passive wheel masses receive no motor, synthetic inertia, or authored pose.
The development fixture includes the same real mounted SPIKE hub and motor
as the final machine, so controller timing can be qualified before detailing
the final freestanding feet.
"""

import json
import math
from pathlib import Path


I = (1, 0, 0, 0, 1, 0, 0, 0, 1)
RY180 = (-1, 0, 0, 0, 1, 0, 0, 0, -1)
AXLE_Y = (0, 1, 0, 1, 0, 0, 0, 0, -1)
BUSH_Y = (1, 0, 0, 0, 0, 1, 0, -1, 0)
Z_TO_X = (0, 0, 1, 0, 1, 0, -1, 0, 0)
BEAM_NORMAL_X = (0, 1, 0, -1, 0, 0, 0, 0, 1)
POST_NORMAL_X = (0, 1, 0, 0, 0, 1, 1, 0, 0)

BODY_REFERENCES = {'frame': 'frame_reference', 'input': 'input_key',
                   'output': 'output_key'}
BAND_ANCHORS = {
    role: {side: f'{role}_band_{side}' for side in ('neg', 'pos')}
    for role in ('input', 'output')
}
BELTS = [
    {'id': f'spring_{side}', 'band': '85546.dat',
     'around': [BAND_ANCHORS['input'][side], BAND_ANCHORS['output'][side]]}
    for side in ('neg', 'pos')
]

MECHANISM = {
    'kind': 'two-band-forced-passive-torsional-oscillator',
    'units': 'LDU',
    'roles': ['frame', 'input', 'output'],
    'bodyReferenceParts': BODY_REFERENCES,
    'inputAxisLdu': [-140, 0, 0],
    'outputAxisLdu': [0, 0, 0],
    'hingeAxisLdu': [0, 1, 0],
    'anchorRadiusLdu': 20,
    'anchorPlaneYLdu': -60,
    'resetAnchorZLdu': [-20, 20],
    'resetCentreSeparationLdu': 140,
    'bandPart': '85546.dat',
    'bandNominalDiameterMm': 33,
    'nativeAnchorRadiusLdu': 7,
    'drawnBandCentrelineRadiusLdu': 9,
    'drawnBandTubeRadiusLdu': 2,
    'nativeSpringRestDistanceMm': (math.pi * 82.5 - math.pi * 14) * .2,
    'nativeSpringStiffnessNPerM': 100 * 15 / 33,
    'nativeSpringDampingNsPerM': .02,
    'passiveWheelPart': '39367p01.dat',
    'passiveWheelCentresLdu': [[0, -20, -120], [0, -20, 120]],
    'passiveWheelNominalMassGramsEach': 12,
    'prospectiveClearanceEnvelopeDegrees': {'input': [-3, 3], 'output': [-35, 35]},
    'nativeExpectedDynamicBodies': 3,
    'nativeExpectedHinges': 2,
    'nativeExpectedSliders': 0,
    'nativeExpectedCouplings': ['spring', 'spring'],
    'developmentFixedAssemblyCount': 1,
    'notes': [
        'The output is a genuinely passive balanced rotor on two retained round-bore bearings.',
        'The two matched bands act on opposite 8 mm lever arms, so their pretension is balanced at reset.',
        '3713 bushes provide real 7 LDU waists and two 9 LDU flanges. They are keyed to the rockers, not independent pulleys.',
        'Paired retained parallel shafts physically lock each thin anchor bridge to its two rocker layers; native locked-hinges diagnostics are expected and preserved if emitted.',
        'Band stiffness and damping are the unchanged native approximation, not measured properties of a physical rubber band.',
        'The prototype includes the actual mounted SPIKE hub and explicit motor A, so VM/controller timing matches the final machine.',
    ],
}


def shaft_stack(id, part, span, members, exposed=()):
    return {'id': id, 'part': part+'.dat', 'axis': [0, 1, 0],
            'spanYLdu': list(span), 'members': members,
            'intentionalExposedIntervalsYLdu': [list(x) for x in exposed]}


INTERFACES = {
    'bodyReferences': BODY_REFERENCES,
    'bandAnchorParts': BAND_ANCHORS,
    'belts': BELTS,
    'observation': {
        'inputCentre': ['input_key', 'x0'],
        'outputCentre': ['output_key', 'x0'],
        'inputDirection': ['input_beam', 'h3'],
        'outputDirection': ['output_beam', 'h13'],
        'bandAnchors': {role: {side: [pid, 'c'] for side, pid in ids.items()}
                        for role, ids in BAND_ANCHORS.items()},
    },
    'motor': {
        'id': 'motor_A', 'part': '54696p01.dat', 'port': 'A',
        'originLdu': [-140, 140, 0], 'rotation': list(I),
        'actualCrossSocketYLdu': [90, 110], 'shaftId': 'input_axle',
        'housingGroup': 'frame', 'rotorGroup': 'input',
        'mountSockets': ['s0', 's1', 's2', 's3', 's8', 's9'],
        'mountRailIds': ['motor_side_neg', 'motor_side_pos'],
    },
    'hub': {
        'id': 'hub', 'part': '45601.dat', 'originLdu': [-300, 270, 60],
        'mountSockets': ['y28', 'y29', 'y30', 'y31'],
        'mountPinIds': [f'hub_pin_{side}_{end}' for side in ('neg', 'pos')
                        for end in ('front', 'rear')],
        'threeLayerCentresYLdu': [260, 280, 300],
        'pinSpanYLdu': [250, 310], 'pinCollarYLdu': 270,
    },
    'shaftStacks': {
        'input': shaft_stack('input_axle', '3707', (-50, 110), [
            ['input_top_retainer', -30, -20], ['input_anchor_bridge', -20, -10],
            ['input_key', -10, 10], ['input_beam', 10, 30],
            *[[f'input_spacer_{y}', y-10, y+10] for y in (40, 60, 80)],
            ['motor_A/out_actual', 90, 110]], [(-50, -30)]),
        'output': shaft_stack('output_axle', '60485', (-50, 130), [
            ['output_top_retainer', -30, -20], ['output_anchor_bridge', -20, -10],
            ['output_key', -10, 10], ['output_beam', 10, 30],
            ['output_spacer_40', 30, 50], ['output_bearing_top', 50, 70],
            ['output_spacer_80', 70, 90], ['output_bearing_low', 90, 110],
            ['output_bottom_retainer', 110, 130]], [(-50, -30)]),
        **{f'{role}_anchor_{side}': shaft_stack(
            f'{role}_anchor_axle_{side}', '3706', (-80, 40), [
                [f'{role}_band_{side}', -70, -50],
                [f'{role}_anchor_full_spacer_{side}', -50, -30],
                [f'{role}_anchor_upper_spacer_{side}', -30, -20],
                [f'{role}_anchor_bridge', -20, -10],
                [f'{role}_key', -10, 10], [f'{role}_beam', 10, 30],
                [f'{role}_anchor_lower_retainer_{side}', 30, 40]], [(-80, -70)])
           for role in ('input', 'output') for side in ('neg', 'pos')},
        **{f'wheel_{side}': shaft_stack(f'wheel_axle_{side}', '3706', (-50, 70), [
            [f'wheel_upper_retainer_{side}', -50, -30],
            [f'wheel_{side}/actual_hub_support_faces', -30, -10], [f'wheel_spacer_{side}', -10, 10],
            ['output_beam', 10, 30], [f'wheel_key_{side}', 30, 50],
            [f'wheel_lower_retainer_{side}', 50, 70]])
           for side in ('neg', 'pos')},
    },
    'bandRetention': {
        'waistRadiusLdu': 7, 'flangeRadiusLdu': 9,
        'bandPlaneYLdu': -60, 'bandTubeIntervalYLdu': [-62, -58],
        'anchorBoreSpanYLdu': [-70, -50],
        'centralMainAxleRetainerSpanYLdu': [-30, -20],
        'note': 'Bands sit in the waist between the actual 3713 flanges. Both central shaft tips stop at Y=-50, 8 LDU below the complete band tube envelope.',
    },
    'frameExtensions': [
        {'id': 'hub_rail_neg', 'centreLdu': [-360, 280, 60],
         'holeAxis': [0, 1, 0], 'occupiedZLdu': [-40, 160]},
        {'id': 'hub_rail_pos', 'centreLdu': [-240, 280, 60],
         'holeAxis': [0, 1, 0], 'occupiedZLdu': [-40, 160]},
        {'id': 'lower_rail_neg', 'centreLdu': [-100, 320, 60],
         'holeAxis': [0, 1, 0], 'occupiedZLdu': [-40, 0, 160]},
        {'id': 'lower_rail_pos', 'centreLdu': [60, 320, 60],
         'holeAxis': [0, 1, 0], 'occupiedZLdu': [0]},
    ],
}


def build_mechanism(add):
    """Emit via add(id, part, pos, rot=I, color=72, stage=1,
    port=None, group='frame'). No authored output constraints or poses.
    """
    # Connected real frame, including the final controller's mounted hub.
    for end, z in [('front', -40), ('rear', 160)]:
        add(f'motor_base_{end}', '32278', (-220, 300, z), Z_TO_X, 72, 1)
    for side, x in [('neg', -360), ('pos', -240)]:
        add(f'hub_rail_{side}', '32278', (x, 280, 60), I, 72, 1)
        for end, z in [('front', -40), ('rear', 160)]:
            add(f'hub_pin_{side}_{end}', '6558', (x, 280, z), AXLE_Y, 1, 1)
    add('hub', '45601', (-300, 270, 60), I, 15, 1)
    add('frame_reference', '41239', (-60, 300, 0), Z_TO_X, 72, 1)
    for side, x in [('neg', -100), ('pos', 60)]:
        add(f'lower_rail_{side}', '32278', (x, 320, 60), I, 72, 1)
    add('frame_reference_rail_pin', '2780', (-100, 310, 0), AXLE_Y, 0, 1)

    for side, sign in [('neg', -1), ('pos', 1)]:
        x = -140 + sign * 40
        add(f'motor_side_{side}', '32525', (x, 120, 60), BEAM_NORMAL_X, 72, 2)
        for z in (-20, 20, 140):
            add(f'motor_mount_{side}_{z}', '2780', (-140+sign*30, 120, z), I, 0, 2)
        for end, z in [('front', -40), ('rear', 160)]:
            add(f'motor_post_{side}_{end}', '40490', (-140+sign*60, 200, z), POST_NORMAL_X, 72, 2)
            add(f'motor_post_pin_{side}_{end}', '2780', (-140+sign*50, 120, z), I, 0, 2)
            add(f'motor_foot_{side}_{end}', '15100', (x, 280, z), I if sign > 0 else RY180, 71, 2)
            add(f'motor_foot_pin_{side}_{end}', '6558' if sign > 0 else '2780',
                (x, 300 if sign > 0 else 290, z), AXLE_Y, 1 if sign > 0 else 0, 2)
    add('motor_A', '54696p01', (-140, 140, 0), I, 15, 2, 'A')

    # A second, entirely passive shaft rests in two separated round bearings.
    for level, y in [('top', 60), ('low', 100)]:
        add(f'output_bearing_{level}', '32524', (0, y, 0), Z_TO_X, 72, 3)
        for side, sign in [('neg', -1), ('pos', 1)]:
            add(f'output_bearing_angle_{level}_{side}', '15100',
                (sign*60, y+20, 0), I if sign > 0 else RY180, 71, 3)
            add(f'output_bearing_pin_{level}_{side}', '2780', (sign*60, y+10, 0), AXLE_Y, 0, 3)
    for side, sign in [('neg', -1), ('pos', 1)]:
        add(f'output_post_{side}', '32525', (sign*80, 180, 0), POST_NORMAL_X, 72, 3)
        add(f'output_foot_{side}', '15100', (sign*60, 280, 0), I if sign > 0 else RY180, 71, 3)
        add(f'output_foot_pin_{side}', '6558' if sign > 0 else '2780',
            (sign*60, 300 if sign > 0 else 290, 0), AXLE_Y, 1 if sign > 0 else 0, 3)

    # Each rocker stack is locked by a pair of retained shafts 40 LDU apart.
    for role, cx, beam, color in [('input', -140, '32316', 1), ('output', 0, '32278', 25)]:
        add(f'{role}_key', '7229', (cx, 0, 0), I, color, 4, group=role)
        add(f'{role}_beam', beam, (cx, 20, 0), I, color, 4, group=role)
        add(f'{role}_anchor_bridge', '6632', (cx, -15, -20), I, color, 4, group=role)
        for side, z in [('neg', -20), ('pos', 20)]:
            add(f'{role}_anchor_axle_{side}', '3706', (cx, -20, z), AXLE_Y, 0, 4, group=role)
            add(f'{role}_band_{side}', '3713', (cx, -60, z), BUSH_Y, 14, 4, group=role)
            add(f'{role}_anchor_full_spacer_{side}', '3713', (cx, -40, z), BUSH_Y, 71, 4, group=role)
            add(f'{role}_anchor_upper_spacer_{side}', '4265c', (cx, -25, z), BUSH_Y, 71, 4, group=role)
            add(f'{role}_anchor_lower_retainer_{side}', '4265c', (cx, 35, z), BUSH_Y, 71, 4, group=role)
        add(f'{role}_top_retainer', '4265c', (cx, -25, 0), BUSH_Y, 71, 4, group=role)

    add('input_axle', '3707', (-140, 30, 0), AXLE_Y, 0, 4, group='input')
    for y in (40, 60, 80):
        add(f'input_spacer_{y}', '3713', (-140, y, 0), BUSH_Y, 71, 4, group='input')
    add('output_axle', '60485', (0, 40, 0), AXLE_Y, 0, 4, group='output')
    for y in (40, 80):
        add(f'output_spacer_{y}', '3713', (0, y, 0), BUSH_Y, 71, 4, group='output')
    add('output_bottom_retainer', '3713', (0, 120, 0), BUSH_Y, 71, 4, group='output')

    # Source mesh: the cross bore runs from local Z=-10 to +8, whereas
    # the outer hub support faces are Z=-10/+10. The two bushes bear on
    # those actual 20 LDU-spaced faces, not the centered native 18 LDU bore.
    for side, z in [('neg', -120), ('pos', 120)]:
        add(f'wheel_{side}', '39367p01', (0, -20, z), BUSH_Y, 15, 5, group='output')
        add(f'wheel_axle_{side}', '3706', (0, 10, z), AXLE_Y, 0, 5, group='output')
        add(f'wheel_upper_retainer_{side}', '3713', (0, -40, z), BUSH_Y, 71, 5, group='output')
        add(f'wheel_spacer_{side}', '3713', (0, 0, z), BUSH_Y, 71, 5, group='output')
        add(f'wheel_key_{side}', '7229', (0, 40, z), I, 25, 5, group='output')
        add(f'wheel_lower_retainer_{side}', '3713', (0, 60, z), BUSH_Y, 71, 5, group='output')
        for end, dz in [('neg', -20), ('pos', 20)]:
            add(f'wheel_key_pin_{side}_{end}', '2780', (0, 30, z+dz), AXLE_Y, 0, 5, group='output')


def module_placements():
    parts = []

    def add(id, part, pos, rot=I, color=72, stage=1, port=None, group='frame'):
        parts.append({'id': id, 'part': part if part.endswith('.dat') else part+'.dat',
                      'position': list(pos), 'rotation': list(rot), 'color': color,
                      'stage': stage, 'port': port, 'group': group})

    build_mechanism(add)
    assert len(parts) == len({p['id'] for p in parts})
    return parts


def export_development_fixture():
    destination = Path(__file__).resolve().parent/'test/development'
    destination.mkdir(parents=True, exist_ok=True)
    parts = module_placements()
    fixed = [p['id'] for p in parts if p['group'] == 'frame']
    manifest = {
        'name': 'Resonance Lab real-part spring-response fixture',
        'scope': 'Development only: clamp the one connected real frame; both actual rotors remain dynamic, with native hinges and inferred springs.',
        'parts': parts, 'belts': BELTS, 'fixedPartIds': fixed,
        'mechanism': MECHANISM, 'interfaces': INTERFACES, 'INTERFACES': INTERFACES,
    }
    (destination/'module-fixture.json').write_text(json.dumps(manifest, indent=2)+'\n')
    lines = [
        '0 Resonance Lab real-part spring-response fixture',
        '0 Name: module-fixture.ldr', '0 Author: CrispStrobe',
        '0 !LICENSE SPDX-License-Identifier: BSD-3-Clause',
        '0 // Development fixture only; fixed part IDs are explicit in module-fixture.json.',
        *['0 !BW BELT '+b['id']+' '+b['band']+' '+' '.join(b['around']) for b in BELTS],
    ]
    stage = None
    for p in sorted(parts, key=lambda p: p['stage']):
        if stage is not None and p['stage'] != stage:
            lines.append('0 STEP')
        stage = p['stage']
        lines.append('0 !BW ID '+p['id'])
        if p['port']:
            lines.append('0 !BW PORT '+p['port'])
        lines.append('1 '+str(p['color'])+' '+' '.join(f'{x:.12g}' for x in p['position']+p['rotation'])+' '+p['part'])
    (destination/'module-fixture.ldr').write_text('\n'.join(lines)+'\n')
    print(json.dumps({'parts': len(parts), 'bands': len(BELTS),
                      'roleCounts': {g: sum(p['group']==g for p in parts) for g in BODY_REFERENCES},
                      'developmentFixedAssemblyCount': 1,
                      'files': ['test/development/module-fixture.ldr', 'test/development/module-fixture.json']}))


if __name__ == '__main__':
    export_development_fixture()
