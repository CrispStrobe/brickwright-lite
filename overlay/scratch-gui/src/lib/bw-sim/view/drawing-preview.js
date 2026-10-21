// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// A view of measured floor ink, independent of the machine camera or occlusion.
const NS = 'http://www.w3.org/2000/svg';
export const drawingPaths = strokes => {
    const points = strokes.flat();
    if (!points.length) return [];
    let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
    for (const [x,y] of points) { minX=Math.min(minX,x); maxX=Math.max(maxX,x); minY=Math.min(minY,y); maxY=Math.max(maxY,y); }
    const size=Math.max(maxX-minX,maxY-minY,.001), scale=156/size;
    const cx=(minX+maxX)/2, cy=(minY+maxY)/2;
    return strokes.map(stroke=>stroke.map(([x,y],i)=>`${i?'L':'M'}${(90+(x-cx)*scale).toFixed(2)},${(90+(y-cy)*scale).toFixed(2)}`).join(' '));
};
export const createDrawingPreview = ({container,pens,label}) => {
    const doc=container.ownerDocument, root=doc.createElement('details'), summary=doc.createElement('summary');
    root.dataset.testid='bw-sim-drawing-preview';root.open=true;
    Object.assign(root.style,{position:'absolute',right:'10px',bottom:'10px',zIndex:2,background:'#fff',border:'1px solid #94a3b8',borderRadius:'6px',padding:'4px',maxWidth:'28%'});
    summary.textContent='✎';summary.title=label;summary.setAttribute('aria-label',label);summary.style.cursor='pointer';
    const svg=doc.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 180 180');svg.setAttribute('role','img');svg.setAttribute('aria-label',label);
    Object.assign(svg.style,{display:'block',width:'160px',maxWidth:'100%',height:'auto'});root.append(summary,svg);container.appendChild(root);
    let count=-1;
    const update=()=>{
        if(!root.open||count===pens.pointCount)return;
        count=pens.pointCount;
        const paths=drawingPaths(pens.strokes());
        svg.replaceChildren(...paths.map(d=>{const p=doc.createElementNS(NS,'path');p.setAttribute('d',d);p.setAttribute('fill','none');p.setAttribute('stroke','#1e293b');p.setAttribute('stroke-width','1.5');return p;}));
    };
    root.addEventListener('toggle',update);
    return {update,dispose:()=>{root.removeEventListener('toggle',update);root.remove();}};
};
