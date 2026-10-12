const assert=require('node:assert/strict');
require('./planner.js');require('./navigation.js');
const {delivery,simplify,direction}=globalThis.DVNavigation;
const entity=(name,label)=>({name,label,body:{x:0,y:0,width:32,height:64}});
const exact=entity('NPC-FISHING');
assert.equal(delivery([entity('portal_fishing'),exact,entity('npc_mining')],'fishing').entity,exact);
assert.equal(delivery([exact],'fishing').method,'exact');
const renamed=entity('npc_fishng');
assert.equal(delivery([renamed],'fishing').entity,renamed);
assert.equal(delivery([renamed],'fishing').method,'fuzzy');
assert.equal(delivery([entity('portal_fishing'),entity('fishing_coastline_1'),entity('npc_mining')],'fishing'),null);
assert.equal(delivery([entity('npc_fishng'),entity('npc_fishin')],'fishing'),null,'ambiguous fuzzy matches must not select an NPC');
assert.equal(delivery([entity('npc_fishing'),entity('npc_fishing')],'fishing'),null,'duplicate exact identifiers require disambiguation');
assert.equal(delivery([{...exact,destroyed:true}],'fishing'),null);
assert.equal(delivery([entity('renamed','npc_combat')],'hunting').method,'exact');
assert.equal(delivery([entity('npc_hunting')],'hunting').method,'exact');
const straight=Array.from({length:100},(_,i)=>({x:i*12,y:0}));
assert.deepEqual(simplify(straight),[straight[0],straight.at(-1)]);
const turn=[{x:0,y:0},{x:12,y:0},{x:24,y:0},{x:24,y:12},{x:24,y:24}];
assert.deepEqual(simplify(turn),[turn[0],turn[2],turn[4]],'keep turns and never cut diagonally across obstacles');
assert.equal(simplify([{x:0,y:0},{x:12,y:0},{x:0,y:0}]).length,3,'retain a reversal');
assert.equal(direction({x:0,y:0},{x:100,y:99},'x').code,'ArrowRight');
assert.equal(direction({x:50,y:0},{x:100,y:99},'x').code,'ArrowRight','do not switch axes just because remaining Y distance is larger');
assert.equal(direction({x:98,y:0},{x:100,y:99},'x').code,'ArrowDown');
assert.equal(direction({x:99,y:98},{x:100,y:99},'y').code,null);
assert.equal(direction({x:11,y:6},{x:12,y:12},'x',7).code,null,'11px movement must not oscillate around a 12px waypoint');
const wall=[{x:36,y:-12},{x:60,y:-12},{x:60,y:60},{x:36,y:60}];
const path=globalThis.DVAutoplay.findPath({x:0,y:0},{x:96,y:0},[wall],{x:2,y:2});
const smooth=simplify(path);
assert.ok(smooth.length<path.length);
for(let i=1;i<smooth.length;i++){
  const a=smooth[i-1],b=smooth[i],distance=Math.hypot(b.x-a.x,b.y-a.y);
  for(let d=0;d<=distance;d+=1){const t=distance?d/distance:0;
    assert.equal(globalThis.DVAutoplay.polygonIntersectsRect(wall,{x:a.x+(b.x-a.x)*t-2,y:a.y+(b.y-a.y)*t-2,width:4,height:4}),false,'compressed route must remain outside the wall');
  }
}
console.log('PASS: exact/fuzzy NPC identity, ambiguity rejection, stable walking direction, straight-route compression and obstacle clearance');

const readyRotation={inFishing:true,inHub:false,visible:true,online:true,connected:true,loading:false,otherDialog:false,questReady:false};
assert.equal(globalThis.DVNavigation.shouldReturnFishing('random','fishing',true,readyRotation),true);
for(const mode of ['hunting','mining'])assert.equal(globalThis.DVNavigation.shouldReturnFishing('random',mode,true,readyRotation),false,'rotation must never repeatedly exit another activity');
assert.equal(globalThis.DVNavigation.shouldReturnFishing('random','fishing',true,{...readyRotation,loading:true}),false);
const search=globalThis.DVAutoplay.createPathSearch({x:0,y:0},[{x:48,y:0},{x:96,y:0}],[wall],{x:2,y:2});
let part=search.step(2,Infinity);
assert.equal(part.done,false);assert.equal(part.expanded,2,'each frame must respect the expansion limit');
let frames=0;
while(!part.done&&frames++<1000)part=search.step(2,Infinity);
assert.ok(part.done&&part.path,'a resumed search must eventually find the reachable alternative');
assert.deepEqual(part.path.at(-1),{x:96,y:0},'ignore an approach goal inside a wall');
assert.ok(part.path.every(p=>!globalThis.DVAutoplay.polygonIntersectsRect(wall,{x:p.x-2,y:p.y-2,width:4,height:4})));
const deferred=globalThis.DVAutoplay.createPathSearch({x:0,y:0},[{x:120,y:120}],[],{x:2,y:2});
assert.equal(deferred.step(200,0).expanded,0,'an exhausted frame budget must defer the search');

const dodge=globalThis.DVNavigation.dodge;
const player={body:{x:0,y:0,width:32,height:64}};
const warning={body:{x:20,y:0,width:32,height:64},aoe:{parent:{}}};
assert.equal(dodge(player,[warning],[]),'ArrowLeft','move away from an active warning');
assert.equal(dodge(player,[{...warning,destroyed:true}],[]),null,'ignore removed hazards');
assert.equal(dodge(player,[{body:warning.body}],[]),null,'ignore inactive warnings');
const blockingWall=[{x:-80,y:-80},{x:-1,y:-80},{x:-1,y:160},{x:-80,y:160}];
assert.notEqual(dodge(player,[warning],[blockingWall]),'ArrowLeft','never dodge through a wall');
assert.equal(dodge(player,[],[]),null);
console.log('PASS: warning dodge, inactive hazards and wall clearance');

const combatDirection=globalThis.DVNavigation.combatDirection;
const fighter={body:{x:0,y:0,width:32,height:64},x:32,y:64,scale:{x:1}};
const enemy={body:{x:72,y:56,width:27,height:16}};
assert.equal(combatDirection(fighter,enemy),null,'align native attack anchor, not body center');
assert.equal(combatDirection({...fighter,scale:{x:-1}},enemy),'ArrowRight','face the enemy before waiting to attack');
assert.equal(combatDirection(fighter,{body:{x:40,y:100,width:27,height:16}}),'ArrowDown');
assert.equal(combatDirection(fighter,{body:{x:140,y:56,width:27,height:16}}),'ArrowRight');
console.log('PASS: native combat anchor and facing');

assert.equal(combatDirection(fighter,{body:{x:30,y:56,width:27,height:16}}),'ArrowLeft','retreat from overlapping monster bodies');
assert.equal(combatDirection({...fighter,scale:{x:-1}},{body:{x:50,y:56,width:27,height:16}}),'ArrowLeft','make room before turning toward a close monster');

const giant={body:{x:-100,y:-100,width:300,height:300},canCollide:true};
assert.ok(dodge(player,[giant],[]),'move toward an exit even when one step cannot leave a large attack area');
const radial={name:'monster_red',radialWeaponBody:{x:0,y:0,width:120,height:120}};
const projectile={name:'monster_yellow_projectile_1',isEnemy:true,canCollide:true,body:{x:0,y:0,width:12,height:12}};
assert.equal(globalThis.DVNavigation.combatDangers([radial,projectile,{...radial,destroyed:true}]).length,2);
console.log('PASS: large-area escape and native combat threat extraction');

const liveMonster={name:'monster_1',isEnemy:true,canCollide:true,body:{x:0,y:0,width:27,height:16}};
assert.equal(globalThis.DVNavigation.combatDangers([liveMonster,{...liveMonster,isDead:true}]).length,1,'avoid living monsters including those other than the current target');

const forecast=globalThis.DVNavigation.combatDangers([{...projectile,dx:-4,dy:0}])[0].body;
assert.equal(forecast.x,-48);assert.equal(forecast.width,60,'anticipate the swept path of an incoming projectile');

const rect=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
const cornerPlayer={body:{x:0,y:0,width:32,height:64}};
const cornerWalls=[rect(48,52,20,200),rect(-100,0,148,32),rect(-40,32,39,250),rect(-100,84,250,20)];
const cornerThreat={body:{x:-100,y:-100,width:170,height:400},canCollide:true};
assert.equal(dodge(cornerPlayer,[cornerThreat],cornerWalls),'ArrowUp','take the short clear segment along a wall when every 64px direction is blocked');
cornerPlayer.body.y=-16;
assert.equal(dodge(cornerPlayer,[cornerThreat],cornerWalls),'ArrowRight','retain the escape plan and turn around the wall instead of reversing');
console.log('PASS: wall-corner escape and retained turning route');
