/*! For license information please see 7477.8da0e0a6edccefa43d60.js.LICENSE.txt */
"use strict";(self.webpackChunkGUI=self.webpackChunkGUI||[]).push([[7477],{18688:(t,e,s)=>{s.d(e,{P:()=>l});var i=s(12618),n=s(52777),r=s(29298),a=function(t,e,s,i){var n,r=arguments.length,a=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)a=Reflect.decorate(t,e,s,i);else for(var l=t.length-1;l>=0;l--)(n=t[l])&&(a=(r<3?n(a):r>3?n(e,s,a):n(e,s))||a);return r>3&&a&&Object.defineProperty(e,s,a),a};let l=class extends i.WF{constructor(){super(...arguments),this.color="red",this.offColor="#444",this.background="black",this.digits=1,this.colon=!1,this.colonValue=!1,this.pins="top",this.values=[0,0,0,0,0,0,0,0]}get pinInfo(){const t=t=>{const{startX:e,cols:s,bottomY:i}=this.pinPositions,n=(t-1)%s,a=1-Math.floor((t-1)/s),l=e+1.27+2.54*(a?n:s-n-1),o="top"===this.pins?a?i+1:1:a?i+2:0;return{number:t,x:l*r.p,y:o*r.p}};switch(this.digits){case 4:return[{name:"A",...t(13),signals:[],description:"Segment A"},{name:"B",...t(9),signals:[],description:"Segment B"},{name:"C",...t(4),signals:[],description:"Segment C"},{name:"D",...t(2),signals:[],description:"Segment D"},{name:"E",...t(1),signals:[],description:"Segment E"},{name:"F",...t(12),signals:[],description:"Segment F"},{name:"G",...t(5),signals:[],description:"Segment G"},{name:"DP",...t(3),signals:[],description:"Decimal Point"},{name:"DIG1",...t(14),signals:[],description:"Digit 1 Common"},{name:"DIG2",...t(11),signals:[],description:"Digit 2 Common"},{name:"DIG3",...t(10),signals:[],description:"Digit 3 Common"},{name:"DIG4",...t(6),signals:[],description:"Digit 4 Common"},{name:"COM",...t(7),signals:[],description:"Common pin"},{name:"CLN",...t(8),signals:[],description:"Colon"}];case 3:return[{name:"A",...t(11),signals:[],description:"Segment A"},{name:"B",...t(7),signals:[],description:"Segment B"},{name:"C",...t(4),signals:[],description:"Segment C"},{name:"D",...t(2),signals:[],description:"Segment D"},{name:"E",...t(1),signals:[],description:"Segment E"},{name:"F",...t(10),signals:[],description:"Segment F"},{name:"G",...t(5),signals:[],description:"Segment G"},{name:"DP",...t(3),signals:[],description:"Decimal Point"},{name:"DIG1",...t(12),signals:[],description:"Digit 1 Common"},{name:"DIG2",...t(9),signals:[],description:"Digit 2 Common"},{name:"DIG3",...t(8),signals:[],description:"Digit 3 Common"}];case 2:return[{name:"DIG1",...t(8),signals:[],description:"Digit 1 Common"},{name:"DIG2",...t(7),signals:[],description:"Digit 2 Common"},{name:"A",...t(10),signals:[],description:"Segment A"},{name:"B",...t(9),signals:[],description:"Segment B"},{name:"C",...t(1),signals:[],description:"Segment C"},{name:"D",...t(4),signals:[],description:"Segment D"},{name:"E",...t(3),signals:[],description:"Segment E"},{name:"F",...t(6),signals:[],description:"Segment F"},{name:"G",...t(5),signals:[],description:"Segment G"},{name:"DP",...t(2),signals:[],description:"Decimal Point"}];default:return[{name:"COM.1",...t(3),signals:[],description:"Common"},{name:"COM.2",...t(8),signals:[],description:"Common"},{name:"A",...t(7),signals:[],description:"Segment A"},{name:"B",...t(6),signals:[],description:"Segment B"},{name:"C",...t(4),signals:[],description:"Segment C"},{name:"D",...t(2),signals:[],description:"Segment D"},{name:"E",...t(1),signals:[],description:"Segment E"},{name:"F",...t(9),signals:[],description:"Segment F"},{name:"G",...t(10),signals:[],description:"Segment G"},{name:"DP",...t(5),signals:[],description:"Decimal Point"}]}}static get styles(){return i.AH`
      polygon {
        transform: scale(0.9);
        transform-origin: 50% 50%;
        transform-box: fill-box;
      }
    `}get pinPositions(){const{digits:t}=this,e=4===t?14:3===t?12:10,s=Math.ceil(e/2);return{startX:(12.55*t-2.54*s)/2,bottomY:"extend"===this.pins?21:18,cols:s}}get yOffset(){return"extend"===this.pins?2:0}update(t){(t.has("digits")||t.has("pins"))&&this.dispatchEvent(new CustomEvent("pininfo-change")),super.update(t)}renderDigit(t,e){const s=t=>this.values[e+t]?this.color:this.offColor;return i.JW`
      <g transform="skewX(-8) translate(${t}, ${this.yOffset+2.4}) scale(0.81)">
        <polygon points="2 0 8 0 9 1 8 2 2 2 1 1" fill="${s(0)}" />
        <polygon points="10 2 10 8 9 9 8 8 8 2 9 1" fill="${s(1)}" />
        <polygon points="10 10 10 16 9 17 8 16 8 10 9 9" fill="${s(2)}" />
        <polygon points="8 18 2 18 1 17 2 16 8 16 9 17" fill="${s(3)}" />
        <polygon points="0 16 0 10 1 9 2 10 2 16 1 17" fill="${s(4)}" />
        <polygon points="0 8 0 2 1 1 2 2 2 8 1 9" fill=${s(5)} />
        <polygon points="2 8 8 8 9 9 8 10 2 10 1 9" fill=${s(6)} />
      </g>
      <circle cx="${t+7.4}" cy="${this.yOffset+16}" r="0.89" fill="${s(7)}" />
    `}renderColon(){const{yOffset:t}=this,e=1.5+12.7*Math.round(this.digits/2),s=this.colonValue?this.color:this.offColor;return i.JW`
      <g transform="skewX(-8)"  fill="${s}">
        <circle cx="${e}" cy="${t+5.75}" r="0.89" />
        <circle cx="${e}" cy="${t+13.25}" r="0.89" />
      </g>
    `}renderPins(){const{cols:t,bottomY:e,startX:s}=this.pinPositions;return i.JW`
      <g fill="url(#pin-pattern)" transform="translate(${s}, 0)">
        <rect height="2" width=${2.54*t} />
        <rect height="2" width=${2.54*t} transform="translate(0, ${e})" />
      </g>
    `}render(){const{digits:t,colon:e,pins:s,yOffset:n}=this,r=12.55*t,a="extend"===s?23:22,l=[];for(let e=0;e<t;e++)l.push(this.renderDigit(3.5+12.7*e,8*e));return i.qy`
      <svg
        width="${r}mm"
        height="${a}mm"
        version="1.1"
        viewBox="0 0 ${r} ${a}"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="pin-pattern" height="2" width="2.54" patternUnits="userSpaceOnUse">
            ${"extend"===s?i.JW`<rect x="1.02" y="0" height="2" width="0.5" fill="#aaa" />`:i.JW`<circle cx="1.27" cy="1" r="0.5" fill="#aaa" />`}
          </pattern>
        </defs>
        <rect x="0" y="${n}" width="${r}" height="20.5" />
        ${l}<!-- -->
        ${e?this.renderColon():null}<!-- -->
        ${"none"!==s?this.renderPins():null}
      </svg>
    `}};a([(0,n.MZ)()],l.prototype,"color",void 0),a([(0,n.MZ)()],l.prototype,"offColor",void 0),a([(0,n.MZ)()],l.prototype,"background",void 0),a([(0,n.MZ)({type:Number})],l.prototype,"digits",void 0),a([(0,n.MZ)({type:Boolean})],l.prototype,"colon",void 0),a([(0,n.MZ)({type:Boolean})],l.prototype,"colonValue",void 0),a([(0,n.MZ)()],l.prototype,"pins",void 0),a([(0,n.MZ)({type:Array})],l.prototype,"values",void 0),l=a([(0,n.EM)("wokwi-7segment")],l)},555:(t,e,s)=>{s.d(e,{h:()=>h});var i=s(12618),n=s(52777),r=s(70300),a=s(76860),l=s(33493),o=function(t,e,s,i){var n,r=arguments.length,a=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)a=Reflect.decorate(t,e,s,i);else for(var l=t.length-1;l>=0;l--)(n=t[l])&&(a=(r<3?n(a):r>3?n(e,s,a):n(e,s))||a);return r>3&&a&&Object.defineProperty(e,s,a),a};let h=class extends i.WF{constructor(){super(...arguments),this.led13=!1,this.ledRX=!1,this.ledTX=!1,this.ledPower=!1,this.resetPressed=!1,this.pinInfo=[{name:"SCL",x:90,y:9,signals:[(0,a.v2)("SCL")]},{name:"SDA",x:100,y:9,signals:[(0,a.v2)("SDA")]},{name:"AREF",x:109,y:9,signals:[]},{name:"GND.1",x:119,y:9,signals:[{type:"power",signal:"GND"}]},{name:"13",x:129,y:9,signals:[{type:"pwm"}]},{name:"12",x:138,y:9,signals:[{type:"pwm"}]},{name:"11",x:148,y:9,signals:[{type:"pwm"}]},{name:"10",x:157.5,y:9,signals:[{type:"pwm"}]},{name:"9",x:167.5,y:9,signals:[{type:"pwm"}]},{name:"8",x:177,y:9,signals:[{type:"pwm"}]},{name:"7",x:190,y:9,signals:[{type:"pwm"}]},{name:"6",x:200,y:9,signals:[{type:"pwm"}]},{name:"5",x:209.5,y:9,signals:[{type:"pwm"}]},{name:"4",x:219,y:9,signals:[{type:"pwm"}]},{name:"3",x:228.5,y:9,signals:[{type:"pwm"}]},{name:"2",x:238,y:9,signals:[{type:"pwm"}]},{name:"1",x:247.5,y:9,signals:[(0,a._5)("TX")]},{name:"0",x:257.5,y:9,signals:[(0,a._5)("RX")]},{name:"14",x:270.5,y:9,signals:[(0,a._5)("TX",3)]},{name:"15",x:280,y:9,signals:[(0,a._5)("RX",3)]},{name:"16",x:289.5,y:9,signals:[(0,a._5)("TX",2)]},{name:"17",x:299,y:9,signals:[(0,a._5)("RX",2)]},{name:"18",x:308.5,y:9,signals:[(0,a._5)("TX",1)]},{name:"19",x:318.5,y:9,signals:[(0,a._5)("RX",1)]},{name:"20",x:328,y:9,signals:[(0,a.v2)("SDA")]},{name:"21",x:337.5,y:9,signals:[(0,a.v2)("SCL")]},{name:"5V.1",x:361,y:8,signals:[{type:"power",signal:"VCC",voltage:5}]},{name:"5V.2",x:371,y:8,signals:[{type:"power",signal:"VCC",voltage:5}]},{name:"22",x:361,y:17.5,signals:[]},{name:"23",x:371,y:17.5,signals:[]},{name:"24",x:361,y:27.25,signals:[]},{name:"25",x:371,y:27.25,signals:[]},{name:"26",x:361,y:36.75,signals:[]},{name:"27",x:371,y:36.75,signals:[]},{name:"28",x:361,y:46.25,signals:[]},{name:"29",x:371,y:46.25,signals:[]},{name:"30",x:361,y:56,signals:[]},{name:"31",x:371,y:56,signals:[]},{name:"32",x:361,y:65.5,signals:[]},{name:"33",x:371,y:65.5,signals:[]},{name:"34",x:361,y:75,signals:[]},{name:"35",x:371,y:75,signals:[]},{name:"36",x:361,y:84.5,signals:[]},{name:"37",x:371,y:84.5,signals:[]},{name:"38",x:361,y:94.25,signals:[]},{name:"39",x:371,y:94.25,signals:[]},{name:"40",x:361,y:103.75,signals:[]},{name:"41",x:371,y:103.75,signals:[]},{name:"42",x:361,y:113.5,signals:[]},{name:"43",x:371,y:113.5,signals:[]},{name:"44",x:361,y:123,signals:[{type:"pwm"}]},{name:"45",x:371,y:123,signals:[{type:"pwm"}]},{name:"46",x:361,y:132.75,signals:[{type:"pwm"}]},{name:"47",x:371,y:132.75,signals:[]},{name:"48",x:361,y:142.25,signals:[]},{name:"49",x:371,y:142.25,signals:[]},{name:"50",x:361,y:152,signals:[(0,a.dg)("MISO")]},{name:"51",x:371,y:152,signals:[(0,a.dg)("MOSI")]},{name:"52",x:361,y:161.5,signals:[(0,a.dg)("SCK")]},{name:"53",x:371,y:161.5,signals:[]},{name:"GND.4",x:361,y:171.25,signals:[{type:"power",signal:"GND"}]},{name:"GND.5",x:371,y:171.25,signals:[{type:"power",signal:"GND"}]},{name:"IOREF",x:136,y:184.5,signals:[]},{name:"RESET",x:145.5,y:184.5,signals:[]},{name:"3.3V",x:155,y:184.5,signals:[{type:"power",signal:"VCC",voltage:3.3}]},{name:"5V",x:164.5,y:184.5,signals:[{type:"power",signal:"VCC",voltage:5}]},{name:"GND.2",x:174.25,y:184.5,signals:[{type:"power",signal:"GND"}]},{name:"GND.3",x:183.75,y:184.5,signals:[{type:"power",signal:"GND"}]},{name:"VIN",x:193.5,y:184.5,signals:[{type:"power",signal:"VCC"}]},{name:"A0",x:208.5,y:184.5,signals:[(0,a.$n)(0)]},{name:"A1",x:218,y:184.5,signals:[(0,a.$n)(1)]},{name:"A2",x:227.5,y:184.5,signals:[(0,a.$n)(2)]},{name:"A3",x:237.25,y:184.5,signals:[(0,a.$n)(3)]},{name:"A4",x:246.75,y:184.5,signals:[(0,a.$n)(4)]},{name:"A5",x:256.25,y:184.5,signals:[(0,a.$n)(5)]},{name:"A6",x:266,y:184.5,signals:[(0,a.$n)(6)]},{name:"A7",x:275.5,y:184.5,signals:[(0,a.$n)(7)]},{name:"A8",x:290.25,y:184.5,signals:[(0,a.$n)(8)]},{name:"A9",x:300,y:184.5,signals:[(0,a.$n)(9)]},{name:"A10",x:309.5,y:184.5,signals:[(0,a.$n)(10)]},{name:"A11",x:319.25,y:184.5,signals:[(0,a.$n)(11)]},{name:"A12",x:328.75,y:184.5,signals:[(0,a.$n)(12)]},{name:"A13",x:338.5,y:184.5,signals:[(0,a.$n)(13)]},{name:"A14",x:348,y:184.5,signals:[(0,a.$n)(14)]},{name:"A15",x:357.75,y:184.5,signals:[(0,a.$n)(15)]}]}static get styles(){return i.AH`
      text {
        font-size: 2px;
        font-family: monospace;
      }
      circle[tabindex]:hover,
      circle[tabindex]:focus {
        stroke: white;
        outline: none;
      }
    `}render(){const{ledPower:t,led13:e,ledRX:s,ledTX:n}=this;return i.qy`
      <svg
        width="102.66mm"
        height="50.80mm"
        version="1.1"
        viewBox="-4 0 102.66 50.80"
        xmlns="http://www.w3.org/2000/svg"
        xmlns:xlink="http://www.w3.org/1999/xlink"
      >
        <defs>
          <g id="led-body" fill="#eee">
            <rect x="0" y="0" height="1.2" width="2.6" fill="#c6c6c6" />
            <rect x="0.6" y="-0.1" width="1.35" height="1.4" stroke="#aaa" stroke-width="0.05" />
          </g>
        </defs>

        <filter id="ledFilter" x="-0.8" y="-0.8" height="2.2" width="2.8">
          <feGaussianBlur stdDeviation="0.5" />
        </filter>

        ${r.h}

        <pattern id="pin-male" width="2.54" height="4.80" patternUnits="userSpaceOnUse">
          <rect ry="0.3" rx="0.3" width="2.12" height="4.80" fill="#565656" />
          <ellipse cx="1" cy="1.13" rx="0.5" ry="0.5" fill="#aaa"></ellipse>
          <ellipse cx="1" cy="3.67" rx="0.5" ry="0.5" fill="#aaa"></ellipse>
        </pattern>

        <!-- PCB -->
        <path
          d="M2.105.075v50.653h94.068v-1.206l2.412-2.412V14.548l-2.412-2.413V2.487L93.785.075zm14.443.907a1.505 1.505 0 01.03 0 1.505 1.505 0 011.504 1.505 1.505 1.505 0 01-1.504 1.506 1.505 1.505 0 01-1.506-1.506A1.505 1.505 0 0116.548.982zm71.154 0a1.505 1.505 0 01.03 0 1.505 1.505 0 011.505 1.505 1.505 1.505 0 01-1.505 1.506 1.505 1.505 0 01-1.506-1.506A1.505 1.505 0 0187.702.982zM64.818 15.454a1.505 1.505 0 011.504 1.506 1.505 1.505 0 01-1.504 1.505 1.505 1.505 0 01-1.506-1.505 1.505 1.505 0 011.506-1.506zm0 26.532a1.505 1.505 0 011.504 1.506 1.505 1.505 0 01-1.504 1.505 1.505 1.505 0 01-1.506-1.505 1.505 1.505 0 011.506-1.506zm-49.476 4.825a1.505 1.505 0 01.03 0 1.505 1.505 0 011.505 1.504 1.505 1.505 0 01-1.506 1.506 1.505 1.505 0 01-1.505-1.506 1.505 1.505 0 011.476-1.504zm78.39 0a1.505 1.505 0 01.03 0 1.505 1.505 0 011.504 1.504 1.505 1.505 0 01-1.504 1.506 1.505 1.505 0 01-1.506-1.506 1.505 1.505 0 011.476-1.504z"
          fill="#2b6b99"
        />

        <!-- reset button -->
        <rect
          transform="rotate(269.81)"
          x="-28.046"
          y="68.977"
          width="6.2151"
          height="6.0268"
          fill="#9b9b9b"
        />
        <g fill="#e6e6e6">
          <rect transform="rotate(269.81)" x="-29.725" y="69.518" width="1.695" height=".84994" />
          <rect transform="rotate(269.81)" x="-29.741" y="71.4" width="1.695" height=".84994" />
          <rect transform="rotate(269.81)" x="-29.764" y="73.425" width="1.695" height=".84994" />
          <rect transform="rotate(269.81)" x="-21.831" y="73.59" width="1.695" height=".84994" />
          <rect transform="rotate(269.81)" x="-21.854" y="69.517" width="1.695" height=".84994" />
        </g>
        <circle
          id="reset-button"
          transform="rotate(269.81)"
          cx="-24.9"
          cy="72.092"
          r="1.5405"
          fill="#960000"
          stroke="#777"
          stroke-width="0.15"
          tabindex="0"
          @mousedown=${()=>this.down()}
          @touchstart=${()=>this.down()}
          @mouseup=${()=>this.up()}
          @mouseleave=${()=>this.leave()}
          @touchend=${()=>this.leave()}
          @keydown=${t=>l.ed.includes(t.key)&&this.down()}
          @keyup=${t=>l.ed.includes(t.key)&&this.up()}
        />

        <!-- USB Connector -->
        <g style="fill:#b3b2b2;stroke:#b3b2b2;stroke-width:0.010">
          <ellipse cx="3.84" cy="9.56" rx="1.12" ry="1.03" />
          <ellipse cx="3.84" cy="21.04" rx="1.12" ry="1.03" />
          <g fill="#000">
            <rect width="11" height="11.93" x="-0.05" y="9.72" rx="0.2" ry="0.2" opacity="0.24" />
          </g>
          <rect x="-4" y="9.37" height="11.85" width="14.46" />
          <rect x="-4" y="9.61" height="11.37" width="14.05" fill="#706f6f" />
          <rect x="-4" y="9.71" height="11.17" width="13.95" fill="#9d9d9c" />
        </g>

        <!-- Power jack -->
        <g stroke-width=".254" fill="black" transform="translate(0 -4)">
          <path
            d="m-2.58 48.53v2.289c0 0.279 0.228 0.508 0.508 0.508h1.722c0.279 0 0.508-0.228 0.508-0.508v-2.289z"
            fill="#252728"
            opacity=".3"
          />
          <path
            d="m11.334 42.946c0-0.558-0.509-1.016-1.132-1.016h-10.043v9.652h10.043c0.622 0 1.132-0.457 1.132-1.016z"
            opacity=".3"
          />
          <path
            d="m-2.072 40.914c-0.279 0-0.507 0.204-0.507 0.454v8.435c0 0.279 0.228 0.507 0.507 0.507h1.722c0.279 0 0.507-0.228 0.507-0.507v-8.435c0-0.249-0.228-0.454-0.507-0.454z"
          />
          <path
            d="m-2.58 48.784v1.019c0 0.279 0.228 0.508 0.508 0.508h1.722c0.279 0 0.508-0.228 0.508-0.508v-1.019z"
            opacity=".3"
          />
          <path
            d="m11.334 43.327c0.139 0 0.254 0.114 0.254 0.254v4.064c0 0.139-0.114 0.254-0.254 0.254"
          />
          <path
            d="m11.334 42.438c0-0.558-0.457-1.016-1.016-1.016h-10.16v8.382h10.16c0.558 0 1.016-0.457 1.016-1.016z"
          />
          <path
            d="m10.064 49.804h-9.906v-8.382h1.880c-1.107 0-1.363 1.825-1.363 3.826 0 1.765 1.147 3.496 3.014 3.496h6.374z"
            opacity=".3"
          />
          <rect x="10.064" y="41.422" width=".254" height="8.382" fill="#ffffff" opacity=".2" />
          <path
            d="m10.318 48.744v1.059c0.558 0 1.016-0.457 1.016-1.016v-0.364c0 0.313-1.016 0.320-1.016 0.320z"
            opacity=".3"
          />
        </g>

        <!-- Pin Headers -->
        <g transform="translate(18.4 1.07)">
          <rect width="${.38+25.4}" height="2.54" fill="url(#pins-female)"></rect>
        </g>
        <g transform="translate(44.81 1.07)">
          <rect width="${20.7}" height="2.54" fill="url(#pins-female)"></rect>
        </g>
        <g transform="translate(66 1.07)">
          <rect width="${20.7}" height="2.54" fill="url(#pins-female)"></rect>
        </g>
        <g transform="translate(27.93 47.5)">
          <rect width="${20.7}" height="2.54" fill="url(#pins-female)"></rect>
        </g>
        <g transform="translate(49.63 47.5)">
          <rect width="${20.7}" height="2.54" fill="url(#pins-female)"></rect>
        </g>
        <g transform="translate(71.34 47.5)">
          <rect width="${20.7}" height="2.54" fill="url(#pins-female)"></rect>
        </g>
        <g transform="translate(90.1 0.8)">
          <rect width="${5.46}" height="${45.72}" fill="url(#pins-female)"></rect>
        </g>

        <!-- MCU -->
        <rect x="43" y="17.55" fill="#000" width="13.5" height="13.5" rx="0.5" />

        <!-- Programming Headers -->
        <g transform="translate(61.5 21.09)">
          <rect width="4.80" height="7" fill="url(#pin-male)" />
        </g>

        <!-- LEDs -->
        <g transform="translate(72.20 15.58)">
          <use xlink:href="#led-body" />
          ${t&&i.JW`<circle cx="1.3" cy="0.55" r="1.3" fill="#80ff80" filter="url(#ledFilter)" />`}
        </g>

        <text fill="#fff">
          <tspan x="68" y="16.75">PWR</tspan>
        </text>

        <g transform="translate(26 13.86)">
          <use xlink:href="#led-body" />
          ${e&&i.JW`<circle cx="1.3" cy="0.55" r="1.3" fill="#ff8080" filter="url(#ledFilter)" />`}
        </g>

        <g transform="translate(26 18.52)">
          <use xlink:href="#led-body" />
          ${n&&i.JW`<circle cx="0.975" cy="0.55" r="1.3" fill="yellow" filter="url(#ledFilter)" />`}
        </g>

        <g transform="translate(26 20.75)">
          <use xlink:href="#led-body" />
          ${s&&i.JW`<circle cx="0.975" cy="0.55" r="1.3" fill="yellow" filter="url(#ledFilter)" />`}
        </g>

        <text fill="#fff">
          <tspan x="29.4" y="15">L</tspan>
          <tspan x="29.4" y="19.8">TX</tspan>
          <tspan x="29.4" y="22">RX</tspan>
          <tspan x="26.5" y="20"></tspan>
        </text>

        <!-- Pin Labels -->
        <rect x="28.27" y="7.6" width="31.5" height="0.16" fill="#fff"></rect>
        <text fill="#fff" style="font-weight: 900">
          <tspan x="40.84" y="9.8">PWM</tspan>
        </text>

        <rect x="60.5" y="11.8" width="25.4" height="0.16" fill="#fff"></rect>
        <text fill="#fff" style="font-weight: 900">
          <tspan x="65" y="14.2">COMMUNICATION</tspan>
        </text>

        <text
          transform="translate(22.6 3.4) rotate(270 0 0)"
          fill="#fff"
          style="font-size: 2px; text-anchor: end; font-family: monospace"
        >
          <tspan x="0" dy="2.54">AREF</tspan>
          <tspan x="0" dy="2.54">GND</tspan>
          <tspan x="0" dy="2.54">13</tspan>
          <tspan x="0" dy="2.54">12</tspan>
          <tspan x="0" dy="2.54">11</tspan>
          <tspan x="0" dy="2.54">10</tspan>
          <tspan x="0" dy="2.54">9</tspan>
          <tspan x="0" dy="2.54">8</tspan>
          <tspan x="0" dy="4.08">7</tspan>
          <tspan x="0" dy="2.54">6</tspan>
          <tspan x="0" dy="2.54">5</tspan>
          <tspan x="0" dy="2.54">4</tspan>
          <tspan x="0" dy="2.54">3</tspan>
          <tspan x="0" dy="2.54">2</tspan>
          <tspan x="0" dy="2.54">TX→ 1</tspan>
          <tspan x="0" dy="2.54">RX← 0</tspan>
          <tspan x="0" dy="3.34">TX3 14</tspan>
          <tspan x="0" dy="2.54">RX3 15</tspan>
          <tspan x="0" dy="2.54">TX2 16</tspan>
          <tspan x="0" dy="2.54">RX2 17</tspan>
          <tspan x="0" dy="2.54">TX1 18</tspan>
          <tspan x="0" dy="2.54">RX1 19</tspan>
          <tspan x="0" dy="2.54">SDA 20</tspan>
          <tspan x="0" dy="2.54">SCL 21</tspan>
          <tspan x="0" dy="2.54">&#160;</tspan>
        </text>

        <rect x="36" y="41.46" width="12.44" height="0.16" fill="#fff"></rect>
        <rect x="50" y="41.46" width="39" height="0.16" fill="#fff"></rect>
        <text fill="#fff" style="font-weight: 900">
          <tspan x="39" y="40.96">POWER</tspan>
          <tspan x="65" y="40.96">ANALOG IN</tspan>
        </text>
        <text transform="translate(30.19 47) rotate(270 0 0)" fill="#fff" style="font-weight: 700">
          <tspan x="0" dy="2.54">IOREF</tspan>
          <tspan x="0" dy="2.54">RESET</tspan>
          <tspan x="0" dy="2.54">3.3V</tspan>
          <tspan x="0" dy="2.54">5V</tspan>
          <tspan x="0" dy="2.54">GND</tspan>
          <tspan x="0" dy="2.54">GND</tspan>
          <tspan x="0" dy="2.54">Vin</tspan>
          <tspan x="0" dy="3.74">A0</tspan>
          <tspan x="0" dy="2.54">A1</tspan>
          <tspan x="0" dy="2.54">A2</tspan>
          <tspan x="0" dy="2.54">A3</tspan>
          <tspan x="0" dy="2.54">A4</tspan>
          <tspan x="0" dy="2.54">A5</tspan>
          <tspan x="0" dy="2.54">A6</tspan>
          <tspan x="0" dy="2.54">A7</tspan>
          <tspan x="0" dy="3.74">A8</tspan>
          <tspan x="0" dy="2.54">A9</tspan>
          <tspan x="0" dy="2.54">A10</tspan>
          <tspan x="0" dy="2.54">A11</tspan>
          <tspan x="0" dy="2.54">A12</tspan>
          <tspan x="0" dy="2.54">A13</tspan>
          <tspan x="0" dy="1.84">A14</tspan>
          <tspan x="0" dy="1.84">A15</tspan>
          <tspan x="0" dy="2.54"></tspan>
        </text>

        <!-- Logo -->
        <text x="51.85" y="36" style="font-size:4px;font-weight:bold;line-height:1.25;fill:#fff">
          Arduino MEGA
        </text>
      </svg>
    `}down(){this.resetPressed||(this.resetPressed=!0,this.resetButton.style.stroke="#333",this.dispatchEvent(new CustomEvent("button-press",{detail:"reset"})))}up(){this.resetPressed&&(this.resetPressed=!1,this.resetButton.style.stroke="",this.dispatchEvent(new CustomEvent("button-release",{detail:"reset"})))}leave(){this.resetButton.blur(),this.up()}};o([(0,n.MZ)()],h.prototype,"led13",void 0),o([(0,n.MZ)()],h.prototype,"ledRX",void 0),o([(0,n.MZ)()],h.prototype,"ledTX",void 0),o([(0,n.MZ)()],h.prototype,"ledPower",void 0),o([(0,n.MZ)()],h.prototype,"resetPressed",void 0),o([(0,n.P)("#reset-button")],h.prototype,"resetButton",void 0),h=o([(0,n.EM)("wokwi-arduino-mega")],h)},15399:(t,e,s)=>{s.d(e,{X:()=>o});var i=s(12618),n=s(52777),r=s(76860),a=s(33493),l=function(t,e,s,i){var n,r=arguments.length,a=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)a=Reflect.decorate(t,e,s,i);else for(var l=t.length-1;l>=0;l--)(n=t[l])&&(a=(r<3?n(a):r>3?n(e,s,a):n(e,s))||a);return r>3&&a&&Object.defineProperty(e,s,a),a};let o=class extends i.WF{constructor(){super(...arguments),this.led13=!1,this.ledRX=!1,this.ledTX=!1,this.ledPower=!1,this.resetPressed=!1,this.pinInfo=[{name:"12",x:19.7,y:4.8,signals:[(0,r.dg)("MISO")]},{name:"11",x:29.3,y:4.8,signals:[(0,r.dg)("MOSI"),{type:"pwm"}]},{name:"10",x:38.9,y:4.8,signals:[(0,r.dg)("SS"),{type:"pwm"}]},{name:"9",x:48.5,y:4.8,signals:[{type:"pwm"}]},{name:"8",x:58.1,y:4.8,signals:[]},{name:"7",x:67.7,y:4.8,signals:[]},{name:"6",x:77.3,y:4.8,signals:[{type:"pwm"}]},{name:"5",x:86.9,y:4.8,signals:[{type:"pwm"}]},{name:"4",x:96.5,y:4.8,signals:[]},{name:"3",x:106.1,y:4.8,signals:[{type:"pwm"}]},{name:"2",x:115.7,y:4.8,signals:[]},{name:"GND.2",x:125.3,y:4.8,signals:[{type:"power",signal:"GND"}]},{name:"RESET.2",x:134.9,y:4.8,signals:[]},{name:"0",x:144.5,y:4.8,signals:[(0,r._5)("TX")]},{name:"1",x:154.1,y:4.8,signals:[(0,r._5)("RX")]},{name:"13",x:19.7,y:62.4,signals:[(0,r.dg)("SCK")]},{name:"3.3V",x:29.3,y:62.4,signals:[{type:"power",signal:"VCC",voltage:3.3}]},{name:"AREF",x:38.9,y:62.4,signals:[]},{name:"A0",x:48.5,y:62.4,signals:[(0,r.$n)(0)]},{name:"A1",x:58.1,y:62.4,signals:[(0,r.$n)(1)]},{name:"A2",x:67.7,y:62.4,signals:[(0,r.$n)(2)]},{name:"A3",x:77.3,y:62.4,signals:[(0,r.$n)(3)]},{name:"A4",x:86.9,y:62.4,signals:[(0,r.$n)(4),(0,r.v2)("SDA")]},{name:"A5",x:96.5,y:62.4,signals:[(0,r.$n)(5),(0,r.v2)("SCL")]},{name:"A6",x:106.1,y:62.4,signals:[(0,r.$n)(6)]},{name:"A7",x:115.7,y:62.4,signals:[(0,r.$n)(7)]},{name:"5V",x:125.3,y:62.4,signals:[{type:"power",signal:"VCC",voltage:5}]},{name:"RESET",x:134.9,y:62.4,signals:[]},{name:"GND.1",x:144.5,y:62.4,signals:[{type:"power",signal:"GND"}]},{name:"VIN",x:154.1,y:62.4,signals:[{type:"power",signal:"VCC"}]},{name:"12.2",x:163.7,y:43.2,signals:[(0,r.dg)("MISO")],noBreadboard:!0},{name:"5V.2",x:154.1,y:43.2,signals:[{type:"power",signal:"VCC",voltage:5}],noBreadboard:!0},{name:"13.2",x:163.7,y:33.6,signals:[(0,r.dg)("SCK")],noBreadboard:!0},{name:"11.2",x:154.1,y:33.6,signals:[(0,r.dg)("MOSI"),{type:"pwm"}],noBreadboard:!0},{name:"RESET.3",x:163.7,y:24,signals:[],noBreadboard:!0},{name:"GND.3",x:154.1,y:24,signals:[{type:"power",signal:"GND"}],noBreadboard:!0}]}static get styles(){return i.AH`
      text {
        font-size: 1px;
        font-family: monospace;
        user-select: none;
      }

      circle[tabindex]:hover,
      circle[tabindex]:focus {
        stroke: white;
        outline: none;
      }
    `}render(){const{ledPower:t,led13:e,ledRX:s,ledTX:n}=this;return i.qy`
      <svg
        width="44.9mm"
        height="17.8mm"
        viewBox="-1.4 0 44.9 17.8"
        font-weight="bold"
        version="1.1"
        xmlns="http://www.w3.org/2000/svg"
        xmlns:xlink="http://www.w3.org/1999/xlink"
      >
        <defs>
          <filter id="solderPlate" style="color-interpolation-filters:sRGB;">
            <feTurbulence result="r0" type="fractalNoise" baseFrequency="1" numOctaves="1" />
            <feComposite
              result="r1"
              in="r0"
              in2="SourceGraphic"
              operator="arithmetic"
              k1=".6"
              k2=".6"
              k3="1.2"
              k4=".25"
            />
            <feBlend result="r2" in="r1" in2="SourceGraphic" mode="luminosity" />
            <feComposite result="r3" in="r2" in2="SourceGraphic" operator="in" />
          </filter>
          <pattern id="pins-tqfp-0.5mm" width="1" height=".5" patternUnits="userSpaceOnUse">
            <rect fill="#333" width="1" height=".2" y=".17" />
          </pattern>
          <pattern id="pins-pth-0.75" width="2.54" height="2.54" patternUnits="userSpaceOnUse">
            <circle r=".75" cx="1.27" cy="1.27" fill="#333" filter="url(#solderPlate)" />
            <g stroke="#333" stroke-width=".05" paint-order="stroke fill">
              <circle r=".375" cx="1.27" cy="1.27" fill="#eee" />
            </g>
          </pattern>
          <pattern id="pins-pth-1.00" width="2.54" height="2.54" patternUnits="userSpaceOnUse">
            <circle r=".75" cx="1.27" cy="1.27" fill="#333" filter="url(#solderPlate)" />
            <g stroke="#333" stroke-width=".05" paint-order="stroke fill">
              <circle r=".5" cx="1.27" cy="1.27" fill="#eee" />
            </g>
          </pattern>
          <g id="led-body" fill="#eee">
            <rect x="0" y="0" height="1.2" width="2.6" fill="#333" filter="url(#solderPlate)" />
            <rect x=".6" y="-0.1" width="1.35" height="1.4" stroke="#aaa" stroke-width=".05" />
          </g>
          <filter id="ledFilter" x="-0.8" y="-0.8" height="2.2" width="2.8">
            <feGaussianBlur stdDeviation=".5" />
          </filter>
        </defs>

        <!-- PCB -->
        <g id="pcb" fill="#fff">
          <rect width="43.5" height="17.8" x="0" y="0" fill="#1b7e84" />
          <circle cx="1" cy="1" r=".889" />
          <circle cx="42.42" cy="1" r=".889" />
          <circle cx="42.42" cy="16.6" r=".889" />
          <circle cx="1" cy="16.6" r=".889" />
        </g>

        <!-- silkscreen -->
        <g id="silkscreen" fill="#eee" text-anchor="middle">
          <rect x="30.48" y="0" width="2.54" height="3.2" />
          <rect x="35.56" y="14.6" width="2.54" height="3.2" />
          <g fill="#1b7e84" transform="translate(1.27 1.27)">
            <circle r=".85" cx="30.48" />
            <circle r=".85" cx="35.56" cy="15.24" />
          </g>
          <g transform="translate(1.27 3)">
            <text x="2.54">D12</text>
            <text x="5.08">D11</text>
            <text x="7.62">D10</text>
            <text x="10.16">D9</text>
            <text x="12.7">D8</text>
            <text x="15.24">D7</text>
            <text x="17.78">D6</text>
            <text x="20.32">D5</text>
            <text x="22.86">D4</text>
            <text x="25.4">D3</text>
            <text x="27.94">D2</text>
            <text x="30.48" fill="#1b7e84">GND</text>
            <text x="33.02">RST</text>
            <text x="35.56" font-size="200%">↓</text>
            <text x="35.56" y="1">RX0</text>
            <text x="38.1" font-size="200%">↑</text>
            <text x="38.1" y="1">TX1</text>
          </g>
          <g transform="translate(1.27 15.5)">
            <text x="2.54">D13</text>
            <text x="5.08">3V3</text>
            <text x="7.62">AREF</text>
            <text x="10.16">A0</text>
            <text x="12.7">A1</text>
            <text x="15.24">A2</text>
            <text x="17.78">A3</text>
            <text x="20.32">A4</text>
            <text x="22.86">A5</text>
            <text x="25.4">A6</text>
            <text x="27.94">A7</text>
            <text x="30.48">5V</text>
            <text x="33.02">RST</text>
            <text x="35.56" fill="#1b7e84">GND</text>
            <text x="38.1">VIN</text>
          </g>
          <g transform="rotate(90)">
            <text x="8.7" y="-22.5">RESET</text>
            <text x="5.6" y="-32.2">TX</text>
            <text x="5.6" y="-30.7" font-size="200%">↓</text>
            <text x="7.6" y="-32.2">RX</text>
            <text x="7.6" y="-30.7" font-size="200%">↑</text>
            <text x="9.6" y="-30.7">ON</text>
            <text x="11.6" y="-30.7">L</text>
          </g>
        </g>

        <!-- MCU -->
        <g id="mcu" transform="rotate(45 -2.978 23.39)">
          <g fill="url(#pins-tqfp-0.5mm)" filter="url(#solderPlate)">
            <rect x="-2.65" y="-1.975" width="5.3" height="3.95" />
            <rect x="-2.65" y="-1.975" width="5.3" height="3.95" transform="rotate(90)" />
          </g>
          <rect x="-2.275" y="-2.275" width="4.55" height="4.55" fill="#444" />
          <circle transform="rotate(45)" cx=".012" cy="-2.5" r=".35" fill="#222" />
        </g>

        <!-- pins -->
        <g id="pins" fill="url(#pins-pth-0.75)">
          <g id="pins-pin1" fill="#333" filter="url(#solderPlate)">
            <rect x="${38.495}" y="${.395}" width="1.75" height="1.75" />
            <rect x="${38.495}" y="${16.51-.875}" width="1.75" height="1.75" />
          </g>
          <rect x="2.54" width="${38.1}" height="2.54" />
          <rect x="2.54" y="${15.24}" width="${38.1}" height="2.54" />
        </g>

        <!-- programming header -->
        <g id="pgm-header" fill="url(#pins-pth-1.00)" stroke="#eee" stroke-width=".1">
          <g id="pgm-pin1" stroke="none" fill="#333" filter="url(#solderPlate)">
            <rect x="${16.5*2.54-.875}" y="${10.555}" width="1.75" height="1.75" />
          </g>
          <rect x="${38.1}" y="${5.08}" width="${5.08}" height="${7.62}" />
        </g>

        <!-- USB mini type B -->
        <g id="usb-mini-b" stroke-width=".1" paint-order="stroke fill">
          <g fill="#333" filter="url(#solderPlate)">
            <rect x=".3" y="3.8" width="1.6" height="9.8" />
            <rect x="5.5" y="3.8" width="1.6" height="9.8" />
            <rect x="7.3" y="7.07" width="1.1" height=".48" />
            <rect x="7.3" y="7.82" width="1.1" height=".48" />
            <rect x="7.3" y="8.58" width="1.1" height=".48" />
            <rect x="7.3" y="9.36" width="1.1" height=".48" />
            <rect x="7.3" y="10.16" width="1.1" height=".48" />
          </g>
          <rect x="-1.4" y="4.8" width="8.9" height="7.8" fill="#999" stroke-width=".26" />
          <rect x="-1.25" y="5" width="8.6" height="7.4" fill="#ccc" stroke="#bbb" />
          <g fill="none" stroke="#333" stroke-width=".26" stroke-linecap="round">
            <path d="m2.6 5.9h-3.3v0.9h3.3m0 3.7h-3.3v0.9h3.3M-0.6 7.6l4.3 0.3v1.5l-4.3 0.3" />
            <path d="m3.3 7.9v1.5" stroke-width="1" stroke-linecap="butt" />
            <path d="m6 6.4v4.5" stroke-width=".35" />
          </g>
        </g>

        <!-- LEDs -->
        <g transform="translate(27.7 5)">
          <use xlink:href="#led-body" />
          ${n&&i.JW`<circle cx="1.3" cy=".55" r="1.3" fill="#ff8080" filter="url(#ledFilter)" />`}
        </g>
        <g transform="translate(27.7 7)">
          <use xlink:href="#led-body" />
          ${s&&i.JW`<circle cx="1.3" cy=".55" r="1.3" fill="#80ff80" filter="url(#ledFilter)" />`}
        </g>
        <g transform="translate(27.7 9)">
          <use xlink:href="#led-body" />
          ${t&&i.JW`<circle cx="1.3" cy=".55" r="1.3" fill="#80ff80" filter="url(#ledFilter)" />`}
        </g>
        <g transform="translate(27.7 11)">
          <use xlink:href="#led-body" />
          ${e&&i.JW`<circle cx="1.3" cy=".55" r="1.3" fill="#ffff80" filter="url(#ledFilter)" />`}
        </g>

        <!-- reset button -->
        <g stroke-width=".1" paint-order="fill stroke">
          <rect x="24.3" y="6.3" width="1" height="4.8" filter="url(#solderPlate)" fill="#333" />
          <rect x="23.54" y="6.8" width="2.54" height="3.8" fill="#ccc" stroke="#888" />
          <circle
            id="reset-button"
            cx="24.8"
            cy="8.7"
            r="1"
            fill="#eeb"
            stroke="#777"
            tabindex="0"
            @mousedown=${()=>this.down()}
            @touchstart=${()=>this.down()}
            @mouseup=${()=>this.up()}
            @mouseleave=${()=>this.leave()}
            @touchend=${()=>this.leave()}
            @keydown=${t=>a.ed.includes(t.key)&&this.down()}
            @keyup=${t=>a.ed.includes(t.key)&&this.up()}
          />
        </g>
      </svg>
    `}down(){this.resetPressed||(this.resetPressed=!0,this.resetButton.style.stroke="#333",this.dispatchEvent(new CustomEvent("button-press",{detail:"reset"})))}up(){this.resetPressed&&(this.resetPressed=!1,this.resetButton.style.stroke="",this.dispatchEvent(new CustomEvent("button-release",{detail:"reset"})))}leave(){this.resetButton.blur(),this.up()}};l([(0,n.MZ)()],o.prototype,"led13",void 0),l([(0,n.MZ)()],o.prototype,"ledRX",void 0),l([(0,n.MZ)()],o.prototype,"ledTX",void 0),l([(0,n.MZ)()],o.prototype,"ledPower",void 0),l([(0,n.MZ)()],o.prototype,"resetPressed",void 0),l([(0,n.P)("#reset-button")],o.prototype,"resetButton",void 0),o=l([(0,n.EM)("wokwi-arduino-nano")],o)},57895:(t,e,s)=>{s.d(e,{t:()=>h});var i=s(12618),n=s(52777),r=s(70300),a=s(76860),l=s(33493),o=function(t,e,s,i){var n,r=arguments.length,a=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)a=Reflect.decorate(t,e,s,i);else for(var l=t.length-1;l>=0;l--)(n=t[l])&&(a=(r<3?n(a):r>3?n(e,s,a):n(e,s))||a);return r>3&&a&&Object.defineProperty(e,s,a),a};let h=class extends i.WF{constructor(){super(...arguments),this.led13=!1,this.ledRX=!1,this.ledTX=!1,this.ledPower=!1,this.resetPressed=!1,this.pinInfo=[{name:"A5.2",x:87,y:9,signals:[(0,a.$n)(5),(0,a.v2)("SCL")]},{name:"A4.2",x:97,y:9,signals:[(0,a.$n)(4),(0,a.v2)("SDA")]},{name:"AREF",x:106,y:9,signals:[]},{name:"GND.1",x:115.5,y:9,signals:[{type:"power",signal:"GND"}]},{name:"13",x:125,y:9,signals:[(0,a.dg)("SCK")]},{name:"12",x:134.5,y:9,signals:[(0,a.dg)("MISO")]},{name:"11",x:144,y:9,signals:[(0,a.dg)("MOSI"),{type:"pwm"}]},{name:"10",x:153.5,y:9,signals:[(0,a.dg)("SS"),{type:"pwm"}]},{name:"9",x:163,y:9,signals:[{type:"pwm"}]},{name:"8",x:173,y:9,signals:[]},{name:"7",x:189,y:9,signals:[]},{name:"6",x:198.5,y:9,signals:[{type:"pwm"}]},{name:"5",x:208,y:9,signals:[{type:"pwm"}]},{name:"4",x:217.5,y:9,signals:[]},{name:"3",x:227,y:9,signals:[{type:"pwm"}]},{name:"2",x:236.5,y:9,signals:[]},{name:"1",x:246,y:9,signals:[(0,a._5)("TX")]},{name:"0",x:255.5,y:9,signals:[(0,a._5)("RX")]},{name:"IOREF",x:131,y:191.5,signals:[]},{name:"RESET",x:140.5,y:191.5,signals:[]},{name:"3.3V",x:150,y:191.5,signals:[{type:"power",signal:"VCC",voltage:3.3}]},{name:"5V",x:160,y:191.5,signals:[{type:"power",signal:"VCC",voltage:5}]},{name:"GND.2",x:169.5,y:191.5,signals:[{type:"power",signal:"GND"}]},{name:"GND.3",x:179,y:191.5,signals:[{type:"power",signal:"GND"}]},{name:"VIN",x:188.5,y:191.5,signals:[{type:"power",signal:"VCC"}]},{name:"A0",x:208,y:191.5,signals:[(0,a.$n)(0)]},{name:"A1",x:217.5,y:191.5,signals:[(0,a.$n)(1)]},{name:"A2",x:227,y:191.5,signals:[(0,a.$n)(2)]},{name:"A3",x:236.5,y:191.5,signals:[(0,a.$n)(3)]},{name:"A4",x:246,y:191.5,signals:[(0,a.$n)(4),(0,a.v2)("SDA")]},{name:"A5",x:255.5,y:191.5,signals:[(0,a.$n)(5),(0,a.v2)("SCL")]}]}static get styles(){return i.AH`
      text {
        font-size: 2px;
        font-family: monospace;
        user-select: none;
      }

      circle[tabindex]:hover,
      circle[tabindex]:focus {
        stroke: white;
        outline: none;
      }
    `}render(){const{ledPower:t,led13:e,ledRX:s,ledTX:n}=this;return i.qy`
      <svg
        width="72.58mm"
        height="53.34mm"
        version="1.1"
        viewBox="-4 0 72.58 53.34"
        xmlns="http://www.w3.org/2000/svg"
        xmlns:xlink="http://www.w3.org/1999/xlink"
      >
        <defs>
          <g id="led-body" fill="#eee">
            <rect x="0" y="0" height="1.2" width="2.6" fill="#c6c6c6" />
            <rect x="0.6" y="-0.1" width="1.35" height="1.4" stroke="#aaa" stroke-width="0.05" />
          </g>
        </defs>

        <filter id="ledFilter" x="-0.8" y="-0.8" height="2.2" width="2.8">
          <feGaussianBlur stdDeviation="0.5" />
        </filter>

        ${r.h}

        <pattern id="pin-male" width="2.54" height="4.80" patternUnits="userSpaceOnUse">
          <rect ry="0.3" rx="0.3" width="2.12" height="4.80" fill="#565656" />
          <ellipse cx="1" cy="1.13" rx="0.5" ry="0.5" fill="#aaa"></ellipse>
          <ellipse cx="1" cy="3.67" rx="0.5" ry="0.5" fill="#aaa"></ellipse>
        </pattern>

        <pattern id="mcu-leads" width="2.54" height="0.508" patternUnits="userSpaceOnUse">
          <path
            d="M 0.254,0 C 0.114,0 0,0.114 0,0.254 v 0 c 0,0.139 0,0.253 0,0.253 h 1.523 c 0,0 0,-0.114 0,-0.253 v 0 C 1.523,0.114 1.409,0 1.269,0 Z"
            fill="#ddd"
          />
        </pattern>

        <!-- PCB -->
        <path
          d="m0.999 0a1 1 0 0 0-0.999 0.999v51.34a1 1 0 0 0 0.999 0.999h64.04a1 1 0 0 0 0.999-0.999v-1.54l2.539-2.539v-32.766l-2.539-2.539v-11.43l-1.524-1.523zm14.078 0.835h0.325l0.212 0.041h0l0.105 0.021 0.300 0.124 0.270 0.180 0.229 0.229 0.180 0.270 0.017 0.042 0.097 0.234 0.01 0.023 0.050 0.252 0.013 0.066v0.325l-0.063 0.318-0.040 0.097-0.083 0.202-0 0.001-0.180 0.270-0.229 0.229-0.270 0.180-0.300 0.124-0.106 0.020-0.212 0.042h-0.325l-0.212-0.042-0.106-0.020-0.300-0.124-0.270-0.180-0.229-0.229-0.180-0.270-0 -0.001-0.083-0.202-0.040-0.097-0.063-0.318v-0.325l0.013-0.066 0.050-0.252 0.01-0.023 0.097-0.234 0.017-0.042 0.180-0.270 0.229-0.229 0.270-0.180 0.300-0.124 0.105-0.021zm50.799 15.239h0.325l0.212 0.042 0.105 0.021 0.300 0.124 0.270 0.180 0.229 0.229 0.180 0.270 0.014 0.035 0.110 0.264 0.01 0.051 0.053 0.267v0.325l-0.03 0.152-0.033 0.166-0.037 0.089-0.079 0.191-0 0.020-0.180 0.270-0.229 0.229-0.270 0.180-0.071 0.029-0.228 0.094-0.106 0.021-0.212 0.042h-0.325l-0.212-0.042-0.106-0.021-0.228-0.094-0.071-0.029-0.270-0.180-0.229-0.229-0.180-0.270-0 -0.020-0.079-0.191-0.036-0.089-0.033-0.166-0.030-0.152v-0.325l0.053-0.267 0.010-0.051 0.109-0.264 0.014-0.035 0.180-0.270 0.229-0.229 0.270-0.180 0.300-0.124 0.105-0.021zm0 27.94h0.325l0.180 0.036 0.138 0.027 0.212 0.087 0.058 0.024 0.029 0.012 0.270 0.180 0.229 0.229 0.180 0.270 0.124 0.300 0.063 0.319v0.325l-0.063 0.318-0.124 0.300-0.180 0.270-0.229 0.229-0.270 0.180-0.300 0.124-0.106 0.021-0.212 0.042h-0.325l-0.212-0.042-0.105-0.021-0.300-0.124-0.270-0.180-0.229-0.229-0.180-0.270-0.124-0.300-0.063-0.318v-0.325l0.063-0.319 0.124-0.300 0.180-0.270 0.229-0.229 0.270-0.180 0.029-0.012 0.058-0.024 0.212-0.087 0.137-0.027zm-52.07 5.080h0.325l0.212 0.041 0.106 0.021 0.300 0.124 0.270 0.180 0.229 0.229 0.121 0.182 0.058 0.087h0l0.114 0.275 0.01 0.023 0.063 0.318v0.325l-0.035 0.179-0.027 0.139-0.01 0.023-0.114 0.275h-0l-0.180 0.270-0.229 0.229-0.270 0.180-0.300 0.124-0.106 0.020-0.212 0.042h-0.325l-0.212-0.042-0.105-0.020-0.300-0.124-0.270-0.180-0.229-0.229-0.180-0.270-0.114-0.275-0.01-0.023-0.027-0.139-0.036-0.179v-0.325l0.063-0.318 0.01-0.023 0.114-0.275 0.058-0.087 0.121-0.182 0.229-0.229 0.270-0.180 0.300-0.124 0.105-0.021z"
          fill="#2b6b99"
        />

        <!-- reset button -->
        <rect x="3.816" y="1.4125" width="6.2151" height="6.0268" fill="#9b9b9b" />
        <g fill="#e6e6e6">
          <rect x="2.1368" y="1.954" width="1.695" height=".84994" />
          <rect x="2.121" y="3.8362" width="1.695" height=".84994" />
          <rect x="2.0974" y="5.8608" width="1.695" height=".84994" />
          <rect x="10.031" y="6.0256" width="1.695" height=".84994" />
          <rect x="10.008" y="1.9528" width="1.695" height=".84994" />
        </g>
        <circle
          id="reset-button"
          cx="6.9619"
          cy="4.5279"
          r="1.5405"
          fill="#960000"
          stroke="#777"
          stroke-width="0.15"
          tabindex="0"
          @mousedown=${()=>this.down()}
          @touchstart=${()=>this.down()}
          @mouseup=${()=>this.up()}
          @mouseleave=${()=>this.leave()}
          @touchend=${()=>this.leave()}
          @keydown=${t=>l.ed.includes(t.key)&&this.down()}
          @keyup=${t=>l.ed.includes(t.key)&&this.up()}
        />

        <!-- USB Connector -->
        <g style="fill:#b3b2b2;stroke:#b3b2b2;stroke-width:0.010">
          <ellipse cx="3.84" cy="9.56" rx="1.12" ry="1.03" />
          <ellipse cx="3.84" cy="21.04" rx="1.12" ry="1.03" />
          <g fill="#000">
            <rect width="11" height="11.93" x="-0.05" y="9.72" rx="0.2" ry="0.2" opacity="0.24" />
          </g>
          <rect x="-4" y="9.37" height="11.85" width="14.46" />
          <rect x="-4" y="9.61" height="11.37" width="14.05" fill="#706f6f" />
          <rect x="-4" y="9.71" height="11.17" width="13.95" fill="#9d9d9c" />
        </g>

        <!-- Power jack -->
        <g stroke-width=".254" fill="black">
          <path
            d="m-2.58 48.53v2.289c0 0.279 0.228 0.508 0.508 0.508h1.722c0.279 0 0.508-0.228 0.508-0.508v-2.289z"
            fill="#252728"
            opacity=".3"
          />
          <path
            d="m11.334 42.946c0-0.558-0.509-1.016-1.132-1.016h-10.043v9.652h10.043c0.622 0 1.132-0.457 1.132-1.016z"
            opacity=".3"
          />
          <path
            d="m-2.072 40.914c-0.279 0-0.507 0.204-0.507 0.454v8.435c0 0.279 0.228 0.507 0.507 0.507h1.722c0.279 0 0.507-0.228 0.507-0.507v-8.435c0-0.249-0.228-0.454-0.507-0.454z"
          />
          <path
            d="m-2.58 48.784v1.019c0 0.279 0.228 0.508 0.508 0.508h1.722c0.279 0 0.508-0.228 0.508-0.508v-1.019z"
            opacity=".3"
          />
          <path
            d="m11.334 43.327c0.139 0 0.254 0.114 0.254 0.254v4.064c0 0.139-0.114 0.254-0.254 0.254"
          />
          <path
            d="m11.334 42.438c0-0.558-0.457-1.016-1.016-1.016h-10.16v8.382h10.16c0.558 0 1.016-0.457 1.016-1.016z"
          />
          <path
            d="m10.064 49.804h-9.906v-8.382h1.880c-1.107 0-1.363 1.825-1.363 3.826 0 1.765 1.147 3.496 3.014 3.496h6.374z"
            opacity=".3"
          />
          <rect x="10.064" y="41.422" width=".254" height="8.382" fill="#ffffff" opacity=".2" />
          <path
            d="m10.318 48.744v1.059c0.558 0 1.016-0.457 1.016-1.016v-0.364c0 0.313-1.016 0.320-1.016 0.320z"
            opacity=".3"
          />
        </g>

        <!-- Pin Headers -->
        <g transform="translate(17.497 1.27)">
          <rect width="${.38+25.4}" height="2.54" fill="url(#pins-female)"></rect>
        </g>
        <g transform="translate(44.421 1.27)">
          <rect width="${20.7}" height="2.54" fill="url(#pins-female)"></rect>
        </g>
        <g transform="translate(26.641 49.53)">
          <rect width="${20.7}" height="2.54" fill="url(#pins-female)"></rect>
        </g>
        <g transform="translate(49.501 49.53)">
          <rect width="${.38+15.24}" height="2.54" fill="url(#pins-female)"></rect>
        </g>

        <!-- MCU -->
        <g>
          <path
            d="m64.932 41.627h-36.72c-0.209 0-0.379-0.170-0.379-0.379v-8.545c0-0.209 0.170-0.379 0.379-0.379h36.72c0.209 0 0.379 0.170 0.379 0.379v8.545c0 0.209-0.169 0.379-0.379 0.379z"
            fill="#292c2d"
          />
          <path
            d="m65.019 40.397c0 0.279-0.228 0.508-0.508 0.508h-35.879c-0.279 0-0.507 0.025-0.507-0.254v-6.338c0-0.279 0.228-0.508 0.507-0.508h35.879c0.279 0 0.508 0.228 0.508 0.508z"
            opacity=".3"
          />
          <path
            d="m65.019 40.016c0 0.279-0.228 0.508-0.508 0.508h-35.879c-0.279 0-0.507 0.448-0.507-0.508v-6.084c0-0.279 0.228-0.508 0.507-0.508h35.879c0.279 0 0.508 0.228 0.508 0.508z"
            fill="#3c4042"
          />
          <rect
            transform="translate(29.205, 32.778)"
            fill="url(#mcu-leads)"
            height="0.508"
            width="35.56"
          ></rect>
          <rect
            transform="translate(29.205, 41.159) scale(1 -1)"
            fill="url(#mcu-leads)"
            height="0.508"
            width="35.56"
          ></rect>
          <g fill="#252728">
            <circle cx="33.269" cy="36.847" r="1" />
            <circle cx="59.939" cy="36.847" r="1" />
            <path d="M65 38.05a1.13 1.13 0 010-2.26v2.27z" />
          </g>
        </g>

        <!-- Programming Headers -->
        <g transform="translate(14.1 4.4)">
          <rect width="7" height="4.80" fill="url(#pin-male)" />
        </g>

        <g transform="translate(63 27.2) rotate(270 0 0)">
          <rect width="7" height="4.80" fill="url(#pin-male)" />
        </g>

        <!-- LEDs -->
        <g transform="translate(57.3, 16.21)">
          <use xlink:href="#led-body" />
          ${t&&i.JW`<circle cx="1.3" cy="0.55" r="1.3" fill="#80ff80" filter="url(#ledFilter)" />`}
        </g>

        <text fill="#fff">
          <tspan x="60.88" y="17.5">ON</tspan>
        </text>

        <g transform="translate(26.87,11.69)">
          <use xlink:href="#led-body" />
          ${e&&i.JW`<circle cx="1.3" cy="0.55" r="1.3" fill="#ff8080" filter="url(#ledFilter)" />`}
        </g>

        <g transform="translate(26.9, 16.2)">
          <use xlink:href="#led-body" />
          ${n&&i.JW`<circle cx="0.975" cy="0.55" r="1.3" fill="yellow" filter="url(#ledFilter)" />`}
        </g>

        <g transform="translate(26.9, 18.5)">
          <use xlink:href="#led-body" />
          ${s&&i.JW`<circle cx="0.975" cy="0.55" r="1.3" fill="yellow" filter="url(#ledFilter)" />`}
        </g>

        <text fill="#fff" style="text-anchor: end">
          <tspan x="26.5" y="13">L</tspan>
          <tspan x="26.5" y="17.5">TX</tspan>
          <tspan x="26.5" y="19.8">RX</tspan>
          <tspan x="26.5" y="20">&#160;</tspan>
        </text>

        <!-- Pin Labels -->
        <rect x="28.27" y="10.34" width="36.5" height="0.16" fill="#fff"></rect>
        <text fill="#fff" style="font-weight: 900">
          <tspan x="40.84" y="9.48">DIGITAL (PWM ~)</tspan>
        </text>
        <text
          transform="translate(22.6 4) rotate(270 0 0)"
          fill="#fff"
          style="font-size: 2px; text-anchor: end; font-family: monospace"
        >
          <tspan x="0" dy="2.54">AREF</tspan>
          <tspan x="0" dy="2.54">GND</tspan>
          <tspan x="0" dy="2.54">13</tspan>
          <tspan x="0" dy="2.54">12</tspan>
          <tspan x="0" dy="2.54">~11</tspan>
          <tspan x="0" dy="2.54">~10</tspan>
          <tspan x="0" dy="2.54">~9</tspan>
          <tspan x="0" dy="2.54">8</tspan>
          <tspan x="0" dy="4.08">7</tspan>
          <tspan x="0" dy="2.54">~6</tspan>
          <tspan x="0" dy="2.54">~5</tspan>
          <tspan x="0" dy="2.54">4</tspan>
          <tspan x="0" dy="2.54">~3</tspan>
          <tspan x="0" dy="2.54">2</tspan>
          <tspan x="0" dy="2.54">TX→1</tspan>
          <tspan x="0" dy="2.54">RX←0</tspan>
          <tspan x="0" dy="2.54">&#160;</tspan>
        </text>

        <rect x="33.90" y="42.76" width="12.84" height="0.16" fill="#fff"></rect>
        <rect x="49.48" y="42.76" width="14.37" height="0.16" fill="#fff"></rect>
        <text fill="#fff" style="font-weight: 900">
          <tspan x="41" y="44.96">POWER</tspan>
          <tspan x="53.5" y="44.96">ANALOG IN</tspan>
        </text>
        <text transform="translate(29.19 49) rotate(270 0 0)" fill="#fff" style="font-weight: 700">
          <tspan x="0" dy="2.54">IOREF</tspan>
          <tspan x="0" dy="2.54">RESET</tspan>
          <tspan x="0" dy="2.54">3.3V</tspan>
          <tspan x="0" dy="2.54">5V</tspan>
          <tspan x="0" dy="2.54">GND</tspan>
          <tspan x="0" dy="2.54">GND</tspan>
          <tspan x="0" dy="2.54">Vin</tspan>
          <tspan x="0" dy="4.54">A0</tspan>
          <tspan x="0" dy="2.54">A1</tspan>
          <tspan x="0" dy="2.54">A2</tspan>
          <tspan x="0" dy="2.54">A3</tspan>
          <tspan x="0" dy="2.54">A4</tspan>
          <tspan x="0" dy="2.54">A5</tspan>
        </text>

        <!-- Logo -->
        <path
          style="fill:none;stroke:#fff;stroke-width:1.03"
          d="m 34.21393,12.01079 c -1.66494,-0.13263 -3.06393,1.83547 -2.37559,3.36182 0.66469,1.65332 3.16984,2.10396 4.36378,0.77797 1.15382,-1.13053 1.59956,-2.86476 3.00399,-3.75901 1.43669,-0.9801 3.75169,-0.0547 4.02384,1.68886 0.27358,1.66961 -1.52477,3.29596 -3.15725,2.80101 -1.20337,-0.27199 -2.06928,-1.29866 -2.56193,-2.37788 -0.6046,-1.0328 -1.39499,-2.13327 -2.62797,-2.42367 -0.2191,-0.0497 -0.44434,-0.0693 -0.66887,-0.0691 z"
        />
        <path
          style="fill:none;stroke:#fff;stroke-width:0.56"
          d="m 39.67829,14.37519 h 1.75141 m -0.89321,-0.8757 v 1.7514 m -7.30334,-0.8757 h 2.10166"
        />
        <text x="31" y="20.2" style="font-size:2.8px;font-weight:bold;line-height:1.25;fill:#fff">
          ARDUINO
        </text>

        <rect
          style="fill:none;stroke:#fff;stroke-width:0.1;stroke-dasharray:0.1, 0.1"
          width="11"
          height="5.45"
          x="45.19"
          y="11.83"
          rx="1"
          ry="1"
        />

        <text x="46.5" y="16" style="font-size:5px; line-height:1.25" fill="#fff">UNO</text>
      </svg>
    `}down(){this.resetPressed||(this.resetPressed=!0,this.resetButton.style.stroke="#333",this.dispatchEvent(new CustomEvent("button-press",{detail:"reset"})))}up(){this.resetPressed&&(this.resetPressed=!1,this.resetButton.style.stroke="",this.dispatchEvent(new CustomEvent("button-release",{detail:"reset"})))}leave(){this.resetButton.blur(),this.up()}};o([(0,n.MZ)()],h.prototype,"led13",void 0),o([(0,n.MZ)()],h.prototype,"ledRX",void 0),o([(0,n.MZ)()],h.prototype,"ledTX",void 0),o([(0,n.MZ)()],h.prototype,"ledPower",void 0),o([(0,n.MZ)()],h.prototype,"resetPressed",void 0),o([(0,n.P)("#reset-button")],h.prototype,"resetButton",void 0),h=o([(0,n.EM)("wokwi-arduino-uno")],h)},94591:(t,e,s)=>{s.d(e,{Z:()=>a});var i=s(12618),n=s(52777),r=function(t,e,s,i){var n,r=arguments.length,a=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)a=Reflect.decorate(t,e,s,i);else for(var l=t.length-1;l>=0;l--)(n=t[l])&&(a=(r<3?n(a):r>3?n(e,s,a):n(e,s))||a);return r>3&&a&&Object.defineProperty(e,s,a),a};let a=class extends i.WF{constructor(){super(...arguments),this.hasSignal=!1,this.pinInfo=[{name:"1",x:27,y:84,signals:[]},{name:"2",x:37,y:84,signals:[]}]}static get styles(){return i.AH`
      :host {
        display: inline-block;
      }

      .buzzer-container {
        display: flex;
        flex-direction: column;
        width: 75px;
      }

      .music-note {
        position: relative;
        left: 40px;
        animation-duration: 1.5s;
        animation-name: animate-note;
        animation-iteration-count: infinite;
        animation-timing-function: linear;
        transform: scale(1.5);
        fill: blue;
        offset-path: path(
          'm0 0c-0.9-0.92-1.8-1.8-2.4-2.8-0.56-0.92-0.78-1.8-0.58-2.8 0.2-0.92 0.82-1.8 1.6-2.8 0.81-0.92 1.8-1.8 2.6-2.8 0.81-0.92 1.4-1.8 1.6-2.8 0.2-0.92-0.02-1.8-0.58-2.8-0.56-0.92-1.5-1.8-2.4-2.8'
        );
        offset-rotate: 0deg;
      }

      @keyframes animate-note {
        0% {
          offset-distance: 0%;
          opacity: 0;
        }
        10% {
          offset-distance: 10%;
          opacity: 1;
        }
        75% {
          offset-distance: 75%;
          opacity: 1;
        }
        100% {
          offset-distance: 100%;
          opacity: 0;
        }
      }
    `}renderSVG(){return i.qy`<svg
      width="17mm"
      height="20mm"
      version="1.1"
      viewBox="0 0 17 20"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="m7.23 16.5v3.5" fill="none" stroke="#000" stroke-width=".5" />
      <path d="m9.77 16.5v3.5" fill="#f00" stroke="#f00" stroke-width=".5" />
      <g stroke="#000">
        <g>
          <ellipse cx="8.5" cy="8.5" rx="8.15" ry="8.15" fill="#1a1a1a" stroke-width=".7" />
          <circle
            cx="8.5"
            cy="8.5"
            r="6.3472"
            fill="none"
            stroke-width=".3"
            style="paint-order:normal"
          />
          <circle
            cx="8.5"
            cy="8.5"
            r="4.3488"
            fill="none"
            stroke-width=".3"
            style="paint-order:normal"
          />
        </g>
        <circle cx="8.5" cy="8.5" r="1.3744" fill="#ccc" stroke-width=".25" />
      </g>
    </svg>`}render(){const t=this.hasSignal;return i.qy`
      <div class="buzzer-container">
        <svg
          class="music-note"
          style="visibility: ${t?"":"hidden"}"
          xmlns="http://www.w3.org/2000/svg"
          width="8"
          height="8"
          viewBox="0 0 8 8"
        >
          <path
            d="M8 0c-5 0-6 1-6 1v4.09c-.15-.05-.33-.09-.5-.09-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5v-3.97c.73-.23 1.99-.44 4-.5v2.06c-.15-.05-.33-.09-.5-.09-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5v-5.5z"
          />
        </svg>
        ${this.renderSVG()}
      </div>
    `}};r([(0,n.MZ)()],a.prototype,"hasSignal",void 0),a=r([(0,n.EM)("wokwi-buzzer")],a)},42569:(t,e,s)=>{s.d(e,{d:()=>a});var i=s(12618),n=s(52777),r=s(76860);let a=class extends i.WF{constructor(){super(...arguments),this.pinInfo=[{name:"GND",y:87.75,x:20.977,number:1,signals:[(0,r.SW)()]},{name:"VCC",y:87.75,x:30.578,number:2,signals:[(0,r.jc)()]},{name:"DAT",y:87.75,x:40.18,number:3,signals:[]}]}render(){return i.qy`
      <svg
        version="1.1"
        viewBox="0 0 61.1 88.7"
        width="16.178mm"
        height="23.482mm"
        font-family="sans-serif"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g fill="#171514">
          <path
            d="m61.1 4.85c0-2.68-2.17-4.85-4.85-4.85h-51.4c-2.68 0-4.85 2.17-4.85 4.85v61c0 2.68 2.17 4.85 4.85 4.85h51.4c2.68 0 4.85-2.17 4.85-4.85zm-7.43 53.3c2.29 0 4.14 1.86 4.14 4.14 0 2.28-1.85 4.14-4.14 4.14s-4.14-1.86-4.14-4.14c0-2.29 1.85-4.14 4.14-4.14zm-46.3 0c2.29 0 4.14 1.86 4.14 4.14 0 2.28-1.85 4.14-4.14 4.14-2.29 0-4.14-1.86-4.14-4.14 0-2.29 1.85-4.14 4.14-4.14z"
            stroke-width=".987"
          />
          <rect x="16.5" y="58.2" width="28.2" height="8.28" stroke="#fff" stroke-width=".888px" />
          <rect x="14.2" y="23" width="11.3" height="4.66" stroke="#fff" stroke-width=".888px" />
        </g>
        <rect x="15.2" y="23.7" width="9.44" height="3.23" fill="#a19e9e" stroke-width=".987" />
        <g fill="#171514" stroke="#fff" stroke-width=".888px">
          <rect x="14.2" y="33" width="11.3" height="4.66" />
          <rect x="31.6" y="23" width="11.3" height="4.66" />
          <rect x="31.6" y="33" width="11.3" height="4.66" />
        </g>
        <g fill="#433b38" stroke-width=".987">
          <rect x="17.7" y="59.1" width="6.47" height="6.47" />
          <rect x="27.3" y="59.1" width="6.47" height="6.47" />
          <rect x="37" y="59.1" width="6.47" height="6.47" />
        </g>
        <g fill="#9f9f9f" stroke-width=".987">
          <path
            d="m22.4 62.5c0-0.377-0.149-0.739-0.416-1.01-0.268-0.267-0.629-0.417-1.01-0.417-0.377 0-0.739 0.15-1.01 0.417s-0.417 0.629-0.417 1.01v25.8c0 0.231 0.188 0.419 0.418 0.419h2.01c0.231 0 0.418-0.188 0.418-0.419v-25.8z"
          />
          <path
            d="m32 62.5c0-0.377-0.149-0.739-0.416-1.01-0.268-0.267-0.629-0.417-1.01-0.417-0.377 0-0.739 0.15-1.01 0.417s-0.417 0.629-0.417 1.01v25.8c0 0.231 0.188 0.419 0.418 0.419h2.01c0.231 0 0.418-0.188 0.418-0.419v-25.8z"
          />
          <path
            d="m41.6 62.5c0-0.377-0.15-0.739-0.417-1.01s-0.629-0.417-1.01-0.417c-0.377 0-0.739 0.15-1.01 0.417s-0.417 0.629-0.417 1.01v25.8c0 0.231 0.188 0.419 0.419 0.419h2.01c0.231 0 0.419-0.188 0.419-0.419v-25.8z"
          />
        </g>
        <text transform="rotate(90)" fill="#ffffff" font-size="5px">
          <tspan x="45.369" y="-37.601">DAT</tspan>
          <tspan x="45.609" y="-28.801">VCC</tspan>
          <tspan x="45.359" y="-20.2">GND</tspan>
          <text font-size="5.71px">
            <tspan
              x="16.234 18.076 22.422 24.263 28.608 32.018 35.112 36.639 40.05 43.144 46.553"
              y="-52.266"
            >
              IR Reciever
            </tspan>
          </text>
        </text>
        <g fill="none" stroke="#fff">
          <path
            d="m56.3 6.32c-0.654 0.514-1.48 0.82-2.37 0.82-0.895 0-1.72-0.306-2.37-0.82"
            stroke-width=".316px"
          />
          <path
            d="m57.4 7.97c-0.949 0.745-2.14 1.19-3.44 1.19-1.3 0-2.49-0.445-3.44-1.19"
            stroke-width=".395px"
          />
          <path
            d="m58.9 9.32c-1.38 1.08-3.11 1.73-5 1.73s-3.62-0.646-5-1.73"
            stroke-width=".395px"
          />
        </g>
        <path
          d="m20.4 10.2h-6.13c-0.382 0-0.691 0.309-0.691 0.691v6.2c0 0.382 0.309 0.691 0.691 0.691h13c0.931 0.0563 1.88 0.0563 2.81 0h12.7c0.381 0 0.691-0.309 0.691-0.691v-6.2c0-0.382-0.31-0.691-0.691-0.691h-5.88c-1.39-3.12-4.55-5.31-8.23-5.31-3.68 0-6.84 2.19-8.23 5.31zm0.463 0.691c1.18-3.1 4.21-5.31 7.77-5.31 3.55 0 6.59 2.21 7.76 5.31h6.35v6.2h-12.7c-0.914 0.0563-1.85 0.0563-2.77 0h-13v-6.2z"
          fill="#fff"
          stroke-width=".987"
        />
        <path
          d="m28.6 6.32c4.01 0 7.27 3.26 7.27 7.27 0 4.01-14.5 4.01-14.5 0 0-4.01 3.26-7.27 7.27-7.27z"
          fill="#2d2624"
          stroke-width=".987"
        />
        <clipPath id="b">
          <path
            d="m37.2 14.5c4.06 0 7.36 3.3 7.36 7.36 0 4.06-14.7 4.06-14.7 0 0-4.06 3.3-7.36 7.36-7.36z"
          />
        </clipPath>
        <g transform="matrix(.987 0 0 .987 -8.13 -8.03)" clip-path="url(#b)">
          <path
            d="m37.2 12.3c-0.069 0.303 0.377 0.714 0.536 0.965 0.504 0.799 0.744 1.43 1.07 2.3 1.01 2.7 0.775 5.41 0.775 8.2 0 0.121 0.155-0.196 0.262-0.254 0.233-0.126 0.484-0.232 0.724-0.345 0.727-0.341 1.47-0.602 2.24-0.833 2.84-0.852 4.9-0.521 6.1-3.77 0.26-0.704 0.404-1.57 0.22-2.31-0.225-0.9-2.44-3.28-3.27-3.7-1.35-0.675-3.05-0.667-4.43-1.01-1.3-0.326-3.08-0.498-4.11 0.524"
            fill="#483f3c"
          />
        </g>
        <rect x="19.1" y="11" width="19.1" height="5.51" fill="#2d2624" stroke-width=".987" />
        <clipPath id="a"><rect x="27.6" y="19.3" width="19.3" height="5.58" /></clipPath>
        <g transform="matrix(.987 0 0 .987 -8.13 -8.03)" clip-path="url(#a)">
          <path
            d="m38.1 18.8c0.144 0.284 0.197 0.749 0.286 1.07 0.466 1.68 0.509 3.53 0.399 5.27-0.041 0.653-0.374 1.31-0.374 1.96 0 0.041 0.076-0.032 0.116-0.043 0.154-0.042 0.14-0.034 0.29-0.06 0.375-0.063 0.754-0.104 1.13-0.153 0.884-0.115 1.77-0.241 2.66-0.34 2.32-0.26 5.58 0.4 6.53-2.44 0.185-0.557 0.236-1.13 0.289-1.72 0.054-0.587 0.14-1.38-0.037-1.95-0.922-3-4.9-1.81-7.22-1.81-0.773 0-1.54 0.084-2.3 0.236-0.055 0.011-0.659 0.108-0.659 0.114"
            fill="#483f3c"
          />
        </g>
        <g fill="#a19e9e" stroke-width=".987">
          <circle cx="16.5" cy="14" r="1.44" />
          <circle cx="40.5" cy="14" r="1.44" />
          <rect x="15.2" y="33.7" width="9.44" height="3.23" />
          <rect x="32.5" y="23.7" width="9.44" height="3.23" />
          <rect x="32.5" y="33.7" width="9.44" height="3.23" />
        </g>
        <g stroke-width=".987">
          <rect x="17.9" y="23.7" width="3.93" height="3.23" fill="#8e7147" />
          <rect x="34.8" y="24.1" width="4.88" height="2.44" fill="#171514" />
          <rect x="34.8" y="34.1" width="4.88" height="2.44" fill="#171514" />
          <text fill="#ffffff" font-size="2.2px" stroke-width=".987">
            <tspan x="35.267719 36.591557 37.915394" y="26.1">103</tspan>
            <tspan x="35.267719 36.591557 37.915394" y="36.12">102</tspan>
          </text>
          <rect x="17.9" y="33.7" width="3.93" height="3.23" fill="#ccf9f9" />
        </g>
      </svg>
    `}};a=function(t,e,s,i){var n,r=arguments.length,a=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)a=Reflect.decorate(t,e,s,i);else for(var l=t.length-1;l>=0;l--)(n=t[l])&&(a=(r<3?n(a):r>3?n(e,s,a):n(e,s))||a);return r>3&&a&&Object.defineProperty(e,s,a),a}([(0,n.EM)("wokwi-ir-receiver")],a)},32053:(t,e,s)=>{s.d(e,{f:()=>c});var i=s(12618),n=s(52777);const r=new Uint8Array([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,4,4,4,0,0,4,0,10,10,10,0,0,0,0,0,10,10,31,10,31,10,10,0,4,30,5,14,20,15,4,0,3,19,8,4,2,25,24,0,6,9,5,2,21,9,22,0,6,4,2,0,0,0,0,0,8,4,2,2,2,4,8,0,2,4,8,8,8,4,2,0,0,4,21,14,21,4,0,0,0,4,4,31,4,4,0,0,0,0,0,0,6,4,2,0,0,0,0,31,0,0,0,0,0,0,0,0,0,6,6,0,0,16,8,4,2,1,0,0,14,17,25,21,19,17,14,0,4,6,4,4,4,4,14,0,14,17,16,8,4,2,31,0,31,8,4,8,16,17,14,0,8,12,10,9,31,8,8,0,31,1,15,16,16,17,14,0,12,2,1,15,17,17,14,0,31,17,16,8,4,4,4,0,14,17,17,14,17,17,14,0,14,17,17,30,16,8,6,0,0,6,6,0,6,6,0,0,0,6,6,0,6,4,2,0,8,4,2,1,2,4,8,0,0,0,31,0,31,0,0,0,2,4,8,16,8,4,2,0,14,17,16,8,4,0,4,0,14,17,16,22,21,21,14,0,14,17,17,17,31,17,17,0,15,17,17,15,17,17,15,0,14,17,1,1,1,17,14,0,7,9,17,17,17,9,7,0,31,1,1,15,1,1,31,0,31,1,1,15,1,1,1,0,14,17,1,29,17,17,30,0,17,17,17,31,17,17,17,0,14,4,4,4,4,4,14,0,28,8,8,8,8,9,6,0,17,9,5,3,5,9,17,0,1,1,1,1,1,1,31,0,17,27,21,21,17,17,17,0,17,17,19,21,25,17,17,0,14,17,17,17,17,17,14,0,15,17,17,15,1,1,1,0,14,17,17,17,21,9,22,0,15,17,17,15,5,9,17,0,30,1,1,14,16,16,15,0,31,4,4,4,4,4,4,0,17,17,17,17,17,17,14,0,17,17,17,17,17,10,4,0,17,17,17,21,21,21,10,0,17,17,10,4,10,17,17,0,17,17,17,10,4,4,4,0,31,16,8,4,2,1,31,0,7,1,1,1,1,1,7,0,17,10,31,4,31,4,4,0,14,8,8,8,8,8,14,0,4,10,17,0,0,0,0,0,0,0,0,0,0,0,31,0,2,4,8,0,0,0,0,0,0,0,14,16,30,17,30,0,1,1,13,19,17,17,15,0,0,0,14,1,1,17,14,0,16,16,22,25,17,17,30,0,0,0,14,17,31,1,14,0,12,18,2,7,2,2,2,0,0,30,17,17,30,16,14,0,1,1,13,19,17,17,17,0,4,0,6,4,4,4,14,0,8,0,12,8,8,9,6,0,1,1,9,5,3,5,9,0,6,4,4,4,4,4,14,0,0,0,11,21,21,17,17,0,0,0,13,19,17,17,17,0,0,0,14,17,17,17,14,0,0,0,15,17,15,1,1,0,0,0,22,25,30,16,16,0,0,0,13,19,1,1,1,0,0,0,14,1,14,16,15,0,2,2,7,2,2,18,12,0,0,0,17,17,17,25,22,0,0,0,17,17,17,10,4,0,0,0,17,21,21,21,10,0,0,0,17,10,4,10,17,0,0,0,17,17,30,16,14,0,0,0,31,8,4,2,31,0,8,4,4,2,4,4,8,0,4,4,4,4,4,4,4,0,2,4,4,8,4,4,2,0,0,4,8,31,8,4,0,0,0,4,2,31,2,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,7,5,7,0,28,4,4,4,0,0,0,0,0,0,0,4,4,4,7,0,0,0,0,0,1,2,4,0,0,0,0,6,6,0,0,0,0,31,16,31,16,8,4,0,0,0,31,16,12,4,2,0,0,0,8,4,6,5,4,0,0,0,4,31,17,16,12,0,0,0,31,4,4,4,31,0,0,0,8,31,12,10,9,0,0,0,2,31,18,10,2,0,0,0,0,14,8,8,31,0,0,0,15,8,15,8,15,0,0,0,0,21,21,16,12,0,0,0,0,31,0,0,0,0,31,16,20,12,4,4,2,0,16,8,4,6,5,4,4,0,4,31,17,17,16,8,4,0,0,31,4,4,4,4,31,0,8,31,8,12,10,9,8,0,2,31,18,18,18,18,9,0,4,31,4,31,4,4,4,0,0,30,18,17,16,8,6,0,2,30,9,8,8,8,4,0,0,31,16,16,16,16,31,0,10,31,10,10,8,4,2,0,0,3,16,19,16,8,7,0,0,31,16,8,4,10,17,0,2,31,18,10,2,2,28,0,0,17,17,18,16,8,6,0,0,30,18,21,24,8,6,0,8,7,4,31,4,4,2,0,0,21,21,21,16,8,4,0,14,0,31,4,4,4,2,0,2,2,2,6,10,2,2,0,4,4,31,4,4,2,1,0,0,14,0,0,0,0,31,0,0,31,16,10,4,10,1,0,4,31,8,4,14,21,4,0,8,8,8,8,8,4,2,0,0,4,8,17,17,17,17,0,1,1,31,1,1,1,30,0,0,31,16,16,16,8,6,0,0,2,5,8,16,16,0,0,4,31,4,4,21,21,4,0,0,31,16,16,10,4,8,0,0,14,0,14,0,14,16,0,0,4,2,1,17,31,16,0,0,16,16,10,4,10,1,0,0,31,2,31,2,2,28,0,2,2,31,18,10,2,2,0,0,14,8,8,8,8,31,0,0,31,16,31,16,16,31,0,14,0,31,16,16,8,4,0,9,9,9,9,8,4,2,0,0,4,5,5,21,21,13,0,0,1,1,17,9,5,3,0,0,31,17,17,17,17,31,0,0,31,17,17,16,8,4,0,0,3,0,16,16,8,7,0,4,9,2,0,0,0,0,0,7,5,7,0,0,0,0,0,0,0,18,21,9,9,22,0,10,0,14,16,30,17,30,0,0,0,14,17,15,17,15,1,0,0,14,1,6,17,14,0,0,0,17,17,17,25,23,1,0,0,30,5,9,17,14,0,0,0,12,18,17,17,15,1,0,0,30,17,17,17,30,16,0,0,28,4,4,5,2,0,0,8,11,8,0,0,0,0,8,0,12,8,8,8,8,8,0,5,2,5,0,0,0,0,0,4,14,5,21,14,4,0,2,2,7,2,7,2,30,0,14,0,13,19,17,17,17,0,10,0,14,17,17,17,14,0,0,0,13,19,17,17,15,1,0,0,22,25,17,17,30,16,0,14,17,31,17,17,14,0,0,0,0,26,21,11,0,0,0,0,14,17,17,10,27,0,10,0,17,17,17,17,25,22,31,1,2,4,2,1,31,0,0,0,31,10,10,10,25,0,31,0,17,10,4,10,17,0,0,0,17,17,17,17,30,16,0,16,15,4,31,4,4,0,0,0,31,2,30,18,17,0,0,0,31,21,31,17,17,0,0,4,0,31,0,4,0,0,0,0,0,0,0,0,0,0,31,31,31,31,31,31,31,31]);var a=s(76860),l=s(29298),o=function(t,e,s,i){var n,r=arguments.length,a=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)a=Reflect.decorate(t,e,s,i);else for(var l=t.length-1;l>=0;l--)(n=t[l])&&(a=(r<3?n(a):r>3?n(e,s,a):n(e,s))||a);return r>3&&a&&Object.defineProperty(e,s,a),a};const h={green:"#6cb201",blue:"#000eff"};let c=class extends i.WF{constructor(){super(...arguments),this.color="black",this.background="green",this.characters=new Uint8Array(32),this.font=r,this.cursor=!1,this.blink=!1,this.cursorX=0,this.cursorY=0,this.backlight=!0,this.pins="full",this.screenOnly=!1,this.numCols=16,this.numRows=2}get text(){return Array.from(this.characters).map((t=>String.fromCharCode(t))).join("")}set text(t){this.characters=new Uint8Array(t.split("").map((t=>t.charCodeAt(0))))}static get styles(){return i.AH`
      .cursor-blink {
        animation: cursor-blink;
      }

      @keyframes cursor-blink {
        from {
          opacity: 0;
        }
        25% {
          opacity: 1;
        }
        75% {
          opacity: 1;
        }
        to {
          opacity: 0;
        }
      }
    `}get panelHeight(){return 5.75*this.rows}get pinInfo(){const{panelHeight:t}=this,e=87.5+t*l.p;return"i2c"===this.pins?[{name:"GND",x:4,y:32,number:1,signals:[{type:"power",signal:"GND"}]},{name:"VCC",x:4,y:41.5,number:2,signals:[{type:"power",signal:"VCC"}]},{name:"SDA",x:4,y:51,number:3,signals:[(0,a.v2)("SDA")]},{name:"SCL",x:4,y:60.5,number:4,signals:[(0,a.v2)("SCL")]}]:[{name:"VSS",x:32,y:e,number:1,signals:[{type:"power",signal:"GND"}]},{name:"VDD",x:41.5,y:e,number:2,signals:[{type:"power",signal:"VCC"}]},{name:"V0",x:51.5,y:e,number:3,signals:[]},{name:"RS",x:60.5,y:e,number:4,signals:[]},{name:"RW",x:70.5,y:e,number:5,signals:[]},{name:"E",x:80,y:e,number:6,signals:[]},{name:"D0",x:89.5,y:e,number:7,signals:[]},{name:"D1",x:99.5,y:e,number:8,signals:[]},{name:"D2",x:109,y:e,number:9,signals:[]},{name:"D3",x:118.5,y:e,number:10,signals:[]},{name:"D4",x:128,y:e,number:11,signals:[]},{name:"D5",x:137.5,y:e,number:12,signals:[]},{name:"D6",x:147,y:e,number:13,signals:[]},{name:"D7",x:156.5,y:e,number:14,signals:[]},{name:"A",x:166.5,y:e,number:15,signals:[]},{name:"K",x:176,y:e,number:16,signals:[]}]}get cols(){return this.numCols}get rows(){return this.numRows}update(t){t.has("pins")&&this.dispatchEvent(new CustomEvent("pininfo-change")),super.update(t)}path(t){const e=[],{cols:s}=this;for(let i=0;i<t.length;i++){const n=i%s*3.55,r=5.95*Math.floor(i/s);for(let s=0;s<8;s++){const a=this.font[8*t[i]+s];for(let t=0;t<5;t++)if(a&1<<t){const i=(n+.6*t).toFixed(2),a=(r+.7*s).toFixed(2);e.push(`M ${i} ${a}h0.55v0.65h-0.55Z`)}}}return e.join(" ")}renderCursor(){const{cols:t,rows:e,cursor:s,cursorX:n,cursorY:r,blink:a,color:l}=this,o=12.45+3.55*n,h=12.55+5.95*r;if(n<0||n>=t||r<0||r>=e)return null;const c=[];if(a&&c.push(i.JW`
        <rect x="${o}" y="${h}" width="2.95" height="5.55" fill="${l}">
          <animate
            attributeName="opacity"
            values="0;0;0;0;1;1;0;0;0;0"
            dur="1s"
            fill="freeze"
            repeatCount="indefinite"
          />
        </rect>
      `),s){const t=h+.7*7;c.push(i.JW`<rect x="${o}" y="${t}" width="2.95" height="0.65" fill="${l}" />`)}return c}renderI2CPins(){return i.JW`
      <rect x="7.55" y="-2.5" height="2.5" width="10.16" fill="url(#pins)" transform="rotate(90)" />
      <text fill="white" font-size="1.5px" font-family= "monospace">
      <tspan y="6.8" x="0.7" fill="white">1</tspan>
      <tspan y="8.9" x="2.3" fill="white">GND</tspan>
      <tspan y="11.4" x="2.3" fill="white">VCC</tspan>
      <tspan y="14" x="2.3" fill="white">SDA</tspan>
      <tspan y="16.6" x="2.3" fill="white">SCL</tspan>
      </text>
    `}renderPins(t){const e=t+21.1;return i.JW`
      <g transform="translate(0, ${e})">
        <rect x="7.55" y="1" height="2.5" width="40.64" fill="url(#pins)" />
        <text fill="white" font-size="1.5px" font-family= "monospace">
          <tspan x="6" y="2.7">1</tspan>
          <tspan x="7.2" y="0.7">VSS</tspan>
          <tspan x="9.9" y="0.7">VDD</tspan>
          <tspan x="12.7" y="0.7">V0</tspan>
          <tspan x="15.2" y="0.7">RS</tspan>
          <tspan x="17.8" y="0.7">RW</tspan>
          <tspan x="20.8" y="0.7">E</tspan>
          <tspan x="22.7" y="0.7">D0</tspan>
          <tspan x="25.3" y="0.7">D1</tspan>
          <tspan x="27.9" y="0.7">D2</tspan>
          <tspan x="30.4" y="0.7">D3</tspan>
          <tspan x="33" y="0.7">D4</tspan>
          <tspan x="35.6" y="0.7">D5</tspan>
          <tspan x="38.2" y="0.7">D6</tspan>
          <tspan x="40.8" y="0.7">D7</tspan>
          <tspan x="43.6" y="0.7">A</tspan>
          <tspan x="46.2" y="0.7">K</tspan>
          <tspan x="48" y="2.7">16</tspan>
        </text>
      </g>
    `}render(){const{color:t,characters:e,background:s,pins:n,panelHeight:r,cols:a}=this,l=this.backlight?0:.5,o=s in h?h[s]:h,c=3.5125*a,p=this.screenOnly?c:c+23.8,d=this.screenOnly?r:r+24.5,y=this.screenOnly?`12.45 12.55 ${c} ${r}`:`0 0 ${p} ${d}`;return i.qy`
      <svg
        width="${p}mm"
        height="${d}mm"
        version="1.1"
        viewBox="${y}"
        style="font-size: 1.5px; font-family: monospace"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="characters"
            width="3.55"
            height="5.95"
            patternUnits="userSpaceOnUse"
            x="12.45"
            y="12.55"
          >
            <rect width="2.95" height="5.55" fill-opacity="0.05" />
          </pattern>
          <pattern id="pins" width="2.54" height="3.255" patternUnits="userSpaceOnUse" y="1.1">
            <path
              fill="#92926d"
              d="M0,0.55c0,0 0.21,-0.52 0.87,-0.52 0.67,0 0.81,0.51 0.81,0.51v1.81h-1.869z"
            />
            <circle r="0.45" cx="0.827" cy="0.9" color="black" />
          </pattern>
        </defs>
        <rect width="${p}" height="${d}" fill="#087f45" />
        <rect x="4.95" y="5.7" width="${c+15}" height="${r+13.7}" />
        <rect
          x="7.55"
          y="10.3"
          width="${c+9.8}"
          height="${r+4.5}"
          rx="1.5"
          ry="1.5"
          fill="${o}"
        />
        <rect
          x="7.55"
          y="10.3"
          width="${c+9.8}"
          height="${r+4.5}"
          rx="1.5"
          ry="1.5"
          opacity="${l}"
        />
        ${"i2c"===n?this.renderI2CPins():null}
        ${"full"===n?this.renderPins(r):null}
        <rect
          x="${12.45}"
          y="${12.55}"
          width="${c}"
          height="${r}"
          fill="url(#characters)"
        />
        <path
          d="${this.path(e)}"
          transform="translate(${12.45}, ${12.55})"
          fill="${t}"
        />
        ${this.renderCursor()}
      </svg>
    `}};o([(0,n.MZ)()],c.prototype,"color",void 0),o([(0,n.MZ)()],c.prototype,"background",void 0),o([(0,n.MZ)({type:Array})],c.prototype,"characters",void 0),o([(0,n.MZ)()],c.prototype,"font",void 0),o([(0,n.MZ)()],c.prototype,"cursor",void 0),o([(0,n.MZ)()],c.prototype,"blink",void 0),o([(0,n.MZ)()],c.prototype,"cursorX",void 0),o([(0,n.MZ)()],c.prototype,"cursorY",void 0),o([(0,n.MZ)()],c.prototype,"backlight",void 0),o([(0,n.MZ)()],c.prototype,"pins",void 0),o([(0,n.MZ)()],c.prototype,"screenOnly",void 0),o([(0,n.MZ)()],c.prototype,"text",null),c=o([(0,n.EM)("wokwi-lcd1602")],c)},55631:(t,e,s)=>{s.d(e,{I:()=>l});var i=s(12618),n=s(52777),r=function(t,e,s,i){var n,r=arguments.length,a=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)a=Reflect.decorate(t,e,s,i);else for(var l=t.length-1;l>=0;l--)(n=t[l])&&(a=(r<3?n(a):r>3?n(e,s,a):n(e,s))||a);return r>3&&a&&Object.defineProperty(e,s,a),a};const a={red:"#ff8080",green:"#80ff80",blue:"#8080ff",yellow:"#ffff80",orange:"#ffcf80",white:"#ffffff",purple:"#ff80ff"};let l=class extends i.WF{constructor(){super(...arguments),this.value=!1,this.brightness=1,this.color="red",this.lightColor=null,this.label="",this.flip=!1}get pinInfo(){return[{name:"A",x:this.flip?15:25,y:42,signals:[],description:"Anode"},{name:"C",x:this.flip?25:15,y:42,signals:[],description:"Cathode"}]}static get styles(){return i.AH`
      :host {
        display: inline-block;
      }

      .led-container {
        display: flex;
        flex-direction: column;
        width: 40px;
      }

      .led-label {
        font-size: 10px;
        text-align: center;
        color: gray;
        position: relative;
        line-height: 1;
        top: -8px;
      }
    `}update(t){t.has("flip")&&this.dispatchEvent(new CustomEvent("pininfo-change")),super.update(t)}renderSVG(){const{color:t,lightColor:e,flip:s}=this,n=e||a[t?.toLowerCase()]||t,r=this.brightness?.3+.7*this.brightness:0,l=this.value&&this.brightness>Number.EPSILON,o=s?-1:1;return i.qy`<svg
      width="40"
      height="50"
      transform="scale(${o} 1)"
      version="1.2"
      viewBox="-10 -5 35.456 39.618"
      xmlns="http://www.w3.org/2000/svg"
    >
      <filter id="light1" x="-0.8" y="-0.8" height="2.2" width="2.8">
        <feGaussianBlur stdDeviation="2" />
      </filter>
      <filter id="light2" x="-0.8" y="-0.8" height="2.2" width="2.8">
        <feGaussianBlur stdDeviation="4" />
      </filter>
      <rect x="2.5099" y="20.382" width="2.1514" height="9.8273" fill="#8c8c8c" />
      <path
        d="m12.977 30.269c0-1.1736-0.86844-2.5132-1.8916-3.4024-0.41616-0.3672-1.1995-1.0015-1.1995-1.4249v-5.4706h-2.1614v5.7802c0 1.0584 0.94752 1.8785 1.9462 2.7482 0.44424 0.37584 1.3486 1.2496 1.3486 1.7694"
        fill="#8c8c8c"
      />

      <path
        d="m14.173 13.001v-5.9126c0-3.9132-3.168-7.0884-7.0855-7.0884-3.9125 0-7.0877 3.1694-7.0877 7.0884v13.649c1.4738 1.651 4.0968 2.7526 7.0877 2.7526 4.6195 0 8.3686-2.6179 8.3686-5.8594v-1.5235c-7.4e-4 -1.1426-0.47444-2.2039-1.283-3.1061z"
        opacity=".3"
      />
      <path
        d="m14.173 13.001v-5.9126c0-3.9132-3.168-7.0884-7.0855-7.0884-3.9125 0-7.0877 3.1694-7.0877 7.0884v13.649c1.4738 1.651 4.0968 2.7526 7.0877 2.7526 4.6195 0 8.3686-2.6179 8.3686-5.8594v-1.5235c-7.4e-4 -1.1426-0.47444-2.2039-1.283-3.1061z"
        fill="#e6e6e6"
        opacity=".5"
      />
      <path
        d="m14.173 13.001v3.1054c0 2.7389-3.1658 4.9651-7.0855 4.9651-3.9125 2e-5 -7.0877-2.219-7.0877-4.9651v4.6296c1.4738 1.6517 4.0968 2.7526 7.0877 2.7526 4.6195 0 8.3686-2.6179 8.3686-5.8586l-4e-5 -1.5235c-7e-4 -1.1419-0.4744-2.2032-1.283-3.1054z"
        fill="#d1d1d1"
        opacity=".9"
      />
      <g>
        <path
          d="m14.173 13.001v3.1054c0 2.7389-3.1658 4.9651-7.0855 4.9651-3.9125 2e-5 -7.0877-2.219-7.0877-4.9651v4.6296c1.4738 1.6517 4.0968 2.7526 7.0877 2.7526 4.6195 0 8.3686-2.6179 8.3686-5.8586l-4e-5 -1.5235c-7e-4 -1.1419-0.4744-2.2032-1.283-3.1054z"
          opacity=".7"
        />
        <path
          d="m14.173 13.001v3.1054c0 2.7389-3.1658 4.9651-7.0855 4.9651-3.9125 2e-5 -7.0877-2.219-7.0877-4.9651v3.1054c1.4738 1.6502 4.0968 2.7526 7.0877 2.7526 4.6195 0 8.3686-2.6179 8.3686-5.8586-7.4e-4 -1.1412-0.47444-2.2025-1.283-3.1047z"
          opacity=".25"
        />
        <ellipse cx="7.0877" cy="16.106" rx="7.087" ry="4.9608" opacity=".25" />
      </g>
      <polygon
        points="2.2032 16.107 3.1961 16.107 3.1961 13.095 6.0156 13.095 10.012 8.8049 3.407 8.8049 2.2032 9.648"
        fill="#666666"
      />
      <polygon
        points="11.215 9.0338 7.4117 13.095 11.06 13.095 11.06 16.107 11.974 16.107 11.974 8.5241 10.778 8.5241"
        fill="#666666"
      />
      <path
        d="m14.173 13.001v-5.9126c0-3.9132-3.168-7.0884-7.0855-7.0884-3.9125 0-7.0877 3.1694-7.0877 7.0884v13.649c1.4738 1.651 4.0968 2.7526 7.0877 2.7526 4.6195 0 8.3686-2.6179 8.3686-5.8594v-1.5235c-7.4e-4 -1.1426-0.47444-2.2039-1.283-3.1061z"
        fill="${t}"
        opacity=".65"
      />
      <g fill="#ffffff">
        <path
          d="m10.388 3.7541 1.4364-0.2736c-0.84168-1.1318-2.0822-1.9577-3.5417-2.2385l0.25416 1.0807c0.76388 0.27072 1.4068 0.78048 1.8511 1.4314z"
          opacity=".5"
        />
        <path
          d="m0.76824 19.926v1.5199c0.64872 0.5292 1.4335 0.97632 2.3076 1.3169v-1.525c-0.8784-0.33624-1.6567-0.78194-2.3076-1.3118z"
          opacity=".5"
        />
        <path
          d="m11.073 20.21c-0.2556 0.1224-0.52992 0.22968-0.80568 0.32976-0.05832 0.01944-0.11736 0.04032-0.17784 0.05832-0.56376 0.17928-1.1614 0.31896-1.795 0.39456-0.07488 0.0094-0.1512 0.01872-0.22464 0.01944-0.3204 0.03024-0.64368 0.05832-0.97056 0.05832-0.14832 0-0.30744-0.01512-0.4716-0.02376-1.2002-0.05688-2.3306-0.31464-3.2976-0.73944l-2e-5 -8.3895v-4.8254c0-1.471 0.84816-2.7295 2.0736-3.3494l-0.02232-0.05328-1.2478-1.512c-1.6697 1.003-2.79 2.8224-2.79 4.9118v11.905c-0.04968-0.04968-0.30816-0.30888-0.48024-0.52992l-0.30744 0.6876c1.4011 1.4818 3.8088 2.4617 6.5426 2.4617 1.6798 0 3.2371-0.37368 4.5115-1.0022l-0.52704-0.40896-0.01006 0.0072z"
          opacity=".5"
        />
      </g>
      <g class="light" style="display: ${l?"":"none"}">
        <ellipse
          cx="8"
          cy="10"
          rx="10"
          ry="10"
          fill="${n}"
          filter="url(#light2)"
          style="opacity: ${r}"
        ></ellipse>
        <ellipse cx="8" cy="10" rx="2" ry="2" fill="white" filter="url(#light1)"></ellipse>
        <ellipse
          cx="8"
          cy="10"
          rx="3"
          ry="3"
          fill="white"
          filter="url(#light1)"
          style="opacity: ${r}"
        ></ellipse>
      </g>
    </svg> `}render(){return i.qy`
      <div class="led-container">
        ${this.renderSVG()}
        <span class="led-label">${this.label}</span>
      </div>
    `}};r([(0,n.MZ)()],l.prototype,"value",void 0),r([(0,n.MZ)()],l.prototype,"brightness",void 0),r([(0,n.MZ)()],l.prototype,"color",void 0),r([(0,n.MZ)()],l.prototype,"lightColor",void 0),r([(0,n.MZ)()],l.prototype,"label",void 0),r([(0,n.MZ)({type:Boolean})],l.prototype,"flip",void 0),l=r([(0,n.EM)("wokwi-led")],l)},70300:(t,e,s)=>{s.d(e,{h:()=>i});const i=s(12618).JW`
  <pattern id="pins-female" width="2.54" height="2.54" patternUnits="userSpaceOnUse">
    <rect x="0" y="0" width="2.54" height="2.54" fill="#333"></rect>
    <rect x="1.079" y="0.896" width="0.762" height="0.762" style="fill: #191919"></rect>
    <path
      transform="translate(1.079, 1.658) rotate(180 0 0)"
      d="m 0 0 v 0.762 l 0.433,0.433 c 0.046,-0.046 0.074,-0.109 0.074,-0.179 v -1.27 c 0,-0.070 -0.028,-0.133 -0.074,-0.179 z"
      style="opacity: 0.25"
    ></path>
    <path
      transform="translate(1.841, 1.658) rotate(90 0 0)"
      d="m 0 0 v 0.762 l 0.433,0.433 c 0.046,-0.046 0.074,-0.109 0.074,-0.179 v -1.27 c 0,-0.070 -0.028,-0.133 -0.074,-0.179 z"
      style="opacity: 0.3; fill: #fff"
    ></path>
    <path
      transform="translate(1.841, 0.896)"
      d="m 0 0 v 0.762 l 0.433,0.433 c 0.046,-0.046 0.074,-0.109 0.074,-0.179 v -1.27 c 0,-0.070 -0.028,-0.133 -0.074,-0.179 z"
      style="opacity: 0.15; fill: #fff"
    ></path>
    <path
      transform="translate(1.079, 0.896) rotate(270 0 0)"
      d="m 0 0 v 0.762 l 0.433,0.433 c 0.046,-0.046 0.074,-0.109 0.074,-0.179 v -1.27 c 0,-0.070 -0.028,-0.133 -0.074,-0.179 z"
      style="opacity: 0.35"
    ></path>
  </pattern>
`},76860:(t,e,s)=>{s.d(e,{$n:()=>i,SW:()=>l,_5:()=>a,dg:()=>r,jc:()=>o,v2:()=>n});const i=t=>({type:"analog",channel:t}),n=(t,e=0)=>({type:"i2c",signal:t,bus:e}),r=(t,e=0)=>({type:"spi",signal:t,bus:e}),a=(t,e=0)=>({type:"usart",signal:t,bus:e}),l=()=>({type:"power",signal:"GND"}),o=t=>({type:"power",signal:"VCC",voltage:t})},58660:(t,e,s)=>{s.d(e,{m:()=>f});var i=s(12618),n=s(52777),r=s(36752);class a{constructor(t){}get _$AU(){return this._$AM._$AU}_$AT(t,e,s){this._$Ct=t,this._$AM=e,this._$Ci=s}_$AS(t,e){return this.update(t,e)}update(t,e){return this.render(...e)}}const l="important",o=" !"+l,h=(c=class extends a{constructor(t){if(super(t),1!==t.type||"style"!==t.name||t.strings?.length>2)throw Error("The `styleMap` directive must be used in the `style` attribute and must be the only part in the attribute.")}render(t){return Object.keys(t).reduce(((e,s)=>{const i=t[s];return null==i?e:e+`${s=s.includes("-")?s:s.replace(/(?:^(webkit|moz|ms|o)|)(?=[A-Z])/g,"-$&").toLowerCase()}:${i};`}),"")}update(t,[e]){const{style:s}=t.element;if(void 0===this.ft)return this.ft=new Set(Object.keys(e)),this.render(e);for(const t of this.ft)null==e[t]&&(this.ft.delete(t),t.includes("-")?s.removeProperty(t):s[t]=null);for(const t in e){const i=e[t];if(null!=i){this.ft.add(t);const e="string"==typeof i&&i.endsWith(o);t.includes("-")||e?s.setProperty(t,e?i.slice(0,-11):i,e?l:""):s[t]=i}}return r.c0}},(...t)=>({_$litDirective$:c,values:t}));var c,p=s(76860);const d=(t,e,s)=>{const i=Math.min(s,e);return Math.max(i,t)};var y=function(t,e,s,i){var n,r=arguments.length,a=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)a=Reflect.decorate(t,e,s,i);else for(var l=t.length-1;l>=0;l--)(n=t[l])&&(a=(r<3?n(a):r>3?n(e,s,a):n(e,s))||a);return r>3&&a&&Object.defineProperty(e,s,a),a};let f=class extends i.WF{constructor(){super(...arguments),this.min=0,this.max=1023,this.value=0,this.step=1,this.startDegree=-135,this.endDegree=135,this.pressed=!1,this.pageToKnobMatrix=null,this.pinInfo=[{name:"GND",x:29,y:68.5,number:1,signals:[{type:"power",signal:"GND"}]},{name:"SIG",x:39,y:68.5,number:2,signals:[(0,p.$n)(0)]},{name:"VCC",x:49,y:68.5,number:3,signals:[{type:"power",signal:"VCC"}]}]}static get styles(){return i.AH`
      #rotating {
        transform-origin: 10px 8px;
        transform: rotate(var(--knob-angle, 0deg));
      }

      svg text {
        font-size: 1px;
        line-height: 1.25;
        letter-spacing: 0px;
        word-spacing: 0px;
        fill: #ffffff;
      }
      .hide-input {
        position: absolute;
        clip: rect(0 0 0 0);
        width: 1px;
        height: 1px;
        margin: -1px;
      }
      input:focus + svg #knob {
        stroke: #ccdae3;
        filter: url(#outline);
      }
    `}mapToMinMax(t,e,s){return t*(s-e)+e}percentFromMinMax(t,e,s){return(t-e)/(s-e)}renderSVG(){const t=d(0,1,this.percentFromMinMax(this.value,this.min,this.max)),e=(this.endDegree-this.startDegree)*t+this.startDegree;return i.qy`<svg
      role="slider"
      width="20mm"
      height="20mm"
      version="1.1"
      viewBox="0 0 20 20"
      xmlns="http://www.w3.org/2000/svg"
      @click="${this.focusInput}"
      @mousedown=${this.down}
      @mousemove=${this.move}
      @mouseup=${this.up}
      @touchstart=${this.down}
      @touchmove=${this.move}
      @touchend=${this.up}
      style=${h({"--knob-angle":e+"deg"})}
    >
      <defs>
        <filter id="outline">
          <feDropShadow id="glow" dx="0" dy="0" stdDeviation="0.5" flood-color="cyan" />
        </filter>
      </defs>
      <rect
        x=".15"
        y=".15"
        width="19.5"
        height="19.5"
        ry="1.23"
        fill="#045881"
        stroke="#045881"
        stroke-width=".30"
      />
      <rect x="5.4" y=".70" width="9.1" height="1.9" fill="#ccdae3" stroke-width=".15" />
      <ellipse
        id="knob"
        cx=${9.91}
        cy=${8.18}
        rx="7.27"
        ry="7.43"
        fill="#e4e8eb"
        stroke-width=".15"
      />
      <rect x="6" y="17" width="8" height="2" fill-opacity="0" stroke="#fff" stroke-width=".30" />
      <g stroke-width=".15">
        <text x="6.21" y="16.6">GND</text>
        <text x="9.2" y="16.63">SIG</text>
        <text x="11.5" y="16.59">VCC</text>
      </g>
      <g fill="#fff" stroke-width=".15">
        <ellipse cx="1.68" cy="1.81" rx=".99" ry=".96" />
        <ellipse cx="1.48" cy="18.37" rx=".99" ry=".96" />
        <ellipse cx="17.97" cy="18.47" rx=".99" ry=".96" />
        <ellipse cx="18.07" cy="1.91" rx=".99" ry=".96" />
      </g>
      <g fill="#b3b1b0" stroke-width=".15">
        <ellipse cx="7.68" cy="18" rx=".61" ry=".63" />
        <ellipse cx="10.22" cy="18" rx=".61" ry=".63" />
        <ellipse cx="12.76" cy="18" rx=".61" ry=".63" />
      </g>
      <ellipse cx="9.95" cy="8.06" rx="6.60" ry="6.58" fill="#c3c2c3" stroke-width=".15" />
      <rect id="rotating" x="10" y="2" width=".42" height="3.1" stroke-width=".15" />
      <rect x="0" y="9.5" width="1" height="1" fill="none" id="firefox-workaround" />
    </svg>`}render(){return i.qy`
      <input
        tabindex="0"
        type="range"
        class="hide-input"
        max="${this.max}"
        min="${this.min}"
        value="${this.value}"
        step="${this.step}"
        aria-valuemin="${this.min}"
        aria-valuenow="${this.value}"
        @input="${this.onValueChange}"
      />
      ${this.renderSVG()}
    `}focusInput(){const t=this.shadowRoot?.querySelector(".hide-input");t?.focus()}onValueChange(t){const e=t.target;this.updateValue(parseFloat(e.value))}down(t){(0===t.button||window.navigator.maxTouchPoints)&&(this.pressed=!0,t.stopPropagation(),t.preventDefault(),this.updateKnobMatrix())}move(t){const{pressed:e}=this;e&&this.rotateHandler(t)}up(){this.pressed=!1}updateKnobMatrix(){const t=this.shadowRoot?.querySelector("#knob"),e=this.shadowRoot?.querySelector("#firefox-workaround");this.pageToKnobMatrix=t&&e?function(t,e,s){const{userAgent:i}=navigator;if(i.indexOf("Epiphany")>=0||i.indexOf("Safari")>=0){const i=t.getCTM(),n=e?.getCTM(),r=e?.getBoundingClientRect(),a=e?.ownerSVGElement?.getBoundingClientRect();if(!(r&&a&&n&&i))return null;const l=a.x+a.width/2,o=a.y+a.height/2,h=l-(r.x+r.width/2),c=o-(r.y+r.height/2),p=Math.atan2(c,h)/Math.PI*180,d=(new DOMMatrix).rotate(p),y=function(t,e){const s=e.transformPoint({x:t.left,y:t.top}),i=e.transformPoint({x:t.right,y:t.top}),n=e.transformPoint({x:t.left,y:t.bottom}),r=e.transformPoint({x:t.right,y:t.bottom}),a=Math.min(s.x,i.x,n.x,r.x),l=Math.min(s.y,i.y,n.y,r.y),o=Math.max(s.x,i.x,n.x,r.x),h=Math.max(s.y,i.y,n.y,r.y);return new DOMRect(a,l,o-a,h-l)}(s,d),f=y.width/r.width,g=y.height/r.height,x=n.inverse().multiply(i);return d.inverse().translate(y.left,y.top).multiply(x.inverse()).scale(f,g).translate(-r.left,-r.top)}return t.getScreenCTM()?.inverse()||null}(t,e,new DOMRect(0,9.5,1,1)):null}rotateHandler(t){if(t.stopPropagation(),t.preventDefault(),!this.pageToKnobMatrix)return;const e="touchmove"===t.type,s=e?t.touches[0].pageX:t.pageX,i=e?t.touches[0].pageY:t.pageY,n=new DOMPointReadOnly(s,i).matrixTransform(this.pageToKnobMatrix),r=9.91-n.x,a=8.18-n.y;let l=Math.round(180*Math.atan2(a,r)/Math.PI);l<0&&(l+=360),l-=90,r>0&&a<=0&&l>0&&(l-=360),l=d(this.startDegree,this.endDegree,l);const o=this.percentFromMinMax(l,this.startDegree,this.endDegree),h=this.mapToMinMax(o,this.min,this.max);this.updateValue(h)}updateValue(t){const e=d(this.min,this.max,t),s=Math.round(e/this.step)*this.step;this.value=Math.round(100*s)/100,this.dispatchEvent(new InputEvent("input",{detail:this.value}))}};y([(0,n.MZ)({type:Number})],f.prototype,"min",void 0),y([(0,n.MZ)({type:Number})],f.prototype,"max",void 0),y([(0,n.MZ)()],f.prototype,"value",void 0),y([(0,n.MZ)()],f.prototype,"step",void 0),y([(0,n.MZ)()],f.prototype,"startDegree",void 0),y([(0,n.MZ)()],f.prototype,"endDegree",void 0),f=y([(0,n.EM)("wokwi-potentiometer")],f)},29314:(t,e,s)=>{s.d(e,{D:()=>o});var i,n=s(12618),r=s(52777),a=s(33493),l=function(t,e,s,i){var n,r=arguments.length,a=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)a=Reflect.decorate(t,e,s,i);else for(var l=t.length-1;l>=0;l--)(n=t[l])&&(a=(r<3?n(a):r>3?n(e,s,a):n(e,s))||a);return r>3&&a&&Object.defineProperty(e,s,a),a};let o=class extends n.WF{static{i=this}static{this.pushbuttonCounter=0}constructor(){super(),this.color="red",this.pressed=!1,this.label="",this.xray=!1,this.sticky=!1,this.pinInfo=[{name:"1.l",x:0,y:13,signals:[]},{name:"2.l",x:0,y:32,signals:[]},{name:"1.r",x:67,y:13,signals:[]},{name:"2.r",x:67,y:32,signals:[]}],this.uniqueId="pushbutton"+i.pushbuttonCounter++}static get styles(){return n.AH`
      :host {
        display: inline-flex;
        flex-direction: column;
      }

      button {
        border: none;
        background: none;
        padding: 0;
        margin: 0;
        text-decoration: none;
        -webkit-appearance: none;
        -moz-appearance: none;
      }

      .button-active-circle {
        opacity: 0;
      }

      button:active .button-active-circle {
        opacity: 1;
      }

      .clickable-element {
        cursor: pointer;
      }

      .label {
        width: 0;
        min-width: 100%;
        font-size: 12px;
        text-align: center;
        color: gray;
        position: relative;
        line-height: 1;
        top: -2px;
      }
    `}renderSVG(){const{color:t,uniqueId:e,xray:s}=this,i=this.pressed?`url(#grad-down-${e})`:`url(#grad-up-${e})`;return n.qy`<svg
      width="17.802mm"
      height="12mm"
      version="1.1"
      viewBox="-3 0 18 12"
      xmlns="http://www.w3.org/2000/svg"
      xmlns:xlink="http://www.w3.org/1999/xlink"
    >
      <defs>
        <linearGradient id="grad-up-${e}" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="#ffffff" offset="0" />
          <stop stop-color="${t}" offset="0.3" />
          <stop stop-color="${t}" offset="0.5" />
          <stop offset="1" />
        </linearGradient>
        <linearGradient id="grad-down-${e}" x1="1" x2="0" y1="1" y2="0">
          <stop stop-color="#ffffff" offset="0" />
          <stop stop-color="${t}" offset="0.3" />
          <stop stop-color="${t}" offset="0.5" />
          <stop offset="1" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="12" height="12" rx=".44" ry=".44" fill="#464646" />
      <rect x=".75" y=".75" width="10.5" height="10.5" rx=".211" ry=".211" fill="#eaeaea" />
      ${s?n.JW`
      <rect
        style="opacity:0.3;fill:#999999;stroke-width:0.563001;paint-order:stroke markers fill"
        id="rect17"
        width="12.087865"
        height="1.0371729"
        x="-0.00075517414"
        y="2.9106798"
      />
      <rect
        style="opacity:0.3;fill:#999999;stroke-width:0.534365;paint-order:stroke markers fill"
        id="rect17-3"
        width="12.087865"
        height="0.93434691"
        x="-0.071111664"
        y="8.0458994"
      />
    `:""}
      <g fill="#1b1b1">
        <circle cx="1.767" cy="1.7916" r=".37" />
        <circle cx="10.161" cy="1.7916" r=".37" />
        <circle cx="10.161" cy="10.197" r=".37" />
        <circle cx="1.767" cy="10.197" r=".37" />
      </g>
      <g fill="#999" stroke-width="1.0154">
        <path
          d="m12.365 2.426c0.06012 0 0.10849 0.0469 0.1085 0.10522v0.38698h2.2173c0.12023 0 0.217 0.0938 0.217 0.21045v0.50721c0 0.1166-0.09677 0.21045-0.217 0.21045h-2.2173v0.40101c0 0.0583-0.0484 0.10528-0.1085 0.10528h-0.36835v-1.9266z"
        />
        <path
          d="m12.365 7.5c0.06012 0 0.10849 0.0469 0.1085 0.10522v0.38698h2.2173c0.12023 0 0.217 0.0938 0.217 0.21045v0.50721c0 0.1166-0.09677 0.21045-0.217 0.21045h-2.2173v0.40101c0 0.0583-0.0484 0.10528-0.1085 0.10528h-0.36835v-1.9266z"
        />
        <path
          d="m-0.35085 4.3526c-0.06012 0-0.10849-0.0469-0.1085-0.10522v-0.38698h-2.2173c-0.12023 0-0.217-0.0938-0.217-0.21045v-0.50721c0-0.1166 0.09677-0.21045 0.217-0.21045h2.2173v-0.40101c0-0.0583 0.0484-0.10528 0.1085-0.10528h0.36835v1.9266z"
        />
        <path
          d="m-0.35085 9.4266c-0.06012 0-0.10849-0.0469-0.1085-0.10522v-0.38698h-2.2173c-0.12023 0-0.217-0.0938-0.217-0.21045v-0.50721c0-0.1166 0.09677-0.21045 0.217-0.21045h2.2173v-0.40101c0-0.0583 0.0484-0.10528 0.1085-0.10528h0.36835v1.9266z"
        />
      </g>
      <g class="clickable-element">
        <circle cx="6" cy="6" r="3.822" fill="${i}" />
        <circle
          class="button-active-circle"
          cx="6"
          cy="6"
          r="3.822"
          fill="url(#grad-down-${e})"
        />
        <circle
          cx="6"
          cy="6"
          r="2.9"
          fill="${t}"
          stroke="#2f2f2f"
          stroke-opacity=".47"
          stroke-width=".08"
        />
      </g>
    </svg>`}render(){const{color:t,label:e}=this;return n.qy`
      <button
        aria-label="${e} ${t} pushbutton"
        @mousedown=${this.down}
        @mouseup=${this.up}
        @touchstart=${this.down}
        @touchend=${this.up}
        @pointerleave=${this.leave}
        @keydown=${t=>a.ed.includes(t.key)&&this.down()}
        @keyup=${t=>a.ed.includes(t.key)&&this.up(t)}
      >
        ${this.renderSVG()}
      </button>
      <span class="label">${this.label}</span>
    `}down(){this.pressed||(this.pressed=!0,this.dispatchEvent(new Event("button-press")))}up(t){this.pressed&&((0,a.C7)(t)?this.sticky=!0:(this.sticky=!1,this.pressed=!1,this.dispatchEvent(new Event("button-release"))))}leave(t){this.sticky||this.up(t)}};l([(0,r.MZ)()],o.prototype,"color",void 0),l([(0,r.MZ)()],o.prototype,"pressed",void 0),l([(0,r.MZ)()],o.prototype,"label",void 0),l([(0,r.MZ)({type:Boolean,attribute:"xray"})],o.prototype,"xray",void 0),o=i=l([(0,r.EM)("wokwi-pushbutton")],o)},28625:(t,e,s)=>{s.d(e,{g:()=>l});var i=s(12618),n=s(52777),r=function(t,e,s,i){var n,r=arguments.length,a=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)a=Reflect.decorate(t,e,s,i);else for(var l=t.length-1;l>=0;l--)(n=t[l])&&(a=(r<3?n(a):r>3?n(e,s,a):n(e,s))||a);return r>3&&a&&Object.defineProperty(e,s,a),a};const a={[-2]:"#C3C7C0",[-1]:"#F1D863",0:"#000000",1:"#8F4814",2:"#FB0000",3:"#FC9700",4:"#FCF800",5:"#00B800",6:"#0000FF",7:"#A803D6",8:"#808080",9:"#FCFCFC"};let l=class extends i.WF{constructor(){super(...arguments),this.value="1000",this.pinInfo=[{name:"1",x:0,y:5.65,signals:[]},{name:"2",x:58.8,y:5.65,signals:[]}]}static get styles(){return i.AH`
      :host {
        display: flex;
      }
    `}breakValue(t){const e=t>=1e10?9:t>=1e9?8:t>=1e8?7:t>=1e7?6:t>=1e6?5:t>=1e5?4:t>=1e4?3:t>=1e3?2:t>=100?1:t>=10?0:t>=1?-1:-2,s=Math.round(t/10**e);return 0===t?[0,0]:[Math.round(s%100),e]}render(){const{value:t}=this,e=parseFloat(t),[s,n]=this.breakValue(e),r=a[Math.floor(s/10)],l=a[s%10],o=a[n];return i.qy`
      <svg
        width="15.645mm"
        height="3mm"
        version="1.1"
        viewBox="0 0 15.645 3"
        xmlns="http://www.w3.org/2000/svg"
        xmlns:xlink="http://www.w3.org/1999/xlink"
      >
        <defs>
          <linearGradient
            id="a"
            x2="0"
            y1="22.332"
            y2="38.348"
            gradientTransform="matrix(.14479 0 0 .14479 -23.155 -4.0573)"
            gradientUnits="userSpaceOnUse"
            spreadMethod="reflect"
          >
            <stop stop-color="#323232" offset="0" />
            <stop stop-color="#fff" stop-opacity=".42268" offset="1" />
          </linearGradient>
        </defs>
        <rect y="1.1759" width="15.558" height=".63826" fill="#aaa" />
        <g stroke-width=".14479" fill="#d5b597">
          <path
            id="body"
            d="m4.6918 0c-1.0586 0-1.9185 0.67468-1.9185 1.5022 0 0.82756 0.85995 1.4978 1.9185 1.4978 0.4241 0 0.81356-0.11167 1.1312-0.29411h4.0949c0.31802 0.18313 0.71075 0.29411 1.1357 0.29411 1.0586 0 1.9185-0.67015 1.9185-1.4978 0-0.8276-0.85995-1.5022-1.9185-1.5022-0.42499 0-0.81773 0.11098-1.1357 0.29411h-4.0949c-0.31765-0.18244-0.7071-0.29411-1.1312-0.29411z"
          />
          <use xlink:href="#body" fill="url(#a)" opacity=".44886" />
          <rect x="4" y="0" width="1" height="3" fill="${r}" clip-path="url(#g)" />

          <path d="m6 0.29411v2.4117h0.96v-2.4117z" fill="${l}" />
          <path d="m7.8 0.29411v2.4117h0.96v-2.4117z" fill="${o}" />

          <rect x="10.69" y="0" width="1" height="3" fill="#F1D863" clip-path="url(#g)" />
          <clippath id="g">
            <use xlink:href="#body" />
          </clippath>
        </g>
      </svg>
    `}};r([(0,n.MZ)()],l.prototype,"value",void 0),l=r([(0,n.EM)("wokwi-resistor")],l)},33493:(t,e,s)=>{s.d(e,{C7:()=>n,ed:()=>i});const i=[" ","Spacebar"];function n(t){return("object"==typeof navigator?navigator.userAgent:"").indexOf("Macintosh")>=0?t.metaKey:t.ctrlKey}},29298:(t,e,s)=>{s.d(e,{p:()=>i});const i=3.78},31940:(t,e,s)=>{s.d(e,{a:()=>a});const i=new Set(["children","localName","ref","style","className"]),n=new WeakMap,r=(t,e,s,i,r)=>{const a=r?.[e];void 0===a?(t[e]=s,null==s&&e in HTMLElement.prototype&&t.removeAttribute(e)):s!==i&&((t,e,s)=>{let i=n.get(t);void 0===i&&n.set(t,i=new Map);let r=i.get(e);void 0!==s?void 0===r?(i.set(e,r={handleEvent:s}),t.addEventListener(e,r)):r.handleEvent=s:void 0!==r&&(i.delete(e),t.removeEventListener(e,r))})(t,a,s)},a=({react:t,tagName:e,elementClass:s,events:n,displayName:a})=>{const l=new Set(Object.keys(n??{})),o=t.forwardRef(((a,o)=>{const h=t.useRef(new Map),c=t.useRef(null),p={},d={};for(const[t,e]of Object.entries(a))i.has(t)?p["className"===t?"class":t]=e:l.has(t)||t in s.prototype?d[t]=e:p[t]=e;return t.useLayoutEffect((()=>{if(null===c.current)return;const t=new Map;for(const e in d)r(c.current,e,a[e],h.current.get(e),n),h.current.delete(e),t.set(e,a[e]);for(const[t,e]of h.current)r(c.current,t,void 0,e,n);h.current=t})),t.useLayoutEffect((()=>{c.current?.removeAttribute("defer-hydration")}),[]),p.suppressHydrationWarning=!0,t.createElement(e,{...p,ref:t.useCallback((t=>{c.current=t,"function"==typeof o?o(t):null!==o&&(o.current=t)}),[o])})}));return o.displayName=a??s.name,o}},50842:(t,e,s)=>{s.d(e,{mN:()=>C,AH:()=>o,W3:()=>b,Ec:()=>A});const i=globalThis,n=i.ShadowRoot&&(void 0===i.ShadyCSS||i.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,r=Symbol(),a=new WeakMap;class l{constructor(t,e,s){if(this._$cssResult$=!0,s!==r)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=t,this.t=e}get styleSheet(){let t=this.o;const e=this.t;if(n&&void 0===t){const s=void 0!==e&&1===e.length;s&&(t=a.get(e)),void 0===t&&((this.o=t=new CSSStyleSheet).replaceSync(this.cssText),s&&a.set(e,t))}return t}toString(){return this.cssText}}const o=(t,...e)=>{const s=1===t.length?t[0]:e.reduce(((e,s,i)=>e+(t=>{if(!0===t._$cssResult$)return t.cssText;if("number"==typeof t)return t;throw Error("Value passed to 'css' function must be a 'css' function result: "+t+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(s)+t[i+1]),t[0]);return new l(s,t,r)},h=(t,e)=>{if(n)t.adoptedStyleSheets=e.map((t=>t instanceof CSSStyleSheet?t:t.styleSheet));else for(const s of e){const e=document.createElement("style"),n=i.litNonce;void 0!==n&&e.setAttribute("nonce",n),e.textContent=s.cssText,t.appendChild(e)}},c=n?t=>t:t=>t instanceof CSSStyleSheet?(t=>{let e="";for(const s of t.cssRules)e+=s.cssText;return(t=>new l("string"==typeof t?t:t+"",void 0,r))(e)})(t):t,{is:p,defineProperty:d,getOwnPropertyDescriptor:y,getOwnPropertyNames:f,getOwnPropertySymbols:g,getPrototypeOf:x}=Object,m=globalThis,u=m.trustedTypes,w=u?u.emptyScript:"",v=m.reactiveElementPolyfillSupport,$=(t,e)=>t,b={toAttribute(t,e){switch(e){case Boolean:t=t?w:null;break;case Object:case Array:t=null==t?t:JSON.stringify(t)}return t},fromAttribute(t,e){let s=t;switch(e){case Boolean:s=null!==t;break;case Number:s=null===t?null:Number(t);break;case Object:case Array:try{s=JSON.parse(t)}catch(t){s=null}}return s}},A=(t,e)=>!p(t,e),k={attribute:!0,type:String,converter:b,reflect:!1,useDefault:!1,hasChanged:A};Symbol.metadata??=Symbol("metadata"),m.litPropertyMetadata??=new WeakMap;class C extends HTMLElement{static addInitializer(t){this._$Ei(),(this.l??=[]).push(t)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(t,e=k){if(e.state&&(e.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(t)&&((e=Object.create(e)).wrapped=!0),this.elementProperties.set(t,e),!e.noAccessor){const s=Symbol(),i=this.getPropertyDescriptor(t,s,e);void 0!==i&&d(this.prototype,t,i)}}static getPropertyDescriptor(t,e,s){const{get:i,set:n}=y(this.prototype,t)??{get(){return this[e]},set(t){this[e]=t}};return{get:i,set(e){const r=i?.call(this);n?.call(this,e),this.requestUpdate(t,r,s)},configurable:!0,enumerable:!0}}static getPropertyOptions(t){return this.elementProperties.get(t)??k}static _$Ei(){if(this.hasOwnProperty($("elementProperties")))return;const t=x(this);t.finalize(),void 0!==t.l&&(this.l=[...t.l]),this.elementProperties=new Map(t.elementProperties)}static finalize(){if(this.hasOwnProperty($("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty($("properties"))){const t=this.properties,e=[...f(t),...g(t)];for(const s of e)this.createProperty(s,t[s])}const t=this[Symbol.metadata];if(null!==t){const e=litPropertyMetadata.get(t);if(void 0!==e)for(const[t,s]of e)this.elementProperties.set(t,s)}this._$Eh=new Map;for(const[t,e]of this.elementProperties){const s=this._$Eu(t,e);void 0!==s&&this._$Eh.set(s,t)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(t){const e=[];if(Array.isArray(t)){const s=new Set(t.flat(1/0).reverse());for(const t of s)e.unshift(c(t))}else void 0!==t&&e.push(c(t));return e}static _$Eu(t,e){const s=e.attribute;return!1===s?void 0:"string"==typeof s?s:"string"==typeof t?t.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){this._$ES=new Promise((t=>this.enableUpdating=t)),this._$AL=new Map,this._$E_(),this.requestUpdate(),this.constructor.l?.forEach((t=>t(this)))}addController(t){(this._$EO??=new Set).add(t),void 0!==this.renderRoot&&this.isConnected&&t.hostConnected?.()}removeController(t){this._$EO?.delete(t)}_$E_(){const t=new Map,e=this.constructor.elementProperties;for(const s of e.keys())this.hasOwnProperty(s)&&(t.set(s,this[s]),delete this[s]);t.size>0&&(this._$Ep=t)}createRenderRoot(){const t=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return h(t,this.constructor.elementStyles),t}connectedCallback(){this.renderRoot??=this.createRenderRoot(),this.enableUpdating(!0),this._$EO?.forEach((t=>t.hostConnected?.()))}enableUpdating(t){}disconnectedCallback(){this._$EO?.forEach((t=>t.hostDisconnected?.()))}attributeChangedCallback(t,e,s){this._$AK(t,s)}_$ET(t,e){const s=this.constructor.elementProperties.get(t),i=this.constructor._$Eu(t,s);if(void 0!==i&&!0===s.reflect){const n=(void 0!==s.converter?.toAttribute?s.converter:b).toAttribute(e,s.type);this._$Em=t,null==n?this.removeAttribute(i):this.setAttribute(i,n),this._$Em=null}}_$AK(t,e){const s=this.constructor,i=s._$Eh.get(t);if(void 0!==i&&this._$Em!==i){const t=s.getPropertyOptions(i),n="function"==typeof t.converter?{fromAttribute:t.converter}:void 0!==t.converter?.fromAttribute?t.converter:b;this._$Em=i;const r=n.fromAttribute(e,t.type);this[i]=r??this._$Ej?.get(i)??r,this._$Em=null}}requestUpdate(t,e,s,i=!1,n){if(void 0!==t){const r=this.constructor;if(!1===i&&(n=this[t]),s??=r.getPropertyOptions(t),!((s.hasChanged??A)(n,e)||s.useDefault&&s.reflect&&n===this._$Ej?.get(t)&&!this.hasAttribute(r._$Eu(t,s))))return;this.C(t,e,s)}!1===this.isUpdatePending&&(this._$ES=this._$EP())}C(t,e,{useDefault:s,reflect:i,wrapped:n},r){s&&!(this._$Ej??=new Map).has(t)&&(this._$Ej.set(t,r??e??this[t]),!0!==n||void 0!==r)||(this._$AL.has(t)||(this.hasUpdated||s||(e=void 0),this._$AL.set(t,e)),!0===i&&this._$Em!==t&&(this._$Eq??=new Set).add(t))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(t){Promise.reject(t)}const t=this.scheduleUpdate();return null!=t&&await t,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??=this.createRenderRoot(),this._$Ep){for(const[t,e]of this._$Ep)this[t]=e;this._$Ep=void 0}const t=this.constructor.elementProperties;if(t.size>0)for(const[e,s]of t){const{wrapped:t}=s,i=this[e];!0!==t||this._$AL.has(e)||void 0===i||this.C(e,void 0,s,i)}}let t=!1;const e=this._$AL;try{t=this.shouldUpdate(e),t?(this.willUpdate(e),this._$EO?.forEach((t=>t.hostUpdate?.())),this.update(e)):this._$EM()}catch(e){throw t=!1,this._$EM(),e}t&&this._$AE(e)}willUpdate(t){}_$AE(t){this._$EO?.forEach((t=>t.hostUpdated?.())),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(t)),this.updated(t)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(t){return!0}update(t){this._$Eq&&=this._$Eq.forEach((t=>this._$ET(t,this[t]))),this._$EM()}updated(t){}firstUpdated(t){}}C.elementStyles=[],C.shadowRootOptions={mode:"open"},C[$("elementProperties")]=new Map,C[$("finalized")]=new Map,v?.({ReactiveElement:C}),(m.reactiveElementVersions??=[]).push("2.1.2")},36752:(t,e,s)=>{s.d(e,{JW:()=>k,XX:()=>I,c0:()=>C,qy:()=>A});const i=globalThis,n=i.trustedTypes,r=n?n.createPolicy("lit-html",{createHTML:t=>t}):void 0,a="$lit$",l=`lit$${Math.random().toFixed(9).slice(2)}$`,o="?"+l,h=`<${o}>`,c=document,p=()=>c.createComment(""),d=t=>null===t||"object"!=typeof t&&"function"!=typeof t,y=Array.isArray,f="[ \t\n\f\r]",g=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,x=/-->/g,m=/>/g,u=RegExp(`>|${f}(?:([^\\s"'>=/]+)(${f}*=${f}*(?:[^ \t\n\f\r"'\`<>=]|("|')|))|$)`,"g"),w=/'/g,v=/"/g,$=/^(?:script|style|textarea|title)$/i,b=t=>(e,...s)=>({_$litType$:t,strings:e,values:s}),A=b(1),k=b(2),C=(b(3),Symbol.for("lit-noChange")),S=Symbol.for("lit-nothing"),_=new WeakMap,M=c.createTreeWalker(c,129);function D(t,e){if(!y(t)||!t.hasOwnProperty("raw"))throw Error("invalid template strings array");return void 0!==r?r.createHTML(e):e}const E=(t,e)=>{const s=t.length-1,i=[];let n,r=2===e?"<svg>":3===e?"<math>":"",o=g;for(let e=0;e<s;e++){const s=t[e];let c,p,d=-1,y=0;for(;y<s.length&&(o.lastIndex=y,p=o.exec(s),null!==p);)y=o.lastIndex,o===g?"!--"===p[1]?o=x:void 0!==p[1]?o=m:void 0!==p[2]?($.test(p[2])&&(n=RegExp("</"+p[2],"g")),o=u):void 0!==p[3]&&(o=u):o===u?">"===p[0]?(o=n??g,d=-1):void 0===p[1]?d=-2:(d=o.lastIndex-p[2].length,c=p[1],o=void 0===p[3]?u:'"'===p[3]?v:w):o===v||o===w?o=u:o===x||o===m?o=g:(o=u,n=void 0);const f=o===u&&t[e+1].startsWith("/>")?" ":"";r+=o===g?s+h:d>=0?(i.push(c),s.slice(0,d)+a+s.slice(d)+l+f):s+l+(-2===d?e:f)}return[D(t,r+(t[s]||"<?>")+(2===e?"</svg>":3===e?"</math>":"")),i]};class P{constructor({strings:t,_$litType$:e},s){let i;this.parts=[];let r=0,h=0;const c=t.length-1,d=this.parts,[y,f]=E(t,e);if(this.el=P.createElement(y,s),M.currentNode=this.el.content,2===e||3===e){const t=this.el.content.firstChild;t.replaceWith(...t.childNodes)}for(;null!==(i=M.nextNode())&&d.length<c;){if(1===i.nodeType){if(i.hasAttributes())for(const t of i.getAttributeNames())if(t.endsWith(a)){const e=f[h++],s=i.getAttribute(t).split(l),n=/([.?@])?(.*)/.exec(e);d.push({type:1,index:r,name:n[2],strings:s,ctor:"."===n[1]?G:"?"===n[1]?T:"@"===n[1]?U:N}),i.removeAttribute(t)}else t.startsWith(l)&&(d.push({type:6,index:r}),i.removeAttribute(t));if($.test(i.tagName)){const t=i.textContent.split(l),e=t.length-1;if(e>0){i.textContent=n?n.emptyScript:"";for(let s=0;s<e;s++)i.append(t[s],p()),M.nextNode(),d.push({type:2,index:++r});i.append(t[e],p())}}}else if(8===i.nodeType)if(i.data===o)d.push({type:2,index:r});else{let t=-1;for(;-1!==(t=i.data.indexOf(l,t+1));)d.push({type:7,index:r}),t+=l.length-1}r++}}static createElement(t,e){const s=c.createElement("template");return s.innerHTML=t,s}}function O(t,e,s=t,i){if(e===C)return e;let n=void 0!==i?s._$Co?.[i]:s._$Cl;const r=d(e)?void 0:e._$litDirective$;return n?.constructor!==r&&(n?._$AO?.(!1),void 0===r?n=void 0:(n=new r(t),n._$AT(t,s,i)),void 0!==i?(s._$Co??=[])[i]=n:s._$Cl=n),void 0!==n&&(e=O(t,n._$AS(t,e.values),n,i)),e}class R{constructor(t,e){this._$AV=[],this._$AN=void 0,this._$AD=t,this._$AM=e}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(t){const{el:{content:e},parts:s}=this._$AD,i=(t?.creationScope??c).importNode(e,!0);M.currentNode=i;let n=M.nextNode(),r=0,a=0,l=s[0];for(;void 0!==l;){if(r===l.index){let e;2===l.type?e=new z(n,n.nextSibling,this,t):1===l.type?e=new l.ctor(n,l.name,l.strings,this,t):6===l.type&&(e=new V(n,this,t)),this._$AV.push(e),l=s[++a]}r!==l?.index&&(n=M.nextNode(),r++)}return M.currentNode=c,i}p(t){let e=0;for(const s of this._$AV)void 0!==s&&(void 0!==s.strings?(s._$AI(t,s,e),e+=s.strings.length-2):s._$AI(t[e])),e++}}class z{get _$AU(){return this._$AM?._$AU??this._$Cv}constructor(t,e,s,i){this.type=2,this._$AH=S,this._$AN=void 0,this._$AA=t,this._$AB=e,this._$AM=s,this.options=i,this._$Cv=i?.isConnected??!0}get parentNode(){let t=this._$AA.parentNode;const e=this._$AM;return void 0!==e&&11===t?.nodeType&&(t=e.parentNode),t}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(t,e=this){t=O(this,t,e),d(t)?t===S||null==t||""===t?(this._$AH!==S&&this._$AR(),this._$AH=S):t!==this._$AH&&t!==C&&this._(t):void 0!==t._$litType$?this.$(t):void 0!==t.nodeType?this.T(t):(t=>y(t)||"function"==typeof t?.[Symbol.iterator])(t)?this.k(t):this._(t)}O(t){return this._$AA.parentNode.insertBefore(t,this._$AB)}T(t){this._$AH!==t&&(this._$AR(),this._$AH=this.O(t))}_(t){this._$AH!==S&&d(this._$AH)?this._$AA.nextSibling.data=t:this.T(c.createTextNode(t)),this._$AH=t}$(t){const{values:e,_$litType$:s}=t,i="number"==typeof s?this._$AC(t):(void 0===s.el&&(s.el=P.createElement(D(s.h,s.h[0]),this.options)),s);if(this._$AH?._$AD===i)this._$AH.p(e);else{const t=new R(i,this),s=t.u(this.options);t.p(e),this.T(s),this._$AH=t}}_$AC(t){let e=_.get(t.strings);return void 0===e&&_.set(t.strings,e=new P(t)),e}k(t){y(this._$AH)||(this._$AH=[],this._$AR());const e=this._$AH;let s,i=0;for(const n of t)i===e.length?e.push(s=new z(this.O(p()),this.O(p()),this,this.options)):s=e[i],s._$AI(n),i++;i<e.length&&(this._$AR(s&&s._$AB.nextSibling,i),e.length=i)}_$AR(t=this._$AA.nextSibling,e){for(this._$AP?.(!1,!0,e);t!==this._$AB;){const e=t.nextSibling;t.remove(),t=e}}setConnected(t){void 0===this._$AM&&(this._$Cv=t,this._$AP?.(t))}}class N{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(t,e,s,i,n){this.type=1,this._$AH=S,this._$AN=void 0,this.element=t,this.name=e,this._$AM=i,this.options=n,s.length>2||""!==s[0]||""!==s[1]?(this._$AH=Array(s.length-1).fill(new String),this.strings=s):this._$AH=S}_$AI(t,e=this,s,i){const n=this.strings;let r=!1;if(void 0===n)t=O(this,t,e,0),r=!d(t)||t!==this._$AH&&t!==C,r&&(this._$AH=t);else{const i=t;let a,l;for(t=n[0],a=0;a<n.length-1;a++)l=O(this,i[s+a],e,a),l===C&&(l=this._$AH[a]),r||=!d(l)||l!==this._$AH[a],l===S?t=S:t!==S&&(t+=(l??"")+n[a+1]),this._$AH[a]=l}r&&!i&&this.j(t)}j(t){t===S?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,t??"")}}class G extends N{constructor(){super(...arguments),this.type=3}j(t){this.element[this.name]=t===S?void 0:t}}class T extends N{constructor(){super(...arguments),this.type=4}j(t){this.element.toggleAttribute(this.name,!!t&&t!==S)}}class U extends N{constructor(t,e,s,i,n){super(t,e,s,i,n),this.type=5}_$AI(t,e=this){if((t=O(this,t,e,0)??S)===C)return;const s=this._$AH,i=t===S&&s!==S||t.capture!==s.capture||t.once!==s.once||t.passive!==s.passive,n=t!==S&&(s===S||i);i&&this.element.removeEventListener(this.name,this,s),n&&this.element.addEventListener(this.name,this,t),this._$AH=t}handleEvent(t){"function"==typeof this._$AH?this._$AH.call(this.options?.host??this.element,t):this._$AH.handleEvent(t)}}class V{constructor(t,e,s){this.element=t,this.type=6,this._$AN=void 0,this._$AM=e,this.options=s}get _$AU(){return this._$AM._$AU}_$AI(t){O(this,t)}}const B=i.litHtmlPolyfillSupport;B?.(P,z),(i.litHtmlVersions??=[]).push("3.3.3");const I=(t,e,s)=>{const i=s?.renderBefore??e;let n=i._$litPart$;if(void 0===n){const t=s?.renderBefore??null;i._$litPart$=n=new z(e.insertBefore(p(),t),t,void 0,s??{})}return n._$AI(t),n}},52777:(t,e,s)=>{s.d(e,{EM:()=>i,MZ:()=>l,P:()=>h});const i=t=>(e,s)=>{void 0!==s?s.addInitializer((()=>{customElements.define(t,e)})):customElements.define(t,e)};var n=s(50842);const r={attribute:!0,type:String,converter:n.W3,reflect:!1,hasChanged:n.Ec},a=(t=r,e,s)=>{const{kind:i,metadata:n}=s;let a=globalThis.litPropertyMetadata.get(n);if(void 0===a&&globalThis.litPropertyMetadata.set(n,a=new Map),"setter"===i&&((t=Object.create(t)).wrapped=!0),a.set(s.name,t),"accessor"===i){const{name:i}=s;return{set(s){const n=e.get.call(this);e.set.call(this,s),this.requestUpdate(i,n,t,!0,s)},init(e){return void 0!==e&&this.C(i,void 0,t,e),e}}}if("setter"===i){const{name:i}=s;return function(s){const n=this[i];e.call(this,s),this.requestUpdate(i,n,t,!0,s)}}throw Error("Unsupported decorator location: "+i)};function l(t){return(e,s)=>"object"==typeof s?a(t,e,s):((t,e,s)=>{const i=e.hasOwnProperty(s);return e.constructor.createProperty(s,t),i?Object.getOwnPropertyDescriptor(e,s):void 0})(t,e,s)}const o=(t,e,s)=>(s.configurable=!0,s.enumerable=!0,Reflect.decorate&&"object"!=typeof e&&Object.defineProperty(t,e,s),s);function h(t,e){return(s,i,n)=>{const r=e=>e.renderRoot?.querySelector(t)??null;if(e){const{get:t,set:e}="object"==typeof i?s:n??(()=>{const t=Symbol();return{get(){return this[t]},set(e){this[t]=e}}})();return o(s,i,{get(){let s=t.call(this);return void 0===s&&(s=r(this),(null!==s||this.hasUpdated)&&e.call(this,s)),s}})}return o(s,i,{get(){return r(this)}})}}},12618:(t,e,s)=>{s.d(e,{WF:()=>a,AH:()=>i.AH,qy:()=>n.qy,JW:()=>n.JW});var i=s(50842),n=s(36752);const r=globalThis;class a extends i.mN{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){const t=super.createRenderRoot();return this.renderOptions.renderBefore??=t.firstChild,t}update(t){const e=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(t),this._$Do=(0,n.XX)(e,this.renderRoot,this.renderOptions)}connectedCallback(){super.connectedCallback(),this._$Do?.setConnected(!0)}disconnectedCallback(){super.disconnectedCallback(),this._$Do?.setConnected(!1)}render(){return n.c0}}a._$litElement$=!0,a.finalized=!0,r.litElementHydrateSupport?.({LitElement:a});const l=r.litElementPolyfillSupport;l?.({LitElement:a}),(r.litElementVersions??=[]).push("4.2.2")}}]);