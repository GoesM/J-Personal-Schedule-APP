import {test} from 'node:test';
import assert from 'node:assert/strict';
import {petSnapshot,executePetCommand,revision} from '../src/pet-model.mjs';
import geometry from '../desktop/pet/geometry.cjs';
import reminders from '../desktop/pet/reminders.cjs';
const row=(id,item)=>({id,item,versions:[{id:'v'+id}],deleted:false,conflict:false});
test('桌宠预览保留时间、截止日、完成颜色；日期按本地时区',()=>{
 const rows=[row('1',{kind:'schedule',title:'讨论',date:'2026-11-12',start:'14:00',end:'15:30',done:false}),row('2',{kind:'longtodo',title:'论文',ddl:'2026-11-13'}),row('3',{kind:'todo',title:'昨日',date:'2026-11-11'}),row('4',{kind:'todo',title:'完成',date:'2026-11-12',done:true})];
 const s=petSnapshot(rows,'INFJ',false,new Date(2026,10,12,14,10));assert.equal(s.today.length,2);assert.equal(s.today[0].end,'15:30');assert.equal(s.today[1].color,'done');assert.equal(s.long[0].ddl,'2026-11-13');
});
test('桌宠操作拒绝过期快照、冲突和同步中写入；失败不假报成功',async()=>{
 const r=row('1',{title:'事项',kind:'todo',date:'2026-11-12',done:false});let writes=0;
 const deps={getRows:()=>[r],save:async()=>{writes++;},isBusy:()=>false};
 await assert.rejects(executePetCommand({type:'toggle',id:r.id,revision:'stale',done:true},deps),/变化/);
 r.conflict=true;await assert.rejects(executePetCommand({type:'toggle',id:r.id},deps),/冲突/);r.conflict=false;
 await assert.rejects(executePetCommand({type:'add',tab:'today',title:'a'},{...deps,isBusy:()=>true}),/同步/);
 await executePetCommand({type:'toggle',id:r.id,revision:revision(r),done:true},deps);assert.equal(writes,1);
 await assert.rejects(executePetCommand({type:'add',tab:'long',title:'a'},{...deps,save:async()=>{throw Error('磁盘写入失败');}}),/磁盘/);
 let saved;await executePetCommand({type:'add',tab:'today',title:'  新任务  '},{...deps,now:()=>new Date(2026,10,13,0,1),save:async v=>saved=v});assert.equal(saved.date,'2026-11-13');assert.equal(saved.title,'新任务');
});
test('弹窗避开角色与边界，支持负坐标多屏和极小工作区',()=>{
 for(const area of [{x:0,y:0,width:1920,height:1040},{x:-1280,y:20,width:1280,height:700},{x:0,y:0,width:800,height:600}])for(const size of [144,192,240])for(const u of [0,.5,1])for(const v of [0,.5,1]){
   const pet={x:area.x+u*(area.width-size),y:area.y+v*(area.height-size),width:size,height:size};
   const p=geometry.placePanel(pet,area,{width:340,height:500});if(!p)continue;
   assert(p.x>=area.x&&p.y>=area.y&&p.x+p.width<=area.x+area.width&&p.y+p.height<=area.y+area.height);
   assert(p.x>=pet.x+size+12||p.x+p.width<=pet.x-12||p.y>=pet.y+size+12||p.y+p.height<=pet.y-12);
 }
 assert.equal(geometry.placePanel({x:10,y:10,width:240,height:240},{x:0,y:0,width:260,height:260},{width:340,height:500}),null);
});
test('无声提醒去重、稍后提醒、完成后取消，忙碌时不打扰',()=>{
 const now=new Date(2026,10,12,13,55).getTime(),s={today:[{id:'1',date:'2026-11-12',start:'14:00',end:'15:00',title:'讨论'}],long:[]};
 const n=reminders.candidate(s,{},now);assert(n);assert.equal(reminders.candidate(s,{[n.key]:null},now),null);
 assert.equal(reminders.candidate(s,{[n.key]:now+300000},now),null);assert(reminders.candidate(s,{[n.key]:now+300000},now+300001));
 assert.equal(reminders.candidate({...s,busy:true},{},now),null);s.today[0].done=true;assert.equal(reminders.candidate(s,{},now),null);
});
