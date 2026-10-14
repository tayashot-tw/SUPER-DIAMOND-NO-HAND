const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
require('./planner.js');
const {Autoplayer,findPath,fishingClick,polygonIntersectsRect}=globalThis.DVAutoplay;
function state(extra={}){
  return {enabled:true,online:true,connected:true,ready:true,visible:true,loading:false,
    inHub:false,inFishing:true,atFishing:true,canPlay:true,map:'map_fishing',level:21,experience:100,
    itemCount:0,questSubmissions:0,fishingUnlocked:true,...extra};
}
function readyBot(){const bot=new Autoplayer();bot.decide(state(),0);return bot;}
assert.equal(fishingClick({visible:true,done:false,cooldown:0,indicator:50,left:30,width:40}),true);
for(const input of [{indicator:10},{cooldown:400},{done:true},{visible:false}])
  assert.equal(fishingClick({visible:true,done:false,cooldown:0,indicator:50,left:30,width:40,...input}),false);
let bot=readyBot();
assert.equal(bot.decide(state({slider:{visible:true,cooldown:0,done:false,indicator:50,left:30,width:40,clicks:0}}),5000).type,'interact');
assert.equal(bot.decide(state({slider:{visible:true,cooldown:0,done:false,indicator:50,left:30,width:40,clicks:1}}),5100).type,'wait');
assert.equal(bot.decide(state({connected:false}),5200).type,'offline');
assert.equal(bot.decide(state({questReady:true,map:'map_hub',inHub:true}),5300).type,'wait');
assert.equal(bot.decide(state({questReady:true,map:'map_hub',inHub:true}),10300).type,'navigateDelivery');
// Delivery path must be refreshed from actual position every tick, not throttled for 1.2 seconds.
assert.equal(bot.decide(state({questReady:true,map:'map_hub',inHub:true}),10330).type,'navigateDelivery');
bot=readyBot();
assert.equal(bot.decide(state({inHub:true,inFishing:false}),5000).type,'travelFishing');
bot=readyBot();
assert.equal(bot.decide(state({questReady:true}),5000).type,'exitFishing');
bot=readyBot();
assert.equal(bot.decide(state({inHub:true,questReady:true,atDelivery:true}),5000).type,'interact');
bot=readyBot();
assert.equal(bot.decide(state({submissionOpen:true,canSubmit:true}),5000).type,'submit');
assert.equal(bot.decide(state({submissionOpen:true,canSubmit:true,submitting:true}),6800).type,'wait');
assert.equal(bot.decide(state({submissionOpen:true,canSubmit:false}),7000).type,'closeSubmission');
assert.equal(readyBot().decide(state({bagFull:true,questReady:false}),5000).type,'halt');
assert.equal(readyBot().decide(state({submissionOpen:true,dailyLimit:true}),5000).type,'dailyLimit');
assert.equal(readyBot().decide(state({inHub:true,fishingUnlocked:false}),5000).type,'halt');
assert.equal(readyBot().decide(state({visible:false}),5000).type,'wait');
const wall=[{x:36,y:-12},{x:60,y:-12},{x:60,y:60},{x:36,y:60}];
const path=findPath({x:0,y:0},{x:96,y:0},[wall],{x:2,y:2});
assert.ok(path&&path.length>0);
assert.ok(path.some(p=>p.y<=-24||p.y>=72),'must route around wall');
assert.ok(path.every(p=>!polygonIntersectsRect(wall,{x:p.x-2,y:p.y-2,width:4,height:4})));
assert.equal(findPath({x:0,y:0},{x:48,y:0},[wall],{x:2,y:2}),null);
assert.equal(polygonIntersectsRect([{x:0,y:4},{x:10,y:4},{x:10,y:6},{x:0,y:6}],{x:4,y:0,width:2,height:10}),true);
async function mainIntegration(){
  let now=0,interval,subscribed=0,originalCalls=0,diamondNext;
  const messages=[],keys=[],listeners={},actions=[];
  const data={overall_level:{level:21,experience:100},activities_data:{fishing:{level:5,has_played:true,next_quest:{item:'BLUE_FISH',quantity:2}}}};
  const observable=value=>({subscribe(cb){subscribed++;cb(value);return {unsubscribe(){}};}});
  const player={body:{x:0,y:0,width:10,height:10},collidedObj:null};
  const services={player:{data:()=>data},inventory:{items$:observable({fishing:{is_full:false,items:[]}})},quest:{activityQuests$:observable({fishing:{quest:data.activities_data.fishing.next_quest}})},
    gameState:{inGameLoading$:{value:false},totalDiamonds$:{subscribe(cb){subscribed++;diamondNext=cb;cb(4000);return {unsubscribe(){}};}}},rpg:{isConnected$:{value:true},teleport:id=>actions.push(id)},auth:{userData$:{value:{data:{total_diamonds:5500}}}},ui:{}};
  const level={label:'map_hub',preventUpdates:false,managers:{entity:{player,entities:[]}}};
  class FakeGame{constructor(){this.services=services;this.world={services,managers:{level:{currentLevel:level}},uiManager:{}};this.started=false;}init(){originalCalls++;this.started=true;}}
  const context={console,URL,performance,Date:{now:()=>now},navigator:{onLine:true},document:{hidden:false,activeElement:null,addEventListener(){}},
    location:{href:'https://diamondvalley.withgoogle.com/intl/ALL_tw/game/',origin:'https://diamondvalley.withgoogle.com'},
    setInterval:cb=>{interval=cb;},setTimeout:()=>1,clearTimeout(){},KeyboardEvent:class{constructor(type,init){this.type=type;Object.assign(this,init);}},FakeGame};
  context.window={postMessage:m=>messages.push(m),addEventListener:(type,cb)=>{listeners[type]=cb;},dispatchEvent:e=>keys.push(e)};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(__dirname+'/settings.js','utf8'),context);
  vm.runInContext(fs.readFileSync(__dirname+'/planner.js','utf8'),context);
  vm.runInContext(fs.readFileSync(__dirname+'/activities.js','utf8'),context);
  vm.runInContext(fs.readFileSync(__dirname+'/navigation.js','utf8'),context);
  vm.runInContext(fs.readFileSync(__dirname+'/exchange.js','utf8'),context);
  vm.runInContext(fs.readFileSync(__dirname+'/dash.js','utf8'),context);
  const adapter=fs.readFileSync(__dirname+'/main.js','utf8').replace('await import(new URL(`../${VERSION}`,location.href).href)','await Promise.resolve({Game:FakeGame})').replace('  hook();','  globalThis.testExecute=execute;globalThis.testSnapshot=snapshot;globalThis.testPolygons=polygonList;globalThis.testNavigation={feet,navigationGoal,navigate,fishingAreas,transition,navigationGoals,miningInteraction,fishingInteraction,hasContact,auditDamage};hook();');
  vm.runInContext(adapter,context);await new Promise(resolve=>setImmediate(resolve));
  assert.doesNotThrow(()=>context.testSnapshot(),'cold start before Game init must not throw');interval();
  const game=new FakeGame();game.init();assert.equal(originalCalls,1);assert.equal(subscribed,3);
  assert.equal(context.testSnapshot().diamonds,4000);diamondNext(3900);assert.equal(context.testSnapshot().diamonds,3900);diamondNext(0);assert.equal(context.testSnapshot().diamonds,0,"zero balance must not fall back to cumulative total");diamondNext(4000);
  const box={pos:{x:36,y:0},toPolygon(){return {pos:this.pos,points:[{x:0,y:0},{x:24,y:0},{x:24,y:60},{x:0,y:60}]};}};
  const polygons=context.testPolygons({collisionMap:[{body:box}]});
  assert.equal(polygons.length,1,'SAT.Box tile walls must not be discarded');
  assert.equal(polygons[0][1].x,60);
  const halfBox={pos:{x:0,y:0},w:64,h:64,toPolygon:box.toPolygon};
  const half=context.testPolygons({collisionMap:[{body:halfBox,type:'half',rotation:'north'}]})[0];
  assert.equal(Math.min(...half.map(p=>p.y)),32,'half tile must leave its upper half walkable');
  const rotated=context.testPolygons({collisionMap:[{body:halfBox,type:'half',rotation:'east'}]})[0];
  assert.ok(Math.max(...rotated.map(p=>p.x))<=32.000001,'rotation must match native collision geometry');
  const triangle=context.testPolygons({collisionMap:[{body:halfBox,type:'full-diagonal',rotation:'north'}]})[0];assert.equal(triangle.length,3);

  assert.equal(findPath({x:0,y:24},{x:96,y:24},polygons,{x:2,y:2}).some(p=>p.y<=-12||p.y>=72),true);
  const nativePlayer={body:{x:0,y:-46,width:32,height:64}};
  const narrowBridge=[[{x:-100,y:-100},{x:0,y:-100},{x:0,y:200},{x:-100,y:200}],[{x:36,y:-100},{x:136,y:-100},{x:136,y:200},{x:36,y:200}]];
  assert.ok(findPath({x:18,y:0},{x:18,y:96},narrowBridge,{x:16,y:6},6),'native feet and fine grid must traverse a 36px passage');
  const tinyNpc={label:'npc_hvu_boat',body:{x:96,y:0,width:50,height:86},collider:{shape:{points:[0,0,1,0,1,1,0,1]}}};
  assert.ok(context.testNavigation.navigationGoals(tinyNpc,nativePlayer).length>0,'NPC shape must not erase all collision-checked approach candidates');
  const standGoals=context.testNavigation.navigationGoals({standGoal:{x:1099,y:757}},nativePlayer);assert.equal(standGoals.length,7);assert.ok(standGoals.every(g=>Math.abs(g.x-1099)<=6&&Math.abs(g.y-757)<=6),'Boss return candidates stay within attack anchor tolerance');
  const damagePlayer={hp:55,getCurrentHealth(){return this.hp;},onShot(source,amount){this.hp-=amount;return source.name;}};
  context.testNavigation.auditDamage(damagePlayer);context.testNavigation.auditDamage(damagePlayer);
  assert.equal(damagePlayer.onShot({name:'monster_test'},7),'monster_test');
  assert.equal(damagePlayer.hp,48,'damage instrumentation must preserve native this, parameters and execute exactly once');
  const foot=context.testNavigation.feet(nativePlayer);
  assert.equal(foot.y,12);assert.equal(foot.halfY,6,'use the native 12px foot collider');
  const corridor=[[{x:-100,y:-100},{x:200,y:-100},{x:200,y:0},{x:-100,y:0}],
    [{x:-100,y:24},{x:200,y:24},{x:200,y:100},{x:-100,y:100}]];
  const rock={body:{x:96,y:-52,width:16,height:64}};
  const footPath=context.testNavigation.navigationGoal(rock,nativePlayer,corridor);
  assert.ok(footPath,'a corridor usable by the native foot collider must remain usable');
  assert.equal(findPath({x:16,y:-14},{x:104,y:10},corridor,{x:17,y:33}),null,'full-height model incorrectly blocks this corridor');
  const cart={body:{x:96,y:0,width:64,height:64}};
  const cartWall=[[{x:96,y:0},{x:160,y:0},{x:160,y:64},{x:96,y:64}]];
  const cartPath=context.testNavigation.navigationGoal(cart,{body:{x:0,y:40,width:32,height:64}},cartWall);
  assert.ok(cartPath,'cart front approach must survive grid rounding and clearance');
  const cartGoal=cartPath.at(-1);
  for(const goal of context.testNavigation.navigationGoals(cart,{body:{x:0,y:40,width:32,height:64}})){
    for(const dx of [-9,9])for(const dy of [-9,9]){const body={x:goal.x+dx-16,y:goal.y+dy-58,width:32,height:64};assert.ok(body.x<160&&body.x+32>96&&body.y<64&&body.y+64>0,'arrival tolerance must retain a real cart overlap');}
  }
  assert.ok(cartGoal.y>64&&cartGoal.y<122,'feet stay outside the solid cart while the upper body can reach it');
  listeners.message({source:context.window,origin:context.location.origin,data:{channel:'diamond-valley-autoplay-v2',source:'panel',type:'config',enabled:true}});
  interval();now=5000;interval();
  assert.deepEqual(actions,['waypoint_fishing']);
  assert.ok(messages.some(m=>m.type==='status'&&m.level===21&&m.diamonds===4000));
  // Server connection loss releases a held movement without invoking a game action.
  services.rpg.isConnected$.value=false;now=6000;interval();
  assert.equal(actions.length,1);
  now=37000;interval();assert.ok(messages.some(m=>m.type==='recover'));
  services.rpg.isConnected$.value=true;now=38000;interval();assert.equal(actions.length,1);
  now=43000;interval();assert.equal(actions.length,2);
  const slider={visible:true,isInteracted:false,cooldownTimer:0,indicator:{x:50},successZone:{x:30,width:40},totalClicks:0};
  let nativeFishingClicks=0;const keyCountBeforeSlider=keys.length;
  level.label='map_fishing';level.managers.fishing={handleInteraction(){nativeFishingClicks++;},fishing:{timedClickSlider:slider,isOpen$:{value:true}},canPlayMinigame:()=>true,maxMasteryLevel:()=>false};
  now=45000;interval();assert.equal(nativeFishingClicks,1);assert.equal(keys.slice(keyCountBeforeSlider).some(e=>e.type==='keydown'&&e.code==='Enter'),false,'slider must not invoke overlapping exit portal via generic interaction key');
  listeners.message({source:context.window,origin:context.location.origin,data:{channel:'diamond-valley-autoplay-v2',source:'panel',type:'config',enabled:true,mode:'mining'}});context.testExecute({type:'interact'},{slider:{visible:true},fishingOpen:true});assert.equal(nativeFishingClicks,2,'mode switch must still finish current native fishing slider');
  listeners.message({source:context.window,origin:context.location.origin,data:{channel:'diamond-valley-autoplay-v2',source:'panel',type:'config',enabled:true,mode:'fishing'}});
  services.rpg.isConnected$.value=false;now=45100;interval();
  assert.equal(nativeFishingClicks,2,'offline must not invoke the fishing controller');
  const shore={id:101,name:'shore',body:{x:100,y:100,width:44,height:236},canInteract:true,properties:{get:()=>[{name:'minigame',value:'fishing'}]}};
  level.managers.entity.entities=[shore];
  assert.equal(context.testNavigation.fishingAreas(level)[0],shore);
  const navLevel={collisionMap:[],managers:{entity:{player}}},navTarget={id:99,name:'vein',body:{x:100,y:0,width:16,height:16}};
  now=50000;context.testNavigation.navigate(navLevel,navTarget);
  now=51000;context.testNavigation.navigate(navLevel,navTarget);
  now=57000;context.testNavigation.navigate(navLevel,navTarget);
  const halted=messages.filter(m=>m.type==='halt').length;assert.equal(halted,0,'temporary navigation problems must not disable autoplay');assert.ok(messages.some(m=>m.type==='retry')); 
  listeners.message({source:context.window,origin:context.location.origin,data:{channel:'diamond-valley-autoplay-v2',source:'panel',type:'config',enabled:true}});
  now=57030;context.testNavigation.navigate(navLevel,navTarget);
  assert.equal(messages.filter(m=>m.type==='halt').length,halted,'restart must discard the previous stuck timer');
  assert.ok(keys.some(e=>e.type==='keydown'&&e.code==='ArrowRight'));
  // A recoverable navigation issue keeps the engine enabled; only a user stop ends it.
  services.rpg.isConnected$.value=true;level.label='map_hub';delete level.managers.fishing;now=58000;interval();now=63000;interval();now=68000;interval();
  const beforeStop=actions.length;assert.ok(beforeStop>2);
  listeners.message({source:context.window,origin:context.location.origin,data:{channel:'diamond-valley-autoplay-v2',source:'panel',type:'config',enabled:false}});
  now=70000;interval();assert.equal(actions.length,beforeStop,'manual stop must prevent future actions');
  // Nearest shore is surrounded by solid tiles: choose a reachable second shore.
  const blockedShore={...shore,id:201,body:{x:100,y:100,width:10,height:10}};
  const reachableShore={...shore,id:202,body:{x:200,y:0,width:10,height:10}};
  level.label='map_fishing';level.managers.entity.entities=[blockedShore,reachableShore];
  level.managers.fishing={canPlayMinigame:()=>true,maxMasteryLevel:()=>false};
  level.collisionMap=[{body:{pos:{x:75,y:75},points:[{x:0,y:0},{x:50,y:0},{x:50,y:50},{x:0,y:50}]}}];
  listeners.message({source:context.window,origin:context.location.origin,data:{channel:'diamond-valley-autoplay-v2',source:'panel',type:'config',enabled:true}});
  now=71000;interval();now=76000;interval();now=78000;interval();
  const selected=messages.filter(m=>m.type==='status').at(-1);
  assert.equal(selected.diagnostics.target.id,202,'skip a nearer unreachable shoreline');
  assert.equal(selected.enabled,true);
  // Repeated game-state exceptions retain enabled state and request bounded recovery.
  services.player.data=()=>{throw new Error('transient state failure');};
  const recoveryBefore=messages.filter(m=>m.type==='recover').length;
  now=80000;interval();now=83001;interval();now=86002;interval();
  assert.ok(messages.some(m=>m.type==='retry'&&m.diagnostics?.error==='transient state failure'));
  assert.equal(messages.filter(m=>m.type==='recover').length,recoveryBefore+1);
  listeners.message({source:context.window,origin:context.location.origin,data:{channel:'diamond-valley-autoplay-v2',source:'panel',type:'config',enabled:false}});
  services.player.data=()=>data;now=90000;interval();
  assert.equal(messages.filter(m=>m.type==='status').at(-1).enabled,false);
  // Starting random mode inside the hunting map must continue hunting, not exit as fishing.
  level.label='map_monster';delete level.managers.fishing;
  let exits=0;
  level.managers.hunting={hunting:{battleMonsters:[]},exitToHub:()=>exits++};
  level.managers.entity.entities=[{name:'portal_to_monster_play',label:'portal_to_monster_play',id:300,canInteract:true,body:{x:200,y:0,width:32,height:64}}];
  level.collisionMap=[];
  listeners.message({source:context.window,origin:context.location.origin,data:{channel:'diamond-valley-autoplay-v2',source:'panel',type:'config',enabled:true,mode:'random'}});
  now=91000;interval();now=96000;interval();
  assert.equal(exits,0);
  assert.equal(messages.filter(m=>m.type==='status').at(-1).mode,'hunting');
  assert.equal(messages.filter(m=>m.type==='status').at(-1).diagnostics.action,'navigateActivity');
  // Repeated requests in one frame stream issue only one actual transition.
  let transitions=0;
  for(let i=0;i<100;i++){now=97000+i*30;context.testNavigation.transition(level,'exitActivity',()=>transitions++);}
  assert.equal(transitions,1);
  now=107001;context.testNavigation.transition(level,'exitActivity',()=>transitions++);assert.equal(transitions,2);
  // A polygon's bounding corner is not a valid interaction position.
  const diamond=[{x:1000,y:50},{x:1050,y:0},{x:1100,y:50},{x:1050,y:100}];
  const polygonVein={name:'VEIN_5',id:501,uid:'v501',canInteract:true,body:{x:1000,y:0,width:100,height:100},collider:{shape:{points:diamond.flatMap(p=>[p.x,p.y])}}};
  const goals=context.testNavigation.navigationGoals(polygonVein,{body:{x:0,y:0,width:32,height:64}});
  assert.ok(goals.length);
  for(const goal of goals)for(const dx of [-9,9])for(const dy of [-9,9])assert.ok(polygonIntersectsRect(diamond,{x:goal.x+dx-16,y:goal.y+dy-58,width:32,height:64}),'every accepted arrival position must overlap the actual polygon');
  // A spawn portal may overwrite the last collision, but a real recorded vein contact is sufficient.
  let collected=0;polygonVein.handleInteraction=()=>collected++;
  level.managers.mining={mining:{veins:[polygonVein]}};
  player.collidedObj={name:'portal_to_mine_spawn'};
  player.collidedEntities={staying:new Map(),arriving:new Map()};
  now=108000;assert.equal(context.testNavigation.miningInteraction(level),false);assert.equal(collected,0,'never collect without game-recorded contact');
  player.collidedEntities.staying.set(polygonVein.uid,polygonVein);
  assert.equal(context.testNavigation.miningInteraction(level),true);assert.equal(collected,1);
  now=108030;context.testNavigation.miningInteraction(level);assert.equal(collected,1,'native collect callback must respect interaction cooldown');
  now=108650;context.testNavigation.miningInteraction(level);assert.equal(collected,2);
  let caught=0;const vipShore={name:'hvu_boat_1',body:{x:0,y:0,width:64,height:64},enabled:true,canInteract:true,properties:{get:()=>[{name:'minigame',value:'fishing'}]},handleInteraction(){throw new Error('base no-op method must not be used');},handleGeneralInteractionProperties(){caught++;}};
  const portal={name:'portal_hvu_boat'};level.managers.entity.entities=[vipShore,portal];player.collidedObj=portal;player.collidedEntities.staying=new Map([[1,vipShore],[2,portal]]);now=109300;
  assert.equal(context.testSnapshot().atFishing,true,'overlapping exit portal must not hide fishing contact');
  assert.equal(context.testNavigation.fishingInteraction(level),true);assert.equal(caught,1,'invoke native fishing target instead of exit portal');
  listeners.message({source:context.window,origin:context.location.origin,data:{channel:'diamond-valley-autoplay-v2',source:'panel',type:'config',enabled:true,mode:'fishing'}});
  level.managers.fishing={canPlayMinigame:()=>true,fishing:{isOpen$:{value:true}}};assert.equal(context.testSnapshot().canPlay,false,'server-ready must not interrupt the native rod animation');level.managers.fishing.fishing.isOpen$.value=false;assert.equal(context.testSnapshot().canPlay,true);

  player.collidedEntities.staying.clear();now=109300;assert.equal(context.testNavigation.miningInteraction(level),false);
  delete level.managers.fishing;level.label='map_boss';player.inBattle=true;
  let nativeIncoming=0;player.hp=55;player.getCurrentHealth=()=>player.hp;
  level.managers.boss={pendingUpdates:{value:1},playerHitByProjectile(){nativeIncoming++;},boss:{currentActivity:'hunting',updatePlayerHealth(value){player.hp=value;}},hasComplete:false};
  listeners.message({source:context.window,origin:context.location.origin,data:{channel:'diamond-valley-autoplay-v2',source:'panel',type:'config',enabled:true,mode:'boss'}});
  const originalDodge=context.DVNavigation.dodge;context.DVNavigation.dodge=()=> 'ArrowDown';const beforePendingDodge=keys.length;now=111000;interval();
  assert.ok(keys.slice(beforePendingDodge).some(e=>e.type==='keydown'&&e.code==='ArrowDown'),'server update pending must not freeze emergency Boss dodge');
  level.managers.boss.boss.currentActivity='fishing';const beforeFishingDodge=keys.length;now=112000;interval();
  assert.equal(keys.slice(beforeFishingDodge).some(e=>e.type==='keydown'&&e.code==='ArrowDown'),false,'fishing phase must still suppress dodge movement');context.DVNavigation.dodge=originalDodge;
  level.managers.boss.playerHitByProjectile();level.managers.boss.boss.updatePlayerHealth(50);assert.equal(nativeIncoming,1,'diagnostic hook preserves native collision handler');assert.equal(player.hp,50);assert.ok(messages.some(m=>m.type==='bossTrace'&&m.trace.event==='boss:playerHitByProjectile'));assert.ok(messages.some(m=>m.type==='bossTrace'&&m.trace.event==='boss:healthDrop'&&m.trace.amount===5));
  let nativeDashCalls=0;player.dash=vector=>{nativeDashCalls++;assert.equal(vector.y,1);};services.gameState.canDash$={value:true};services.gameState.dashEnabled$={value:true};level.managers.boss.boss.currentActivity='hunting';listeners.message({source:context.window,origin:context.location.origin,data:{channel:'diamond-valley-autoplay-v2',source:'panel',type:'config',enabled:true,mode:'boss',settings:{bossGuide:true}}});context.testExecute({type:'dodge',code:'ArrowDown'},{});assert.equal(nativeDashCalls,0,'short emergency escape must not invoke an unbounded native dash');services.gameState.canDash$.value=false;context.testExecute({type:'dodge',code:'ArrowDown'},{});assert.equal(nativeDashCalls,0,'native dash remains unused for short escape');level.managers.boss.boss.currentActivity='fishing';services.gameState.canDash$.value=true;context.testExecute({type:'dodge',code:'ArrowDown'},{});assert.equal(nativeDashCalls,0,'fishing phase must not dash');level.managers.boss.boss.currentActivity='hunting';context.testExecute({type:'dodge',code:'ArrowDown',dash:true},{bossPhase:'hunting'});assert.equal(nativeDashCalls,1,'explicit imminent warning may use ready native dash');
  services.ui.hideQuestSubmissionDialog=()=>{};data.activities_data.mining={has_played:true};data.activities_data.hunting={has_played:true};listeners.message({source:context.window,origin:context.location.origin,data:{channel:'diamond-valley-autoplay-v2',source:'panel',type:'config',enabled:true,mode:'random',settings:{autoBoss:false}}});context.testExecute({type:'dailyLimit'},{});assert.equal(messages.filter(m=>m.type==='modeFallback').at(-1).mode,'random','daily-cap fallback must preserve requested random rotation');listeners.message({source:context.window,origin:context.location.origin,data:{channel:'diamond-valley-autoplay-v2',source:'panel',type:'config',enabled:true,mode:'fishing',settings:{autoBoss:false}}});context.testExecute({type:'dailyLimit'},{});assert.equal(messages.filter(m=>m.type==='modeFallback').at(-1).mode,'mining','manual mode daily-cap fallback still selects another activity');
  level.label='map_hub';listeners.message({source:context.window,origin:context.location.origin,data:{channel:'diamond-valley-autoplay-v2',source:'panel',type:'config',enabled:true,mode:'stockpile',settings:{autoBoss:true}}});now=130000;interval();const stockStatus=messages.filter(m=>m.type==='status').at(-1);assert.ok(['fishing','mining','hunting'].includes(stockStatus.mode),'stockpile only selects mining or hunting');assert.equal(stockStatus.diagnostics.questReady,false,'stockpile must suppress deliveries');assert.equal(stockStatus.diagnostics.canSubmit,false,'stockpile must not submit');





}
async function panelTests(){
  let interval,now=10000,clicks=0;const listeners={},nodes={};
  const node=id=>nodes[id]??=( {textContent:'',disabled:false} );
  const root={innerHTML:'',getElementById:node};
  const start={textContent:'立即\u200B展開\u200B冒險',disabled:false,getBoundingClientRect:()=>({width:100}),click:()=>clicks++};
  const context={Date:{now:()=>now},location:{origin:'https://diamondvalley.withgoogle.com'},navigator:{onLine:true},setInterval:cb=>interval=cb,
    document:{hidden:false,documentElement:{appendChild(){}},createElement:()=>({attachShadow:()=>root}),querySelector:selector=>selector==='canvas'?null:start},
    chrome:{storage:{local:{get:async()=>({dvAutoplay:{enabled:true}}),set:async()=>{}}},runtime:{sendMessage:async()=>{}}}};
  context.window={postMessage(){},addEventListener:(type,cb)=>listeners[type]=cb};
  vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/settings.js','utf8'),context);
  vm.runInContext(fs.readFileSync(__dirname+'/panel.js','utf8'),context);await new Promise(resolve=>setImmediate(resolve));
  interval();assert.equal(clicks,0,'landing must wait for the game-module handshake');
  listeners.message({source:context.window,origin:context.location.origin,data:{channel:'diamond-valley-autoplay-v2',source:'bot',type:'hook',ready:true}});
  interval();assert.equal(clicks,1);
  listeners.message({source:context.window,origin:context.location.origin,data:{channel:'diamond-valley-autoplay-v2',source:'bot',type:'retry',message:'重新搜尋'}});
  assert.equal(nodes.start.disabled,true,'retry keeps enabled state');
  now+=2000;interval();assert.equal(clicks,1,'must throttle repeated start clicks');
  const message=data=>listeners.message({source:context.window,origin:context.location.origin,data:{channel:'diamond-valley-autoplay-v2',source:'bot',...data}});
  message({type:'halt',message:'背包已滿'});message({type:'status',status:'已停止'});
  assert.equal(nodes.status.textContent,'背包已滿','keep the actual stopping reason');
  now+=6000;interval();assert.equal(clicks,1,'stopped bot must not restart the game');
  nodes.challengeBoss.onclick();assert.equal(nodes.bossGuide.checked,true);assert.equal(nodes.start.disabled,true);
  context.chrome.storage.local.set=()=>{throw new Error('Extension context invalidated.');};
  assert.doesNotThrow(()=>nodes.start.onclick(),'extension reload must not throw from the old panel');
  assert.equal(nodes.status.textContent,'擴充套件已更新，請重新整理遊戲頁');
}
async function recoveryTests(){
  let listener,reloads=0;const store={dvAutoplay:{enabled:true},dvRecovery:[]};
  const context={Date,chrome:{runtime:{onMessage:{addListener:cb=>listener=cb}},storage:{local:{get:async()=>store,set:async value=>Object.assign(store,value)}},tabs:{reload:async()=>reloads++}}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/background.js','utf8'),context);
  const sender={frameId:0,tab:{id:1},url:'https://diamondvalley.withgoogle.com/intl/ALL_tw/game/'};
  const send=sender=>new Promise(resolve=>{const accepted=listener({type:'dv-autoplay-recover'},sender,resolve);if(!accepted)resolve(null);});
  assert.equal(await send({...sender,url:'https://example.com/'}),null);
  assert.equal(await send({...sender,frameId:1}),null);
  assert.equal((await send(sender)).reloaded,true);assert.equal(reloads,1);
  assert.equal((await send(sender)).reloaded,false);assert.equal(reloads,1);
  store.dvRecovery=[1,2,3,4,5].map(n=>Date.now()-n*120000);
  assert.equal((await send(sender)).reloaded,false);
  store.dvAutoplay.enabled=false;store.dvRecovery=[];
  assert.equal((await send(sender)).reloaded,false);
}
(async()=>{await mainIntegration();await panelTests();await recoveryTests();console.log('PASS: live-state decisions, slider timing, A* routing, game hook, inventory/diamond display, key release, reconnect resume, automatic game start, reload limits');})().catch(error=>{console.error(error);process.exitCode=1;});
