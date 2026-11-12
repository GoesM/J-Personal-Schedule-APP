const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function clampRect(r,area){return {...r,x:Math.round(clamp(r.x,area.x,area.x+Math.max(0,area.width-r.width))),y:Math.round(clamp(r.y,area.y,area.y+Math.max(0,area.height-r.height)))};}
function placePanel(pet,area,size,previous=null){
  const gap=12,m=8,a={x:area.x+m,y:area.y+m,width:area.width-m*2,height:area.height-m*2};
  const safe=r=>r&&r.x>=a.x&&r.y>=a.y&&r.x+r.width<=a.x+a.width&&r.y+r.height<=a.y+a.height&&(r.x>=pet.x+pet.width+gap||r.x+r.width<=pet.x-gap||r.y>=pet.y+pet.height+gap||r.y+r.height<=pet.y-gap);
  if(previous&&previous.width===size.width&&previous.height===size.height&&safe(previous))return previous;
  const zones=[
    {x:pet.x+pet.width+gap,y:a.y,width:a.x+a.width-pet.x-pet.width-gap,height:a.height},
    {x:a.x,y:a.y,width:pet.x-gap-a.x,height:a.height},
    {x:a.x,y:a.y,width:a.width,height:pet.y-gap-a.y},
    {x:a.x,y:pet.y+pet.height+gap,width:a.width,height:a.y+a.height-pet.y-pet.height-gap},
  ];
  const full=zones.find(z=>z.width>=size.width&&z.height>=size.height);
  const z=full||zones.filter(z=>z.width>=260&&z.height>=220).sort((a,b)=>Math.min(b.width,size.width)*Math.min(b.height,size.height)-Math.min(a.width,size.width)*Math.min(a.height,size.height))[0];
  if(!z)return null;
  const r={width:Math.floor(Math.min(size.width,z.width)),height:Math.floor(Math.min(size.height,z.height))};
  r.x=Math.round(clamp(pet.x,z.x,z.x+z.width-r.width));r.y=Math.round(clamp(pet.y,z.y,z.y+z.height-r.height));return safe(r)?r:null;
}
module.exports={clampRect,placePanel};
