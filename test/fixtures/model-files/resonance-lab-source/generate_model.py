#!/usr/bin/env python3
"""Generate Resonance Lab from its qualified real-part spring module.

SPDX-License-Identifier: BSD-3-Clause
Copyright (c) 2026 Christian Ströbele (CrispStrobe)

The 106 original module placements and both native band records remain
unchanged. Exactly 36 ordinary base parts make the complete model stand on
four coplanar rails. External standard part meshes are referenced only.
"""
import csv
import hashlib
import json
from collections import Counter
from pathlib import Path

from mechanism_geometry import (
    AXLE_Y, I, POST_NORMAL_X, RY180,
    BELTS, INTERFACES, MECHANISM, build_mechanism, module_placements,
)


ROOT = Path(__file__).resolve().parent
STAGES = [
    'Four coplanar floor rails, retained supports, connected base and mounted SPIKE hub',
    'Six-socket motor cradle and four retained support posts',
    'Two separated passive bearings and their connected support cage',
    'Blue driven rocker, orange passive rotor, retained shafts and grooved band anchors',
    'Balanced wheel masses, two matched 33 mm bands, cable and saved-pose alignment',
]
parts = []


def add(id, part, pos, rot=I, color=72, stage=1, port=None, group='frame'):
    assert id not in {p['id'] for p in parts}, id
    det = (rot[0]*(rot[4]*rot[8]-rot[5]*rot[7])
           - rot[1]*(rot[3]*rot[8]-rot[5]*rot[6])
           + rot[2]*(rot[3]*rot[7]-rot[4]*rot[6]))
    assert abs(det-1) < 1e-9, (id, det)
    assert all(abs(sum(rot[3*k+i]*rot[3*k+j] for k in range(3))-(i == j)) < 1e-9
               for i in range(3) for j in range(3)), id
    assert 1 <= stage <= len(STAGES)
    parts.append(dict(id=id, part=part if part.endswith('.dat') else part+'.dat',
        position=list(pos), rotation=list(rot), color=color, stage=stage,
        port=port, group=group))


def freestanding_base():
    # All four floor rails have the same underside Y=370. Their upper
    # connections belong to the already connected qualified module frame.
    for label, x in [('hub_outer', -360), ('hub_inner', -240),
                     ('mechanism_left', -100), ('mechanism_right', 60)]:
        add('floor_'+label, '32278', (x, 360, 60))

    # Four short two-ended posts lift the lower hub rails from the floor.
    # Each molded angle pin occupies its own end hole in the real 3L post.
    for side, x, sign in [('neg', -360, -1), ('pos', -240, 1)]:
        outward = I if sign > 0 else RY180
        for end, z in [('front', 0), ('rear', 120)]:
            stem = f'hub_floor_{side}_{end}'
            add(stem+'_top_angle', '15100', (x, 300, z), outward, 71)
            add(stem+'_top_pin', '2780', (x, 290, z), AXLE_Y, 0)
            add(stem+'_post', '32523', (x+sign*20, 320, z), POST_NORMAL_X)
            add(stem+'_foot', '15100', (x, 340, z), outward, 71)
            add(stem+'_foot_pin', '2780', (x, 350, z), AXLE_Y, 0)

    # Each pair of 3L pins passes through the original lower rail, an actual
    # 3L spacer beam, and its floor rail. The spacer's center hole is empty;
    # in particular no new pin duplicates the occupied lower-rail Z=0 hole.
    for side, x in [('neg', -100), ('pos', 60)]:
        for end, z in [('front', 0), ('rear', 120)]:
            stem = f'mechanism_floor_{side}_{end}'
            add(stem+'_spacer', '32523', (x, 340, z))
            for hole, dz in [('neg', -20), ('pos', 20)]:
                add(stem+'_pin_'+hole, '6558', (x, 340, z+dz), AXLE_Y, 1)


def main():
    parts.clear()
    freestanding_base()
    frame_ids = [p['id'] for p in parts]
    assert len(frame_ids) == 36
    build_mechanism(add)
    module = module_placements()
    by_id = {p['id']: p for p in parts}
    assert len(module) == 106 and len(parts) == 142
    assert all(by_id[p['id']] == p for p in module), 'Qualified placements must remain exact.'
    assert len(BELTS) == 2 and all(b['band'] == '85546.dat' for b in BELTS)

    lines = [
        '0 Resonance Lab — forced response of a passive weighted rotor',
        '0 Name: resonance-lab.ldr', '0 Author: CrispStrobe',
        '0 !LDRAW_ORG Unofficial_Model',
        '0 !LICENSE Redistributable under the BSD-3-Clause license; see ../licenses/resonance-lab.txt.',
        '0 // Original native arrangement: one fixed motor on hub port A, one passive balance.',
        '0 // Two grooved off-axis bush anchors per rocker carry matched 33 mm bands.',
        '0 // The blue input rocks through small finite angles; the orange rotor is entirely passive.',
        '0 // Reload the saved model before each slow, near, or fast frequency experiment.',
        '0 // Native springs approximate rubber elasticity; no physical band calibration is claimed.',
        '0 // External standard part meshes are referenced, not embedded.',
        *['0 !BW BELT '+b['id']+' '+b['band']+' '+' '.join(b['around']) for b in BELTS],
    ]
    for stage, title in enumerate(STAGES, 1):
        if stage > 1:
            lines.append('0 STEP')
        lines.append(f'0 Assembly stage {stage}: {title}')
        for p in parts:
            if p['stage'] != stage:
                continue
            lines.append('0 !BW ID '+p['id'])
            if p['port']:
                lines.append('0 !BW PORT '+p['port'])
            lines.append('1 '+' '.join(format(v, '.12g') for v in
                [p['color'], *p['position'], *p['rotation']])+' '+p['part'])
    text = '\n'.join(lines)+'\n'
    (ROOT/'models').mkdir(parents=True, exist_ok=True)
    (ROOT/'models/resonance-lab.ldr').write_text(text)
    (ROOT/'models/resonance-lab.mpd').write_text('0 FILE resonance-lab.ldr\n'+text+'0 NOFILE\n')

    frame_interfaces = dict(
        floorRailIds=['floor_'+s for s in ('hub_outer', 'hub_inner', 'mechanism_left', 'mechanism_right')],
        floorRailCentresLdu=[[x, 360, 60] for x in (-360, -240, -100, 60)],
        floorRailPart='32278.dat', floorUndersideYLdu=370,
        floorHoleZRangeLdu=[-80, 200], floorRailHoleAxis=[0, 1, 0],
        supportPurpose='Four coplanar floor rails support the complete connected frame, including the hub, without fixing any body in the final simulation.',
        hubSupportPosts=[dict(id=f'hub_floor_{side}_{end}_post', part='32523.dat',
            centreLdu=[x+sign*20, 320, z], endHoleCentresYLdu=[300, 340],
            topAngleId=f'hub_floor_{side}_{end}_top_angle', footId=f'hub_floor_{side}_{end}_foot',
            topPinId=f'hub_floor_{side}_{end}_top_pin', footPinId=f'hub_floor_{side}_{end}_foot_pin')
            for side, x, sign in [('neg', -360, -1), ('pos', -240, 1)]
            for end, z in [('front', 0), ('rear', 120)]],
        mechanismSpacers=[dict(id=f'mechanism_floor_{side}_{end}_spacer', part='32523.dat',
            centreLdu=[x, 340, z], occupiedHoleZLdu=[z-20, z+20],
            threeLayerCentresYLdu=[320, 340, 360], sharedPinSpanYLdu=[310, 370],
            collarYLdu=330, pinIds=[f'mechanism_floor_{side}_{end}_pin_{hole}' for hole in ('neg', 'pos')])
            for side, x in [('neg', -100), ('pos', 60)]
            for end, z in [('front', 0), ('rear', 120)]],
        hub=INTERFACES['hub'],
        cable='The fixed motor cable is integral to the motor. Connect port A on the fixed hub; route it along the frame below both rocker layers and away from the band and wheel sweep. The cable is not a separately simulated rigid part.')
    geometry = dict(name='Resonance Lab', units='LDU', lduToMm=.4,
        parts=parts, belts=BELTS,
        constructionSteps=[dict(number=i+1, title=t) for i, t in enumerate(STAGES)],
        mechanism=MECHANISM, interfaces=INTERFACES, frameInterfaces=frame_interfaces,
        qualifiedModuleParts=len(module), qualifiedModuleBelts=len(BELTS),
        completeFrameChangesFromModule=[], completeFrameAddedPartIds=frame_ids,
        models={'resonance-lab': dict(sha256=hashlib.sha256(text.encode()).hexdigest(),
            parts=len(parts), bands=len(BELTS), physicalItems=len(parts)+len(BELTS), motors=1, hubs=1)})
    (ROOT/'geometry.json').write_text(json.dumps(geometry, indent=2, ensure_ascii=False)+'\n')
    quantities = Counter((p['part'], p['color']) for p in parts)
    quantities.update((b['band'], 15) for b in BELTS)
    with (ROOT/'parts.csv').open('w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['part', 'ldraw_colour', 'quantity'])
        for (part, color), n in sorted(quantities.items()):
            writer.writerow([part, color, n])
    print(f'Wrote {len(parts)} native rigid placements + {len(BELTS)} real bands; '
          f'{len(module)} qualified module placements unchanged; {len(frame_ids)} base additions.')


if __name__ == '__main__':
    main()
