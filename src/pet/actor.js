const host=window.petHost,actor=document.getElementById('actor'),pet=document.getElementById('character');
let held=false,direction=1;
actor.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;event.preventDefault();held=true;actor.setPointerCapture(event.pointerId);host.call('dragStart').catch(()=>{held=false;});
});
function release(event){if(!held)return;held=false;if(actor.hasPointerCapture(event.pointerId))actor.releasePointerCapture(event.pointerId);host.call('dragEnd').catch(()=>{});}
actor.addEventListener('pointerup',release);actor.addEventListener('pointercancel',release);actor.addEventListener('lostpointercapture',release);
window.addEventListener('blur',()=>{if(held){held=false;host.call('dragEnd').catch(()=>{});}});
actor.addEventListener('contextmenu',e=>{e.preventDefault();host.call('menu').catch(()=>{});});
host.onEvent(({type,value})=>{
  if(type==='snapshot'&&value)pet.setAttribute('character',value.persona);
  if(type==='motion'){if(value.direction)direction=value.direction;pet.setAttribute('direction',direction);if(value.speed)pet.setAttribute('speed',value.speed);if(pet.getAttribute('state')!==value.state)pet.setAttribute('state',value.state);}
  if(type==='probe')host.call('hit',pet.hitTest(value.x,value.y)).catch(()=>{});
  if(type==='settings'){if(value.enabled)pet.removeAttribute('paused');else pet.setAttribute('paused','');if(!held)pet.setAttribute('state',value.resting?'sleep':'idle');}
});
host.call('ready').catch(()=>{});
