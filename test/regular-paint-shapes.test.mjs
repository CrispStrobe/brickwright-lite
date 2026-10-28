import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../overlay/scratch-paint/src/helper/bw/shapes.js', import.meta.url), 'utf8');
const paper = {
    Point: class {constructor(x,y){this.x=x;this.y=y;}},
    Path: class {constructor(){this.segments=[];this.data={};}add(point){this.segments.push({point});}}
};
const {makePolygon,makeStar}=new Function('paper',source.replace(/^import .*;\n/gm,'')
    .replace(/export \{[\s\S]*?\};?\s*$/,'')+';return {makePolygon,makeStar};')(paper);
const near=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-8,`${message}: ${a} vs ${b}`);
const points=path=>path.segments.map(segment=>segment.point);
const centre=vertices=>({x:vertices.reduce((sum,p)=>sum+p.x,0)/vertices.length,y:vertices.reduce((sum,p)=>sum+p.y,0)/vertices.length});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

test('wide and tall drags produce regular n-gons with equal edges, radii and angles',()=>{
    for(const n of [3,4,5,6,7,8,12,24])for(const [width,height]of[[240,60],[60,240],[100,100]]){
        const rect={width,height,center:{x:31,y:-17}};
        const path=makePolygon(rect,n),v=points(path),c=centre(v);
        assert.equal(v.length,n);assert.equal(path.closed,true);
        const side=distance(v[0],v[1]),radius=distance(v[0],c);
        for(let i=0;i<n;i++){
            near(distance(v[i],v[(i+1)%n]),side,`${n}-gon edge`);
            near(distance(v[i],c),radius,`${n}-gon radius`);
            const a=v[(i+n-1)%n],b=v[i],d=v[(i+1)%n];
            const cosine=((a.x-b.x)*(d.x-b.x)+(a.y-b.y)*(d.y-b.y))/(distance(a,b)*distance(d,b));
            near(cosine,Math.cos(Math.PI-2*Math.PI/n),`${n}-gon angle`);
        }
        const xs=v.map(p=>p.x),ys=v.map(p=>p.y);
        near((Math.min(...xs)+Math.max(...xs))/2,rect.center.x,'bounds centre x');
        near((Math.min(...ys)+Math.max(...ys))/2,rect.center.y,'bounds centre y');
        assert.ok(Math.max(...xs)-Math.min(...xs)<=width+1e-8);
        assert.ok(Math.max(...ys)-Math.min(...ys)<=height+1e-8);
    }
});

test('stars keep uniform outer and inner radii instead of elliptical stretching',()=>{
    for(const n of [3,5,6,9]){
        const v=points(makeStar({width:220,height:60,center:{x:0,y:0}},n,0.4)),c=centre(v);
        const outer=distance(v[0],c);
        for(let i=0;i<v.length;i++)near(distance(v[i],c),outer*(i%2?0.4:1),'star radius');
    }
});

test('zero-size drags and non-finite side counts do not emit non-finite coordinates',()=>{
    for(const sides of [NaN,Infinity,3]){
        const path=makePolygon({width:0,height:0,center:{x:5,y:6}},sides);
        assert.equal(path.segments.length,3);
        for(const p of points(path)){assert.equal(p.x,5);assert.equal(p.y,6);}
    }
});
