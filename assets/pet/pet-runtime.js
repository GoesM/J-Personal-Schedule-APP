/* Articulated renderer. Shape order and original colors are preserved. */
(()=>{
  const {art,rigs,manifest}=window.JPetData;
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function pose(id,state,t,direction=1,speed=1){
    const r=rigs[id],walking=state==='walk',phase=t*Math.PI*2*(walking?Math.max(.8,Math.min(2.8,speed*1.6)):1),s=Math.sin(phase);
    let legs=walking?s*17:0,arm=walking?-s*9:0,bob=walking?-Math.abs(Math.sin(phase))*2:Math.sin(t*2)*.6,head=0;
    if(state==='start'){legs=Math.sin(Math.min(t/.22,1)*Math.PI)*7;arm=-legs*.6;}
    if(state==='settle')bob=Math.sin(Math.min(t/.32,1)*Math.PI)*2;
    if(state==='added'){head=Math.sin(t*7)*3;arm=-8+Math.sin(t*10)*5;}
    if(state==='wave')arm=-14+Math.sin(t*9)*9;
    if(state==='celebrate'){bob=-Math.abs(Math.sin(t*8))*9;arm=-17+Math.sin(t*8)*10;legs=Math.sin(t*8)*4;}
    if(state==='sleep'){head=5;arm=0;}
    const blink=state==='sleep'||t%4.7>4.54;
    const rotate=(angle,p)=>`rotate(${angle.toFixed(2)} ${p[0]} ${p[1]})`;
    const parts=art[id].map(p=>{
      let transform='';const spread=direction<0?-1:1;
      if(p.part==='leftLeg')transform=rotate(legs*spread,[r.hip[0]-19,r.hip[1]]);
      if(p.part==='rightLeg')transform=rotate(-legs*spread,[r.hip[0]+19,r.hip[1]]);
      if(p.part==='leftArm')transform=rotate(arm*(r.armScale||1),[r.shoulder[0]-30,r.shoulder[1]]);
      if(p.part==='rightArm')transform=rotate(-arm*(r.armScale||1),[r.shoulder[0]+30,r.shoulder[1]]);
      if(p.part==='head'||p.part==='eye')transform=rotate(head,r.head);
      if(p.part==='eye'&&blink)transform+=` translate(0 ${p.center[1]}) scale(1 .12) translate(0 ${-p.center[1]})`;
      return `<g data-part="${p.part}" transform="${transform}">${p.svg}</g>`;
    }).join('');
    // Turn through stance and body lean, never mirror text or held objects.
    const lean=walking?direction*1.6:0;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" aria-label="${esc(id+' '+state)}" role="img"><g transform="translate(24 ${24+bob}) translate(104 210) rotate(${lean}) translate(-104 -210) scale(.52)">${parts}</g></svg>`;
  }
  class JPet extends HTMLElement{
    static get observedAttributes(){return ['character','state','direction','speed','paused'];}
    constructor(){super();this.attachShadow({mode:'open'});this.started=0;this.last=0;this.motion=matchMedia('(prefers-reduced-motion: reduce)');this.tick=this.tick.bind(this);}
    connectedCallback(){this.started=performance.now();this.draw(0);this.raf=requestAnimationFrame(this.tick);}
    disconnectedCallback(){cancelAnimationFrame(this.raf);}
    attributeChangedCallback(name){if(name==='state')this.started=performance.now();if(this.isConnected)this.draw((performance.now()-this.started)/1000);}
    draw(t){const id=art[this.getAttribute('character')]?this.getAttribute('character'):'ISTJ',state=this.motion.matches||this.hasAttribute('paused')?'idle':this.getAttribute('state')||'idle';
      this.shadowRoot.innerHTML='<style>:host{display:block;width:100%;height:100%;pointer-events:none}svg{width:100%;height:100%;display:block;pointer-events:none}path,polygon,rect,circle,ellipse{pointer-events:visiblePainted}</style>'+pose(id,state,this.motion.matches?0:t,Number(this.getAttribute('direction'))||1,Number(this.getAttribute('speed'))||1);
    }
    tick(now){if(!document.hidden&&!this.hasAttribute('paused')&&now-this.last>1000/24){this.last=now;this.draw((now-this.started)/1000);}this.raf=requestAnimationFrame(this.tick);}
    hitTest(x,y){const e=this.shadowRoot.elementFromPoint(x,y);return !!e&&['path','polygon','rect','circle','ellipse'].includes(e.localName);}
  }
  window.JPet={pose,manifest};if(!customElements.get('j-pet'))customElements.define('j-pet',JPet);
})();
