// Serialized into the original simulator page (self-contained, no imports).
// The Arcade SDK keeps its scene in compiled-program globals; every record is
// {id, fields, vtable}. Positions are Fx8 (value / 256).
export const PXT_SNAPSHOT_SOURCE = `(globalsOf) => {
  const rt = window.__bwPxtRuntime, g = rt.globals;
  const strip = k => k.replace(/___\\d+$/, '');
  const find = n => { const k = Object.keys(g).find(k => strip(k) === n); return k === undefined ? undefined : g[k]; };
  const out = {dead: !!rt.dead};
  // The simulator's display buffer holds resolved colours (not palette indices):
  // map each colour back to the first palette entry with that value. Comparison is
  // by resolved RGB, so duplicate palette entries (e.g. two blacks) are immaterial.
  const st = rt.board.screenState;
  if (st && st.screen) {
    const pal = Array.from(st.palette || []), lookup = new Map();
    pal.forEach((v, i) => { if (!lookup.has(v >>> 0)) lookup.set(v >>> 0, i); });
    let s = ''; const px = st.screen;
    for (let i = 0; i < px.length; i++) { const idx = lookup.get(px[i] >>> 0); s += (idx === undefined ? 0 : idx).toString(16); }
    out.pix = s;
    // The simulator stores 0xBBGGRR; report RRGGBB.
    out.palette = pal.map(v => ((v & 255) << 16 | (v & 0xff00) | (v >> 16 & 255)).toString(16).padStart(6, '0'));
  }
  const scene = find('_scene');
  const kindNames = {};
  for (const n of ['Player', 'Projectile', 'Food', 'Enemy']) { const v = find(n); if (typeof v === 'number') kindNames[v] = n; }
  out.sprites = [];
  const list = scene && scene.fields && scene.fields.allSprites && scene.fields.allSprites.data;
  if (list) for (const sp of list) {
    if (!sp.fields || !sp.fields._image) continue; // scene renderables (HUD) are not sprites
    const f = sp.fields, im = f._image, data = im && im.data;
    let h = 2166136261 >>> 0;
    if (data) for (let i = 0; i < im._width * im._height; i++) { h = Math.imul(h ^ (data[i] & 15), 16777619) >>> 0; }
    out.sprites.push({id: f.id, kind: f._kind, kindName: kindNames[f._kind], x: (f._x + f._width / 2) / 256, y: (f._y + f._height / 2) / 256, z: f._z,
      image: im ? im._width + 'x' + im._height + ':' + h.toString(16) : null, visible: (f.flags & 128) === 0, flags: f.flags});
  }
  const info = find('infoState');
  const ps = info && info.fields && info.fields.playerStates && info.fields.playerStates.data;
  const p1 = ps && ps[0] && ps[0].fields;
  out.score = p1 && typeof p1.score === 'number' ? p1.score : 0;
  out.life = p1 && typeof p1.life === 'number' ? p1.life : null;
  out.globals = {};
  for (const name of globalsOf || []) {
    const matches = Object.keys(g).filter(k => strip(k) === name);
    if (matches.length !== 1) continue;
    const v = g[matches[0]];
    if (v === null || ['number', 'string', 'boolean'].includes(typeof v)) out.globals[name] = v;
  }
  return out;
}`;
