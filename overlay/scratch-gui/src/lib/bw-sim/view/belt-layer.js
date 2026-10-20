// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Rubber bands drawn (editor/belt-path.js lays their path; LDraw has no stretched band): a
// closed tube, the band's cross-section, through the path's points. The build view draws the
// model's bands where they are; Simulate (createSimBelts) lays each band anew every frame round
// its parts where the bodies carrying them are now, so a spring band stretches and slackens.

import {CatmullRomCurve3, Group, Matrix4, Mesh, MeshStandardMaterial, TubeGeometry, Vector3} from 'three';
import {LDU_M, lduToWorld} from '../contracts.js';
import {BAND_RADIUS_LDU, BANDS, bandPath, placedCircle} from '../editor/belt-path.js';

/** The bands' colours: LEGO's black 15 mm, red 26 mm and white 33 mm bands. */
const BAND_HEX = Object.freeze({'85543.dat': 0x1b2a34, '85545.dat': 0xc91a09, '85546.dat': 0xf4f4f4});
const worldToLdu = v => [v.x / LDU_M, -v.y / LDU_M, -v.z / LDU_M];

/** A group of band meshes: draw([{id, band, points (LDU)}]) replaces them; dispose() frees them. */
export const createBeltLayer = () => {
    const group = new Group();
    group.name = 'rubber-bands';
    const materials = new Map();
    const materialFor = band => {
        if (!materials.has(band)) materials.set(band, new MeshStandardMaterial({color: BAND_HEX[band] ?? 0x1b2a34, roughness: 0.9, metalness: 0}));
        return materials.get(band);
    };
    const clear = () => {
        for (const m of [...group.children]) { group.remove(m); m.geometry.dispose(); }
    };
    return {
        group,
        draw (bands) {
            clear();
            for (const b of bands) {
                if (!b.points || b.points.length < 3) continue;
                const curve = new CatmullRomCurve3(b.points.map(p => new Vector3(...lduToWorld(p))), true, 'centripetal');
                const mesh = new Mesh(new TubeGeometry(curve, Math.min(400, b.points.length * 2), BAND_RADIUS_LDU * LDU_M, 6, true), materialFor(b.band));
                mesh.name = `band:${b.id}`;
                mesh.userData.belt = b.id;
                group.add(mesh);
            }
        },
        get count () { return group.children.length; },
        dispose () {
            clear();
            for (const m of materials.values()) m.dispose();
            materials.clear();
            group.removeFromParent();
        }
    };
};

/**
 * Simulate's bands: each part a band goes round rides on a body; every update() lays the band
 * round the parts where those bodies are now. null when the model has no band.
 * @param {{model, mechanism, catalog: Map|object, built: {scene, bodyGroups: Map}}} args
 */
export const createSimBelts = ({model, mechanism, catalog, built}) => {
    if (!model.belts || !model.belts.length || !catalog) return null;
    const metaOf = part => (catalog instanceof Map ? catalog.get(part) : catalog[part]);
    const byId = new Map(model.parts.map(p => [p.id, p]));
    const bodyOf = id => (mechanism.bodies || []).find(b => b.parts.includes(id));
    const belts = [];
    for (const belt of model.belts) {
        const anchors = [];
        for (const id of belt.around) {
            const pl = byId.get(id);
            const c = pl && placedCircle(pl, metaOf(pl.part));
            const body = bodyOf(id);
            const g = body && built.bodyGroups.get(body.id);
            if (!c || !g) { anchors.length = 0; break; }
            // the circle's centre and axis in the body's own frame (its group at t = 0)
            g.updateMatrix();
            const inv = new Matrix4().copy(g.matrix).invert();
            const centre = new Vector3(...lduToWorld(c.center)).applyMatrix4(inv);
            const along = new Vector3(...lduToWorld(c.center.map((x, i) => x + c.axis[i]))).applyMatrix4(inv).sub(centre);
            anchors.push({g, centre, along, r: c.r});
        }
        if (anchors.length >= 2) belts.push({id: belt.id, band: BANDS.some(b => b.part === belt.band) ? belt.band : BANDS[0].part, anchors});
    }
    if (!belts.length) return null;
    const layer = createBeltLayer();
    built.scene.add(layer.group);
    const p = new Vector3();
    const q = new Vector3();
    const update = () => {
        layer.draw(belts.map(b => {
            const circles = b.anchors.map(a => {
                a.g.updateMatrix();
                p.copy(a.centre).applyMatrix4(a.g.matrix);
                q.copy(a.centre).add(a.along).applyMatrix4(a.g.matrix);
                const c = worldToLdu(p);
                const tip = worldToLdu(q);
                const axis = tip.map((x, i) => x - c[i]);
                const n = Math.hypot(...axis) || 1;
                return {center: c, axis: axis.map(x => x / n), r: a.r};
            });
            const path = bandPath(circles);
            return {id: b.id, band: b.band, points: path.error ? null : path.points};
        }));
    };
    update();
    return {update, dispose: () => layer.dispose(), get count () { return layer.count; }};
};
