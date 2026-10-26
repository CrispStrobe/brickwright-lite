// SPDX-License-Identifier: BSD-3-Clause
// Serialised by the two hosted observers into the actual editor realm.
// No DOM, engine, guest or input implementation is substituted.
export async function runSamdNativeGame (packet) {
    const need = (ok, reason) => { if (!ok) throw new Error(reason); };
    const sha = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n => n.toString(16).padStart(2,'0')).join('');
    const decode = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
    const encode = bytes => {
        let text = '';
        for(let i=0;i<bytes.length;i+=8192) text += String.fromCharCode(...bytes.subarray(i,i+8192));
        return btoa(text);
    };
    const plain = value => value instanceof Map ? Object.fromEntries([...value].map(([k,v])=>[k,plain(v)])) : Array.isArray(value) ? value.map(plain) : value;
    const fetchBytes = async name => {
        const url = new URL(`static/labwired/${name}`,document.baseURI);
        const response = await fetch(url);
        need(response.ok,`shipped engine asset unavailable: ${name}`);
        return new Uint8Array(await response.arrayBuffer());
    };
    need(window.__brickwrightStore?.getState()?.scratchGui?.vm?.runtime,'actual editor VM must be ready');
    need(typeof packet.engineSource === 'string' && /^[0-9a-f]{40}$/.test(packet.engineSource),'immutable source required');
    const profileBytes = await fetchBytes('samd-no-asf-profile.json');
    const glueBytes = await fetchBytes('labwired_wasm.js');
    const wasmBytes = await fetchBytes('labwired_wasm_bg.wasm');
    need(await sha(profileBytes)===packet.profileSha256,'actual shipped profile SHA-256');
    need(await sha(glueBytes)===packet.glueSha256,'actual shipped glue SHA-256');
    need(await sha(wasmBytes)===packet.wasmSha256,'actual shipped WASM SHA-256');
    const profile = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(profileBytes));
    need(profile.source===packet.engineSource && profile.physical_capture===false && profile.profile==='samd51-no-asf-simulation','same authored engine/profile');
    const firmware = decode(packet.firmware);
    need(await sha(firmware)===packet.firmwareSha256,'actual source-built ELF identity');
    const blobs = {};
    for(const name of ['LABWIRED_SAMD51_SIM_SW0','LABWIRED_SAMD51_SIM_SERIAL']) {
        const input = profile.inputs[name];
        need(input.encoding==='hex' && /^[0-9a-f]{2048}$/.test(input.data) && input.bytes===1024,'complete authored input');
        blobs[name] = Uint8Array.from(input.data.match(/../g),n=>parseInt(n,16));
        need(await sha(blobs[name])===input.sha256,'actual shipped input SHA-256');
    }
    // This server/app serves the admitted immutable frontend, including this
    // exact glue URL. Explicit WASM bytes prevent a second unbound WASM fetch.
    const module = await import(new URL('static/labwired/labwired_wasm.js',document.baseURI).href);
    await module.default({module_or_path:wasmBytes});
    const rectangle = (bytes,colour,size) => {
        const points = [];
        for(let i=0;i<bytes.length;i+=3) if(colour.every((v,n)=>bytes[i+n]===v)) points.push([(i/3)%128,Math.floor(i/3/128)]);
        if(points.length!==size*size) return null;
        const x=Math.min(...points.map(p=>p[0]));const y=Math.min(...points.map(p=>p[1]));
        if(points.some(([a,b])=>a>=x+size||b>=y+size)) return null;
        return [159-y-(size-1),x];
    };
    const canvas = document.createElement('canvas');canvas.width=128;canvas.height=160;
    canvas.dataset.samdQualification='controller-memory-observer';
    canvas.setAttribute('aria-label','Qualification observer: actual controller memory');
    Object.assign(canvas.style,{position:'fixed',right:'8px',bottom:'8px',width:'256px',height:'320px',zIndex:'2147483647',imageRendering:'pixelated',border:'2px solid white'});
    document.body.appendChild(canvas);
    const context=canvas.getContext('2d');
    const draw = bytes => {
        const image=context.createImageData(128,160);
        for(let i=0;i<128*160;i++) { image.data.set(bytes.subarray(i*3,i*3+3),i*4);image.data[i*4+3]=255; }
        context.putImageData(image,0,0);
    };
    const yieldBrowser = () => new Promise(resolve=>setTimeout(resolve,0));
    const frame = async sim => {
        for(const entering of [true,false]) {
            const address=entering?packet.symbols.updateScreen:sim.get_register(14)&~1;
            const stack=entering?null:sim.get_register(13);
            sim.set_breakpoints([address,packet.symbols.target_panic]);
            let reached=false;
            for(let i=0;i<1200;i++) {
                sim.step_batch(500_000);
                const pc=sim.get_pc();
                need(pc!==packet.symbols.target_panic,`actual target_panic(${sim.get_register(0)})`);
                if(pc===address) { reached=true;break; }
                await yieldBrowser();
            }
            need(reached,'render boundary budget');
            if(stack!==null) need(stack===sim.get_register(13),'same actual render call returned');
        }
        const artifact=plain(sim.get_display('controller_memory',true));
        need(artifact?.width===128&&artifact?.height===160,'actual controller geometry');
        need(artifact.meta.unknown_pixels===0&&artifact.bytes?.length===128*160*3,'complete actual colour validity');
        return Uint8Array.from(artifact.bytes);
    };
    const samples=[];
    for(let sample=0;sample<3;sample++) {
        const began=performance.now();
        const sim=module.WasmSimulator.new_from_config(profile.system_yaml,profile.chip_yaml,firmware,blobs);
        sim.set_jit_enabled(false);
        try {
            const pictures=[];const times=[];
            const take=async colour=>{
                for(let attempt=0;attempt<120;attempt++) {
                    const bytes=await frame(sim);
                    draw(bytes);
                    const player=rectangle(bytes,colour,16);const ball=rectangle(bytes,[0,48,170],8);
                    let targets=0;
                    for(let i=0;i<bytes.length;i+=3) if(bytes[i]===255&&bytes[i+1]===138&&bytes[i+2]===48) targets++;
                    if(!player||!ball||targets!==512) continue;
                    const picture={sha256:await sha(bytes),player,ball,rgb_base64:encode(bytes)};
                    pictures.push(picture);times.push((performance.now()-began)/1000);
                    return picture;
                }
                throw new Error('game picture budget');
            };
            for(let i=0;i<6;i++) await take([255,32,32]);
            need(JSON.stringify(pictures[0].ball)!==JSON.stringify(pictures[5].ball),'actual moving game');
            const initial=pictures[5].player[0];
            sim.set_input('right',1);sim.set_input('a',1);
            const pressedAt=performance.now();let moved=false;
            for(let i=0;i<120;i++) if((await take([138,255,255])).player[0]>=initial+8) { moved=true;break; }
            need(moved,'actual right-button displacement');
            const pressSeconds=(performance.now()-pressedAt)/1000;
            sim.set_input('right',0);sim.set_input('a',0);
            const releasedAt=performance.now();
            for(let i=0;i<4;i++) await take([255,32,32]);
            const releaseSeconds=(performance.now()-releasedAt)/1000;
            need(JSON.stringify(pictures.at(-1).player)===JSON.stringify(pictures.at(-2).player),'released movement stopped');
            samples.push({sample,engine:packet.engineSource,firmware_sha256:packet.firmwareSha256,startup_seconds:times[0],first_six_render_seconds:times[5]-times[0],render_intervals:5,press_seconds:pressSeconds,release_seconds:releaseSeconds,pictures,wall_seconds:(performance.now()-began)/1000,process_memory_bytes:performance.memory?{used_js_heap_size:performance.memory.usedJSHeapSize,total_js_heap_size:performance.memory.totalJSHeapSize}:null});
        } finally { sim.free(); }
    }
    return {status:'SAMD_ACTUAL_REALM_GAME_PASS',source:packet.engineSource,profile_sha256:packet.profileSha256,glue_sha256:packet.glueSha256,wasm_sha256:packet.wasmSha256,firmware_sha256:packet.firmwareSha256,samples,href:String(location.href),user_agent:navigator.userAgent,native:typeof window.__TAURI_INTERNALS__?.invoke==='function',physical_capture:false,scope:'actual shipped engine/config assets and owned source-built guest; observer canvas, no native SAMD GUI route claim'};
}
