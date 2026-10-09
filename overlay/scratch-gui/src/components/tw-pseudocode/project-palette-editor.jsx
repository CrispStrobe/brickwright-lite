import React from 'react';
import PropTypes from 'prop-types';
import {makeT,browserLocale} from '../../lib/bw-i18n.js';
import {inspectProjectPalette,applyProjectPalette,DEFAULT_PROJECT_PALETTE} from '../../lib/arcade-project-palette.js';
import {imageToSvg} from '../../lib/bw-makecode/arcade-assets.js';
import {PALETTE_PRESETS} from '../../lib/bw-makecode/palette-presets.js';
const t=makeT({en:{
    title:'Project palette',hint:'Startup colors for the whole game. Pixel indices stay the same.',
    artwork:'Use artwork colors',background:'Screen background',preview:'Preview project colors',
    apply:'Apply to project',reload:'Reload project palette',reset:'Reset colors',preset:'Palette preset',custom:'Custom',
    later:'Later Code or Blocks can change these colors while the game runs.',
    blocked:'The startup palette uses an expression or multiple commands. Edit it in Code or Blocks.',
    saved:'Project palette saved to Blocks.',error:'Could not apply the project palette: {message}'
},de:{
    title:'Projektpalette',hint:'Startfarben für das gesamte Spiel. Die Pixelindizes bleiben erhalten.',
    artwork:'Grafikfarben übernehmen',background:'Bildschirmhintergrund',preview:'Projektfarben anzeigen',
    apply:'Auf Projekt anwenden',reload:'Projektpalette neu laden',reset:'Farben zurücksetzen',preset:'Palettenvorlage',custom:'Eigene Farben',
    later:'Code oder Blöcke können diese Farben während des Spiels ändern.',
    blocked:'Die Startpalette verwendet einen Ausdruck oder mehrere Befehle. Bitte in Code oder Blöcken bearbeiten.',
    saved:'Projektpalette in Blöcken gespeichert.',error:'Projektpalette konnte nicht angewendet werden: {message}'
}});
const button={minHeight:44,padding:'8px 10px',border:'1px solid #cbd5e1',borderRadius:6,background:'#fff',
    fontSize:12,whiteSpace:'normal',maxWidth:'100%',cursor:'pointer'};
class ProjectPaletteEditor extends React.Component {
    constructor(props){super(props);const project=inspectProjectPalette(props.vm);
        this.state={project,colors:project.colors,busy:false,status:'',error:''};}
    change(colors){this.setState({colors,status:'',error:''});if(this.props.previewing)this.props.onPreview([null,...colors.slice(1)]);}
    reload(){const project=inspectProjectPalette(this.props.vm);this.setState({project,colors:project.colors,status:'',error:''});
        if(this.props.previewing)this.props.onPreview([null,...project.colors.slice(1)]);}
    async apply(){
        this.setState({busy:true,status:'',error:''});
        try{const project=await applyProjectPalette(this.props.vm,this.state.colors,this.state.project.signature);
            this.setState({project,colors:project.colors,status:'saved'});
        }catch(error){this.setState({error:error.message});}
        finally{this.setState({busy:false});}
    }
    render(){
        const locale=this.props.locale || browserLocale(),{project,colors,busy,status,error}=this.state;
        const blocked=project.kind==='conflict' || project.kind==='dynamic';
        const preset=PALETTE_PRESETS.find(item=>item.colors.slice(1).every((color,index)=>color===colors[index+1]))?.id || '';
        const svg=this.props.image && imageToSvg(this.props.image,{scale:4,palette:[null,...colors.slice(1)]});
        return <section data-testid="bw-project-palette" style={{width:'100%',display:'grid',gap:8,borderTop:'1px solid #cbd5e1',paddingTop:10}}>
            <strong>{t(locale,'title')}</strong><p style={{fontSize:12,margin:0}}>{t(locale,'hint')}</p>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:6}}>
                {colors.map((color,index)=><label key={index} style={{display:'flex',alignItems:'center',gap:4,fontSize:12}}
                    title={index===0?t(locale,'background'):String(index)}>
                    <span>{index}</span><input type="color" value={color} disabled={busy || blocked}
                        aria-label={index===0?t(locale,'background'):`${t(locale,'title')} ${index}`}
                        data-testid={`bw-project-palette-color-${index}`} style={{width:38,minWidth:0,height:32,padding:0}}
                        onChange={event=>{const next=colors.slice();next[index]=event.target.value.toLowerCase();this.change(next);}} />
                </label>)}
            </div>
            <label style={{fontSize:12}}>{t(locale,'preset')} <select data-testid="bw-project-palette-preset" value={preset}
                disabled={busy || blocked} style={{maxWidth:'100%',minHeight:44}} onChange={event=>{
                    const chosen=PALETTE_PRESETS.find(item=>item.id===event.target.value);
                    if(chosen)this.change([colors[0],...chosen.colors.slice(1)]);
                }}><option value="" disabled>{t(locale,'custom')}</option>{PALETTE_PRESETS.map(item=><option key={item.id} value={item.id}>{item.id}</option>)}</select></label>
            {svg?<img data-testid="bw-project-palette-preview" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
                alt={t(locale,'preview')} style={{maxWidth:'100%',maxHeight:100,imageRendering:'pixelated',background:colors[0],justifySelf:'start'}} />:null}
            <label style={{fontSize:12,minHeight:32}}><input type="checkbox" checked={this.props.previewing}
                data-testid="bw-project-palette-use-preview" onChange={event=>this.props.onPreview(event.target.checked?[null,...colors.slice(1)]:null)} /> {t(locale,'preview')}</label>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                <button style={button} type="button" data-testid="bw-project-palette-apply" disabled={busy || blocked} onClick={()=>this.apply()}>{t(locale,'apply')}</button>
                <button style={button} type="button" disabled={busy || blocked} onClick={()=>this.change([...DEFAULT_PROJECT_PALETTE])}>{t(locale,'reset')}</button>
                <button style={button} type="button" disabled={busy || blocked} onClick={()=>this.change([colors[0],...this.props.artworkPalette.slice(1)])}>{t(locale,'artwork')}</button>
                <button style={button} type="button" data-testid="bw-project-palette-reload" disabled={busy} onClick={()=>this.reload()}>{t(locale,'reload')}</button>
            </div>
            {project.laterChanges?<p style={{fontSize:12,margin:0}}>{t(locale,'later')}</p>:null}
            {blocked?<p role="alert" style={{fontSize:12,margin:0}}>{t(locale,'blocked')}</p>:null}
            {status?<span role="status" style={{fontSize:12}}>{t(locale,'saved')}</span>:null}
            {error?<span role="alert" style={{fontSize:12,color:'#b91c1c'}}>{t(locale,'error',{message:error})}</span>:null}
        </section>;
    }
}
ProjectPaletteEditor.propTypes={vm:PropTypes.object.isRequired,locale:PropTypes.string,image:PropTypes.object,
    artworkPalette:PropTypes.array.isRequired,previewing:PropTypes.bool.isRequired,onPreview:PropTypes.func.isRequired};
export default ProjectPaletteEditor;
