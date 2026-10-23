(() => {
  'use strict';
  const GAME_MODULES=['game-RDZLHNOS.js','game-KRZLVEFN.js','game-74YGLLZX.js','game-6NMIDNT2.js'];const hookedPrototypes=new WeakSet(),attemptedModules=new Set(),connectedModules=new Set();
  const engine=new globalThis.DVAutoplay.Autoplayer();
  let settings=globalThis.DVSettings.normalize({});const bossController=new globalThis.DVSettings.BossController();const dailyRotation=new globalThis.DVSettings.DailyRotation();let bossRestored=false;let dailyWaiting=false,lastDailyRefresh=0,vipBoardingLevel=null;
  const dailyTasks=new globalThis.DVMissions.Daily();let dailyDialogueUntil=0;
  const missionPlanner=new globalThis.DVMissions.Planner();const huntingTracker=new globalThis.DVHunting.Tracker();const activities=new globalThis.DVActivities.ActivityPlanner();let mode='fishing',requestedMode='fishing',rotate=false,modeStarted=0,lastItemCount=null,deliveryBatchMode=null;
  let moduleReady=false;let game=null,enabled=false,hookError='',lastStatus=0,lastNavigation=0,path=null,pathTarget='',pathMap=null,routeAxis=null,routeWaypoint=null,routeSearch=null,routeFine=false;
  let disconnectedAt=null,recoveryRequested=false,lastPulse=0,pendingTransition=null;
  const auditEvents=[],auditedManagers=new WeakSet(),auditedPlayers=new WeakSet();
  const audit=(event,detail)=>{auditEvents.push({event,detail,at:Date.now()});if(auditEvents.length>24)auditEvents.shift();};
  function auditMining(level){if(mode==='boss')auditBoss(level);const manager=level?.managers?.[mode];if(!manager||auditedManagers.has(manager))return;auditedManagers.add(manager);const activityMode=mode;for(const name of ['start','playerActivateVein','playerReachedSafezone','complete','die','success','fail']){const original=manager[name];if(typeof original!=='function')continue;manager[name]=function(...args){if(activityMode==='boss'&&!this.hasComplete&&['success','fail'].includes(name)){bossController.result(name==='success',signal(getWorld()?.services?.player?.data)?.overall_level?.level??0,settings);post('bossProgress',{progress:bossController.progress()});}audit(activityMode+':'+name,['string','boolean'].includes(typeof args[0])?args[0]:null);return original.apply(this,args);};}}
  const auditedBossControllers=new WeakSet();
  function bossTrace(level,event,extra={}){
    const p=level?.managers?.entity?.player,m=level?.managers?.boss;if(!p?.body)return;
    const b=p.body,rect=r=>r?{x:r.x,y:r.y,width:r.width,height:r.height}:null;
    const overlaps=globalThis.DVNavigation.combatDangers(level.managers.entity.entities).filter(d=>!d.warning&&b.x<d.body.x+d.body.width&&b.x+b.width>d.body.x&&b.y<d.body.y+d.body.height&&b.y+b.height>d.body.y).map(d=>({name:d.name,body:rect(d.body)})).slice(0,12);
    const trace={at:Date.now(),event,phase:m?.boss?.currentActivity,pending:signal(m?.pendingUpdates),health:p.getCurrentHealth?.(),position:rect(b),held:[...held],overlaps,...extra};
    audit(event,trace);post('bossTrace',{trace});
  }
  function auditBoss(level){
    const m=level?.managers?.boss;if(!m||auditedBossControllers.has(m))return;auditedBossControllers.add(m);
    for(const name of ['playerHitByDanger','playerHitByAoe','playerHitByProjectile','bossIsHit']){const original=m[name];if(typeof original!=='function')continue;m[name]=function(...args){bossTrace(level,'boss:'+name);return original.apply(this,args);};}
    const c=m.boss,original=c?.updatePlayerHealth;if(typeof original==='function')c.updatePlayerHealth=function(...args){const before=level.managers.entity.player?.getCurrentHealth?.(),result=original.apply(this,args),after=level.managers.entity.player?.getCurrentHealth?.();if(Number.isFinite(before)&&Number.isFinite(after)&&after<before)bossTrace(level,'boss:healthDrop',{before,after,amount:before-after});return result;};
  }
  function auditDamage(player){
    if(!player||auditedPlayers.has(player)||typeof player.onShot!=='function')return;
    auditedPlayers.add(player);const original=player.onShot;
    player.onShot=function(...args){const before=this.getCurrentHealth?.();const result=original.apply(this,args);const after=this.getCurrentHealth?.();if(Number.isFinite(before)&&Number.isFinite(after)&&after<before)audit('damage',{source:args[0]?.name??args[0]?.label,amount:before-after,health:after});return result;};
  }
  const held=new Set();let navigationTimer=null,pulseTimer=null,lastPosition=null,stuckSince=null,observedStep=6;const polygonCache=new WeakMap();const bossStands=new WeakMap();let routeWide=false,routePrecise=false;
  let retryAt=0,retryMessage='',errorCount=0,lastRecovery=0,missingSince=null,unreadySince=null,fishingWaitSince=null;const blockedTargets=new Map();
  const targetKey=e=>e?.uid??e?.id??e?.name;
  const available=e=>e?.body&&!e.destroyed&&e.enabled!==false&&(blockedTargets.get(targetKey(e))??0)<=Date.now();
  function retry(message,target=null){if(target)blockedTargets.set(targetKey(target),Date.now()+30000);clearNavigation();retryAt=Date.now()+1500;retryMessage=message;post('retry',{message,diagnostics:{mode,message,navigation:target&&(target.bossTarget||String(target.label??target.name??'').startsWith('npc_'))?{start:feet(getWorld()?.managers?.level?.currentLevel?.managers?.entity?.player),polygons:polygonList(getWorld()?.managers?.level?.currentLevel)}:null,target:target?{name:target.name,id:target.id,polygon:interactionPolygon(target),goals:navigationGoals(target,getWorld()?.managers?.level?.currentLevel?.managers?.entity?.player)}:null}});}
  function fishingAreas(level){const player=level?.managers?.entity?.player,p=player?.body?feet(player):null;if(!p)return [];return (level.managers.entity.entities??[]).filter(e=>available(e)&&isFishingArea(e)&&e.canInteract&&!e.isLocked?.()).sort((a,b)=>Math.hypot(center(a).x-p.x,center(a).y-p.y)-Math.hypot(center(b).x-p.x,center(b).y-p.y));}
  const channel='diamond-valley-autoplay-v2';
  const post=(type,data={})=>window.postMessage({channel,source:'bot',type,...data},location.origin);
  const getWorld=()=>game?.world;
  const subject=s=>s?.value??s?.getValue?.();
  const signal=s=>typeof s==='function'?s():s;
  const center=e=>e?.body?{x:e.body.x+e.body.width/2,y:e.body.y+e.body.height/2}:null;
  // game-6NMIDNT2.js resolves walls using body.y + collider_floor_offset (52),
  // leaving a 12px foot collider for the normal 64px player body.
  function feet(player){const b=player.body,offset=b.height>=52?52:0;return {x:b.x+b.width/2,y:b.y+offset+(b.height-offset)/2,halfX:b.width/2,halfY:(b.height-offset)/2,offset};}
  const props=e=>e?.properties?.get?.()??[];
  const isFishingArea=e=>props(e).some(p=>p.name==='minigame'&&p.value==='fishing');
  const controls={ArrowUp:38,ArrowDown:40,ArrowLeft:37,ArrowRight:39,Enter:13};
  function key(type,code){
    const e=new KeyboardEvent(type,{key:code,code,bubbles:true,cancelable:true});
    Object.defineProperties(e,{keyCode:{get:()=>controls[code]},which:{get:()=>controls[code]}});
    window.dispatchEvent(e);
  }
  function release(){
    if(navigationTimer){clearTimeout(navigationTimer);navigationTimer=null;}
    if(pulseTimer){clearTimeout(pulseTimer);pulseTimer=null;}
    for(const code of held)key('keyup',code);held.clear();
  }
  function move(code){for(const c of [...held])if(c!==code){key('keyup',c);held.delete(c);}if(code&&!held.has(code)){key('keydown',code);held.add(code);}}
  function interact(){release();if(Date.now()-lastPulse<420)return;lastPulse=Date.now();key('keydown','Enter');held.add('Enter');pulseTimer=setTimeout(()=>{key('keyup','Enter');held.delete('Enter');pulseTimer=null;},60);}
  function clickButton(button){
    if(!button?.view||button.button?.enabled===false)return false;
    const view=button.view;if(typeof view.emit!=='function')return false;
    const event={button:0,stopPropagation(){},preventDefault(){}};
    view.emit('pointertap',event);view.emit('pointerup',event);return true;
  }
  function clearNavigation(){path=null;pathTarget='';pathMap=null;routeAxis=null;routeWaypoint=null;routeSearch=null;routeFine=false;lastPosition=null;stuckSince=null;release();}
  function transition(level,action,callback){
    if(pendingTransition&&pendingTransition.level===level&&pendingTransition.label===level?.label&&Date.now()-pendingTransition.started<10000)return false;
    clearNavigation();pendingTransition={level,label:level?.label,action,started:Date.now()};
    try{const result=callback();if(result?.catch)result.catch(error=>{pendingTransition=null;retry('轉場失敗，稍後重試：'+error.message);});return true;}catch(error){pendingTransition=null;throw error;}
  }
  const deliveryTarget=level=>globalThis.DVNavigation.delivery(level?.managers?.entity?.entities,mode); 
  function findResult(world){
    const walk=(node,depth=0)=>{
      if(!node||depth>5||node.visible===false)return null;
      if(node.isOpen$?.value&&node.leftButton&&node.rightButton&&('resultType' in node||'result' in node))return node;
      for(const child of node.children??[]){const result=walk(child,depth+1);if(result)return result;}return null;
    };
    return walk(world?.app?.stage??world?.stage);
  }
  function combat(level){
    const player=level.managers.entity.player,target=(mode==='hunting'?huntingTracker.target:null)??globalThis.DVActivities.target(level,mode);
    if(!target||player.isCutscene||player.lockedCamera){clearNavigation();return;}
    if(mode==='boss'&&settings.bossGuide){if(bossStands.has(target)&&!globalThis.DVNavigation.validBossStance(bossStands.get(target),player,target))bossStands.delete(target);const anchor=bossStands.get(target)??globalThis.DVNavigation.bossAnchor(player,target,level.managers.entity.entities);if(anchor&&globalThis.DVNavigation.bossAnchorBlocked(anchor,player,globalThis.DVNavigation.bossGuideDangers(level.managers.entity.entities,player))){clearNavigation();release();return;}if(anchor&&(Math.abs(player.body.x-anchor.x)>16||Math.abs(player.body.y-anchor.y)>16)){const f=feet(player);navigate(level,{name:'boss_attack_'+target.id,id:'boss_attack_'+target.id,bossTarget:target,body:{x:anchor.x,y:anchor.y,width:player.body.width,height:player.body.height},standGoal:{x:anchor.x+f.halfX,y:anchor.y+f.offset+f.halfY}});return;}}
    if(navigationTimer){clearTimeout(navigationTimer);navigationTimer=null;}
    const code=mode==='boss'&&settings.bossGuide?globalThis.DVNavigation.bossDirection(player,target,level.managers.entity.entities,polygonList(level),bossStands.get(target)):globalThis.DVNavigation.combatDirection(player,target,Math.max(12,Math.min(20,observedStep/2)));
    path=null;routeSearch=null;
    if(code){move(code);navigationTimer=setTimeout(()=>{key('keyup',code);held.delete(code);navigationTimer=null;},10);}else release();
  }
  function findPlayButton(world){
    const normalize=text=>String(text??'').replace(/[\u200B-\u200D\uFEFF\s]/g,'');
    const text=node=>normalize(node.text)||((node.children??[]).map(text).join(''));
    const walk=(node,depth=0)=>{if(!node||depth>10||node.visible===false)return null;
      if(node.view&&node.button?.enabled!==false&&text(node.view)==='立即遊玩')return node;
      for(const child of node.children??[]){const b=walk(child,depth+1);if(b)return b;}return null;};
    return walk(world?.uiManager?.cutsceneUi?.inside);
  }
  function polygonList(level){
    const cached=polygonCache.get(level);if(cached?.source===level.collisionMap&&cached?.size===(level.collisionMap??[]).length)return cached.polygons;
    const polygons= (level.collisionMap??[]).map(item=>{
      const body=item.body;
      const patterns={full:[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]],'full-diagonal':[[-.5,-.5],[.5,.5],[-.5,.5]],half:[[-.5,0],[.5,0],[.5,.5],[-.5,.5]],'bottom-half-diagonal':[[-.5,0],[.5,.5],[-.5,.5]],'bottom-half-diagonal-reversed':[[.5,0],[-.5,.5],[.5,.5]],'diagonal-bottom-half':[[-.5,-.5],[.5,0],[.5,.5],[-.5,.5]],'diagonal-bottom-half-reversed':[[-.5,0],[.5,-.5],[.5,.5],[-.5,.5]]};
      if(typeof body?.toPolygon==='function'&&patterns[item.type]){
        const directions=['north','north-east','east','south-east','south','south-west','west','north-west'];
        const angle=Math.max(0,directions.indexOf(item.rotation))*Math.PI/4,c=Math.cos(angle),s=Math.sin(angle);
        return patterns[item.type].map(([x,y])=>{x*=body.w;y*=body.h;return {x:body.pos.x+body.w/2+x*c-y*s,y:body.pos.y+body.h/2+x*s+y*c};});
      }
      const shape=typeof body?.toPolygon==='function'?body.toPolygon():body;
      return (shape?.calcPoints??shape?.points??[]).map(p=>({x:p.x+(shape.pos?.x??0),y:p.y+(shape.pos?.y??0)}));
    }).filter(points=>points.length>=3);
    polygonCache.set(level,{source:level.collisionMap,size:(level.collisionMap??[]).length,polygons});return polygons;
  }
  function interactionPolygon(entity){
    const shape=entity?.collider?.shape,points=shape?.points;
    if(!points?.length||typeof points[0]!=='number')return null;
    const polygon=[];for(let i=0;i+1<points.length;i+=2)polygon.push({x:points[i],y:points[i+1]});return polygon.length>=3?polygon:null;
  }
  function hasContact(player,target){
    if(!target)return false;if(player?.collidedObj===target)return true;
    return ['arriving','staying'].some(k=>[...(player?.collidedEntities?.[k]?.values?.()??[])].includes(target));
  }
  function fishingInteraction(level){
    const player=level?.managers?.entity?.player,target=fishingAreas(level).find(e=>hasContact(player,e));
    if(!target||typeof target.handleGeneralInteractionProperties!=='function'||player.lockedCamera||player.isInteracting||player.isCutscene)return false;
    release();if(Date.now()-lastPulse<650)return true;lastPulse=Date.now();target.handleGeneralInteractionProperties();return true;
  }
  function miningInteraction(level){
    const player=level?.managers?.entity?.player,target=globalThis.DVActivities.target(level,'mining',available,pathMap===level?pathTarget:null);
    if(!target||!hasContact(player,target)||!target.canInteract||!(/^(VEIN_|GENERAL_SAFE_ZONE|SPECIAL_ZONE)/.test(target.name??target.label??''))||typeof target.handleInteraction!=='function'||player.lockedCamera||player.isInteracting||player.isCutscene)return false;
    release();if(Date.now()-lastPulse<650)return true;lastPulse=Date.now();target.handleInteraction();return true;
  }
  function navigationGoals(entity,player){
    if(entity.standGoal)return [entity.standGoal,...[-6,6].flatMap(dx=>[-6,0,6].map(dy=>({x:entity.standGoal.x+dx,y:entity.standGoal.y+dy})))];
    const c=center(entity),r=entity.body,p=feet(player);if(!c||!p)return null;
    const pad=2;
    // Approach from outside a solid object's front edge. The full player body
    // can overlap its interaction region while the feet remain on walkable ground.
    // Allow for the 12px path grid rounding and the 4px navigation clearance.
    // Several front-edge points also avoid decorations beside a mine cart.
    const frontY=r.y+r.height+p.halfY+12;
    const candidates=[{x:c.x,y:frontY},{x:r.x+r.width*.25,y:frontY},{x:r.x+r.width*.75,y:frontY},c];
    // Interaction uses the whole body; sample both shoreline sides and all edges.
    const top=r.y-p.halfY+2,bottom=r.y+r.height+p.offset+p.halfY-2;
    for(let y=top;y<=bottom;y+=12){
      candidates.push({x:r.x-p.halfX+2,y},{x:r.x+r.width+p.halfX-2,y},{x:r.x+2,y},{x:r.x+r.width-2,y},{x:c.x,y});
    }
    for(let x=r.x-p.halfX+2;x<=r.x+r.width+p.halfX-2;x+=12){
      candidates.push({x,y:frontY},{x,y:r.y-p.halfY-6});
    }
    candidates.push({x:r.x+pad,y:c.y},{x:r.x+r.width-pad,y:c.y},{x:c.x,y:r.y+pad},{x:c.x,y:r.y+r.height-pad});
    candidates.sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));
    // A reached waypoint must still overlap the target even at the 9px walking tolerance.
    const inset=12,minX=r.x-p.halfX+inset,maxX=r.x+r.width+p.halfX-inset;
    const minY=r.y-p.halfY+inset,maxY=r.y+r.height+p.offset+p.halfY-inset;
    const unique=new Map();
    for(const point of candidates){const goal={x:Math.max(minX,Math.min(maxX,point.x)),y:Math.max(minY,Math.min(maxY,point.y))};unique.set(`${goal.x},${goal.y}`,goal);}
    const polygon=interactionPolygon(entity);
    const goals=[...unique.values()],filtered=goals.filter(goal=>!polygon||[-9,9].every(dx=>[-9,9].every(dy=>globalThis.DVAutoplay.polygonIntersectsRect(polygon,{x:goal.x+dx-p.halfX,y:goal.y+dy-p.offset-p.halfY,width:p.halfX*2,height:p.offset+p.halfY*2}))));
    // NPC interaction shapes may be smaller than the waypoint tolerance.
    // Keep body-based approach points; collision routing and native contact still gate interaction.
    return filtered.length||!String(entity.label??entity.name??'').startsWith('npc_')?filtered:goals;
  }
  function navigationGoal(entity,player,polygons){
    const p=feet(player);
    for(const goal of navigationGoals(entity,player)??[]){
      const candidate=globalThis.DVAutoplay.findPath(p,goal,polygons,{x:p.halfX+4,y:p.halfY+4});
      if(candidate)return globalThis.DVNavigation.simplify(candidate);
    }
    return null;
  }
  function navigate(level,target){
    const now=Date.now();if(now-lastNavigation<30)return;lastNavigation=now;
    const player=level.managers.entity.player,p=player?.body?feet(player):null;
    if(!target||!p){retry('暫時沒有可操作目標，等待重新搜尋');return;}
    if(hasContact(player,target)){clearNavigation();return;}
    if(player.lockedCamera||player.isInteracting||player.isCutscene){clearNavigation();return;}
    const delta=lastPosition?Math.hypot(p.x-lastPosition.x,p.y-lastPosition.y):0;
    if(delta>=.5&&delta<40)observedStep=Math.max(observedStep,delta);
    if(lastPosition&&delta<.5){stuckSince??=now;}else{stuckSince=null;lastPosition=p;}
    if(stuckSince&&now-stuckSince>5000&&!routeSearch){
      retry('移動受阻，重新尋路或更換目標',target);return;
    }
    const targetId=target.uid??target.id??target.name;
    if(!path||pathTarget!==targetId||pathMap!==level){
      if(!routeSearch||pathTarget!==targetId||pathMap!==level){
        release();routeFine=false;routeWide=false;routePrecise=false;routeSearch=globalThis.DVAutoplay.createPathSearch(p,navigationGoals(target,player)??[],polygonList(level),{x:p.halfX+4,y:p.halfY+4});pathTarget=targetId;pathMap=level;routeAxis=null;routeWaypoint=null;
      }
      const result=routeSearch.step(200,4);
      if(!result.done){release();return;}
      if(!result.path&&!routeFine&&(target.standGoal||String(target.label??target.name??'').startsWith('npc_'))){routeFine=true;routeSearch=globalThis.DVAutoplay.createPathSearch(p,navigationGoals(target,player)??[],polygonList(level),{x:p.halfX,y:p.halfY},6,48000);release();return;}
      if(!result.path&&target.bossTarget&&!routeWide){routeWide=true;const original=globalThis.DVNavigation.bossAnchor(player,target.bossTarget,level.managers.entity.entities),g={x:original.x+p.halfX,y:original.y+p.offset+p.halfY},goals=[-12,0,12].flatMap(dx=>[-36,-24,-12,0,12,24,36].map(dy=>({x:g.x+dx,y:g.y+dy})));routeSearch=globalThis.DVAutoplay.createPathSearch(p,goals,polygonList(level),{x:p.halfX,y:p.halfY},6,48000);release();return;}
      if(!result.path&&target.bossTarget&&routeWide&&!routePrecise){routePrecise=true;const anchor=globalThis.DVNavigation.bossAnchor(player,target.bossTarget,level.managers.entity.entities),goals=[-12,-6,0,6,12].flatMap(dx=>[-36,-24,-12,0,12,24,36].map(dy=>({x:anchor.x+p.halfX+dx,y:anchor.y+p.offset+p.halfY+dy})));routeSearch=globalThis.DVAutoplay.createPathSearch(p,goals,polygonList(level),{x:p.halfX,y:p.halfY},3,120000);release();return;}
      if(routeWide&&result.path?.length&&target.bossTarget){const goal=result.path.at(-1),anchor={x:goal.x-p.halfX,y:goal.y-p.offset-p.halfY};if(globalThis.DVNavigation.validBossStance(anchor,player,target.bossTarget))bossStands.set(target.bossTarget,anchor);}
      routeSearch=null;lastPosition=p;stuckSince=null;path=result.path?globalThis.DVNavigation.simplify(result.path):null;
      if(!path){if(target.bossTarget)bossStands.delete(target.bossTarget);retry(`暫時無法到達 ${target.name??'目標'}，嘗試其他目標`,target);return;}

    }
    const tolerance=Math.min(9,Math.max(3,observedStep/2+1));
    const previousWaypoint=path[0];
    const direction=globalThis.DVNavigation.routeDirection(p,path,routeAxis,polygonList(level),tolerance);
    if(!path.length){release();if(player.collidedObj===target)interact();else{path=null;}return;}
    const dx=path[0].x-p.x,dy=path[0].y-p.y;
    if(routeWaypoint!==path[0]){routeWaypoint=path[0];routeAxis=null;}
    if(previousWaypoint!==path[0]){routeAxis=null;}routeAxis=direction.axis;move(direction.code);if(direction.corner&&!direction.code){path=null;release();return;}
    // Near a corner, release between control ticks so several game frames cannot overshoot it.
    const remaining=direction.axis==='x'?Math.abs(dx):Math.abs(dy);
    if(direction.code&&remaining<Math.max(24,observedStep*1.5)&&!navigationTimer){const code=direction.code;navigationTimer=setTimeout(()=>{key('keyup',code);held.delete(code);navigationTimer=null;},10);}
  }
  function readSlider(slider,active){
    if(!slider||!active||!slider.visible||slider.destroyed||slider.indicator?.destroyed||slider.successZone?.destroyed)return null;
    try{const indicator=slider.indicator?.x,left=slider.successZone?.x,width=slider.successZone?.width;if(![indicator,left,width].every(Number.isFinite)||width<=0)return null;return {visible:true,done:slider.isInteracted,cooldown:slider.cooldownTimer,indicator,left,width,clicks:slider.totalClicks};}catch(error){return null;}
  }
  function snapshot(){
    const world=getWorld(),level=world?.managers?.level?.currentLevel,services=world?.services,player=level?.managers?.entity?.player;
    const data=signal(services?.player?.data),inventory=inventoryState;
    const vip=globalThis.DVActivities.vipFishing(level,services,data,available);
    const fishingData=inventory?.[mode];
    const fishingManager=level?.managers?.[mode],slider=mode==='boss'?fishingManager?.boss?.timedClickSlider:level?.managers?.fishing?.fishing?.timedClickSlider;
    const quest=questState?.[mode]?.quest??data?.activities_data?.[mode]?.next_quest;
    const count=quest?(fishingData?.items??[]).find(item=>item.name===quest.item)?.quantity??0:0;
    const dialog=world?.uiManager?.questSubmissionDialog??world?.managers?.uiManager?.questSubmissionDialog;
    const itemCount=(fishingData?.items??[]).reduce((sum,item)=>sum+item.quantity,0);
    const connected=subject(services?.rpg?.isConnected$);
    return {
      enabled,online:navigator.onLine,connected,visible:!document.hidden,
      ready:!!(game?.started&&level&&player&&services&&data&&inventory),hookError,
      inputFocused:!!(document.activeElement?.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName??'')),
      loading:!!((pendingTransition&&pendingTransition.level===level&&pendingTransition.label===level?.label&&Date.now()-pendingTransition.started<10000)||level?.preventUpdates||subject(services?.gameState?.inGameLoading$)||player?.isChangingLevel),
      mode,map:level?.label,level:data?.overall_level?.level,experience:data?.overall_level?.experience,
      activityUnlocked:!!data?.activities_data?.[mode]?.has_played,inActivity:!!level?.managers?.[mode],
      inBattle:!!player?.inBattle,treasuryActive:!!services?.treasury?.isActiveValue,
      targetCollided:hasContact(player,globalThis.DVActivities.target(level,mode,available,pathMap===level?pathTarget:null)),
      resultOpen:!!findResult(world),
      fishingOpen:!!level?.managers?.fishing&&(!!level.managers.fishing.fishing?.isOpen$?.value||!!services?.fishing?.isAttemptInProgress),
      storyOpen:!!world?.uiManager?.cutsceneUi?.state,
      storyCanContinue:!!world?.uiManager?.cutsceneUi?.state&&!services?.cutscene?.cutsceneRequiresInteraction,
      treasuryStartButton:mode==='treasury'&&!!findPlayButton(world),
      bossStartButton:mode==='boss'&&!!findPlayButton(world),
      bossComplete:mode==='boss'&&!!fishingManager?.hasComplete,
      bossPhase:mode==='boss'?fishingManager?.boss?.currentActivity:null,
      bossPending:mode==='boss'&&Number(signal(fishingManager?.pendingUpdates)??0)>0,
      diamonds:diamondBalance??subject(services?.auth?.userData$)?.data?.total_diamonds,itemCount,bagFull:!!fishingData?.is_full,
      questSubmissions:data?.quest_submissions_today,questReady:globalThis.DVActivities.stockPolicy(mode,fishingData?.items,quest,settings.deliveryMultiplier).ready,
      fishingUnlocked:!!data?.activities_data?.fishing?.has_played,
      vipWanted:mode==='fishing'&&vip.eligible&&!vip.inside, vipDialogue:vipBoardingLevel===level&&!!world?.uiManager?.cutsceneUi?.state, vip:{eligible:vip.eligible,hasPass:vip.hasPass,inside:vip.inside,boat:vip.boat?.name??vip.boat?.label??null}, vipBoatAvailable:!!vip.boat, atVipBoat:!!vip.boat&&hasContact(player,vip.boat),
      masteryMax:!!(data&&fishingManager?.maxMasteryLevel?.(data)),
      inHub:level?.label==='map_hub',inFishing:!!fishingManager,
      atFishing:fishingAreas(level).some(e=>hasContact(player,e)),
      atDelivery:!!player?.collidedObj&&player.collidedObj===deliveryTarget(level)?.entity,
      canPlay:!!fishingManager?.canPlayMinigame?.()&&(mode!=='fishing'||!subject(fishingManager?.fishing?.isOpen$)),
      submissionOpen:!!subject(dialog?.isOpen$)||!!subject(services?.ui?.isQuestSubmissionDialogVisible$),
      canSubmit:!!dialog&&!subject(dialog.submitDisabled$)&&!!dialog.submitButton?.view&&dialog.submitButton.button?.enabled!==false,
      submitting:!!dialog?.submissionInProgress,
      dailyLimit:!!(dialog?.dailySubmitLimitText?.parent&&dialog.dailySubmitLimitText.parent===dialog.container),
      otherDialog:!!(player?.isCutscene||subject(services?.ui?.isRewardsVisible$)||subject(services?.ui?.isBagVisible$)||subject(services?.ui?.isSettingsVisible$)||subject(services?.ui?.isMapVisible$)),
      slider:readSlider(slider,mode==='boss'||!!level?.managers?.fishing?.fishing?.isOpen$?.value)
    };
  }
  let questState=null,inventoryState=null,diamondBalance=null,subQuestState=null,subscriptions=[];
  function connectGame(instance){
    subscriptions.forEach(s=>s.unsubscribe());subscriptions=[];
    game=instance;questState=null;inventoryState=null;diamondBalance=null;subQuestState=null;engine.reset();clearNavigation();hookError='';
    const observe=(source,callback)=>{if(source?.subscribe)subscriptions.push(source.subscribe(callback));};
    observe(instance.services?.inventory?.items$,value=>{inventoryState=value;audit('inventory',Object.fromEntries(['fishing','mining','hunting'].map(k=>[k,(value?.[k]?.items??[]).reduce((sum,item)=>sum+item.quantity,0)])));});
    observe(instance.services?.quest?.subQuests$,value=>{subQuestState=value;});
    observe(instance.services?.quest?.activityQuests$,value=>{questState=value;});
    observe(instance.services?.gameState?.totalDiamonds$,value=>{if(typeof value==='number'&&Number.isFinite(value))diamondBalance=Math.max(0,value);});
  }
  async function hook(){
    if(document.readyState&&document.readyState!=='complete'){setTimeout(hook,100);return;}
    const detected=globalThis.DVModules.discover(location.href,globalThis.performance?.getEntriesByType?.('resource')??[],Array.from(document.querySelectorAll?.('script[src],link[href]')??[]));
    const candidates=[...new Set([...detected,...GAME_MODULES])].filter(name=>!attemptedModules.has(name));
    const results=await Promise.allSettled(candidates.map(async VERSION=>{
      attemptedModules.add(VERSION);
      const module=await import(new URL(`../${VERSION}`,location.href).href);
      const prototype=module.Game?.prototype;
      if(typeof prototype?.init!=='function')throw new Error('遊戲模組結構不同：'+VERSION);
      if(hookedPrototypes.has(prototype))return;
      hookedPrototypes.add(prototype);
      const original=prototype.init;
      prototype.init=function(...args){connectGame(this);return original.apply(this,args);};
      connectedModules.add(VERSION);moduleReady=true;post('hook',{ready:true,message:'已連接遊戲模組 '+VERSION+'；等待遊戲啟動'});
    }));
    if(candidates.length&&!moduleReady&&results.every(r=>r.status==='rejected')){hookError='無法連接目前遊戲模組';post('hook',{message:hookError});}
    if(!game)setTimeout(hook,750);
  }
  // The site dynamically imports this same Game module. Hook before its init;
  // the original game initialization, server validation and callbacks are preserved.
  hook();
  window.addEventListener('message',event=>{
    if(event.source!==window||event.origin!==location.origin||event.data?.channel!==channel||event.data.source!=='panel')return;
    if(event.data.type==='bossReset'){bossController.restore({});bossRestored=true;}
    if(event.data.type==='openTasks'){release();const ui=getWorld()?.services?.ui;if(typeof ui?.showQuest==='function')ui.showQuest('quest',true);else post('retry',{message:'請先登入並進入遊戲，才能開啟官方任務'});}
    if(event.data.type==='config'){if(!bossRestored){bossController.restore(event.data.bossProgress);bossRestored=true;}settings=globalThis.DVSettings.normalize(event.data.settings);let nextMode=event.data.mode??'fishing';if(nextMode==='boss'&&(bossController.blocked||bossController.completedLevel!==null&&!bossController.active)){nextMode=bossController.returnMode??'fishing';post('modeFallback',{mode:nextMode,message:'恢復 Boss 進度，返回任務模式'});}if(nextMode!==requestedMode)missionPlanner.reset();if(nextMode!==requestedMode&&(globalThis.DVActivities.names[nextMode]||nextMode==='random'||nextMode==='stockpile'||nextMode==='daily')){dailyWaiting=false;const returnMode=mode==='boss'?'fishing':mode;bossController.cancel();if(nextMode==='boss'){bossController.active=true;bossController.returnMode=returnMode;}deliveryBatchMode=null;requestedMode=nextMode;rotate=nextMode==='random'||nextMode==='stockpile';if(nextMode==='stockpile')mode=settings.stockpileModes[0]??'fishing';else if(nextMode==='daily')mode=dailyTasks.choose(signal(getWorld()?.services?.player?.data));else if(nextMode!=='random')mode=nextMode;modeStarted=Date.now();lastItemCount=null;clearNavigation();engine.reset();}const nextEnabled=event.data.enabled===true;if(nextEnabled!==enabled){clearNavigation();engine.reset();activities.lastAction=-Infinity;retryAt=0;missingSince=null;blockedTargets.clear();errorCount=0;}enabled=nextEnabled;}
  });
  window.addEventListener('offline',()=>{release();engine.reset();disconnectedAt=Date.now();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){release();clearNavigation();engine.reset();}});
  window.addEventListener('pagehide',release);
  window.addEventListener('keydown',event=>{if(event.isTrusted&&event.code==='Escape'){enabled=false;release();post('halt',{message:'已按 Esc 停止'});}});
  let balanceSession=null,balanceCooldown=0;
  function balanceAction(s,now){
    const world=getWorld(),level=world?.managers?.level?.currentLevel;
    const dialog=world?.uiManager?.exchangeDialog??world?.managers?.uiManager?.exchangeDialog;
    const open=!!subject(dialog?.isOpen$)||!!subject(world?.services?.ui?.isExchangeDialogVisible$);
    const close=message=>{const completedMode=balanceSession?.mode,data=signal(world?.services?.player?.data),bag=inventoryState?.[completedMode],quest=data?.activities_data?.[completedMode]?.next_quest;if(enabled&&completedMode&&!dailyRotation.exhausted.has(completedMode)&&bag&&(globalThis.DVActivities.stockPolicy(completedMode,bag.items,quest,settings.deliveryMultiplier).ready||!bag.is_full)){dailyWaiting=false;mode=completedMode;rotate=false;deliveryBatchMode=null;engine.reset();}balanceSession=null;balanceCooldown=now+60000;return {type:'closeExchange',message};};
    if(!enabled||requestedMode!=='random'||!settings.autoBalance){return balanceSession?close('停止自動交換'):null;}
    if(!s.ready||!s.online||s.connected===false||!s.visible||s.inputFocused)return balanceSession?{type:'exchangeWait',message:'等待交換連線與畫面恢復'}:null;
    if(!s.inHub||s.submissionOpen||s.storyOpen||s.otherDialog||s.resultOpen)return null;
    if(!balanceSession){
      if(open||s.loading||now<balanceCooldown||bossController.active)return null;
      const data=signal(world.services.player.data);
      const candidates=['fishing','mining','hunting'].filter(k=>!dailyRotation.exhausted.has(k)&&data?.activities_data?.[k]?.has_played).sort((a,b)=>Number(!!inventoryState?.[b]?.is_full)-Number(!!inventoryState?.[a]?.is_full));
      const chosen=candidates.find(k=>globalThis.DVExchange.plan(k,inventoryState?.[k]?.items,data?.activities_data?.[k]?.next_quest,settings.deliveryMultiplier,dialog?.itemExchangeConfig));
      if(!chosen)return null;
      const npc=(level.managers.entity.entities??[]).filter(e=>available(e)&&!e.isLocked?.()&&props(e).some(p=>p.value==='ui_exchange')).sort((a,b)=>Math.hypot(center(a).x-center(level.managers.entity.player).x,center(a).y-center(level.managers.entity.player).y)-Math.hypot(center(b).x-center(level.managers.entity.player).x,center(b).y-center(level.managers.entity.player).y))[0];
      if(!npc){balanceCooldown=now+60000;return null;}
      balanceSession={mode:chosen,npc,started:now,lastAction:0,pending:null,operations:0};clearNavigation();
    }
    const b=balanceSession;
    if(now-b.started>120000)return close('交換流程逾時，稍後再試');
    if(b.pending){
      const current=globalThis.DVExchange.fingerprint(inventoryState?.[b.mode]?.items);
      const rows=inventoryState?.[b.mode]?.items??[],source=rows.find(i=>i.name===b.pending.source)?.quantity,target=rows.find(i=>i.name===b.pending.target)?.quantity;
      if(current!==b.pending.before&&source<b.pending.sourceQuantity&&target>b.pending.targetQuantity&&!dialog?.processingExchange&&!s.loading){b.pending=null;b.operations++;}
      else if(now-b.pending.at>15000)return close('交換庫存尚未確認，暫停避免重複交換');
      else return {type:'exchangeWait',message:'等待官方確認交換與庫存更新'};
    }
    if(s.loading||dialog?.processingExchange)return {type:'exchangeWait',message:'等待交換商店'};
    if(!open){
      if(!available(b.npc))return close('交換 NPC 暫時不可用');
      if(hasContact(level.managers.entity.player,b.npc)){
        if(now-b.lastAction<1000)return {type:'exchangeWait',message:'等待交換商店開啟'};
        b.lastAction=now;return {type:'openExchange',message:'開啟素材交換商店'};
      }
      return {type:'navigateExchange',target:b.npc,message:'尋找素材交換 NPC'};
    }
    if(!dialog?.itemExchangeConfig?.length)return {type:'exchangeWait',message:'等待官方交換成本載入'};
    if(subject(dialog.selectedActivityTab$)!==b.mode){if(now-b.lastAction<500)return {type:'exchangeWait',message:'等待交換分類更新'};b.lastAction=now;return {type:'exchangeTab',dialog,exchangeMode:b.mode,message:'切換素材交換分類'};}
    const data=signal(world.services.player.data),quest=data?.activities_data?.[b.mode]?.next_quest;
    const plan=globalThis.DVExchange.plan(b.mode,inventoryState?.[b.mode]?.items,quest,settings.deliveryMultiplier,dialog.itemExchangeConfig);
    if(!plan||b.operations>=20)return close('素材交換完成或沒有可保留交貨存量的來源');
    if(!plan.ready)return close('官方交換成本不可用，稍後再試');
    const items=dialog.items?.[b.mode],output=items?.[dialog.tradeOutputIndex],index=items?.findIndex(i=>i.name===plan.source);
    if(output?.name!==plan.target||index<0||items[index].disabled)return close('官方目前交換選項不可用');
    if(subject(dialog.tradeInputIndex$)!==index){b.lastAction=now;return {type:'exchangeInput',dialog,index,message:'選擇多餘素材作為交換來源'};}
    if(now-b.lastAction<500)return {type:'exchangeWait',message:'確認素材交換選項'};
    if(dialog.invalidExchangeSelected)return close('官方交換按鈕尚不可用');
    b.pending={before:globalThis.DVExchange.fingerprint(inventoryState?.[b.mode]?.items),at:now,source:plan.source,target:plan.target,sourceQuantity:inventoryState[b.mode].items.find(i=>i.name===plan.source).quantity,targetQuantity:inventoryState[b.mode].items.find(i=>i.name===plan.target).quantity};
    return {type:'exchangeConfirm',dialog,message:'交換缺少素材：'+plan.target};
  }
  function execute(action,s){
    const world=getWorld(),level=world?.managers?.level?.currentLevel;
    if(!['navigateMission','navigateExchange','navigateFishing','navigateVipFishing','navigateDelivery','navigateActivity','combat','dodge','wait'].includes(action.type))release();
    switch(action.type){
      case 'navigateMission':navigate(level,action.target);break;
      case 'navigateExchange':navigate(level,action.target);break;
      case 'openExchange':interact();break;
      case 'exchangeTab':clickButton(action.dialog.tabs?.[action.exchangeMode]);break;
      case 'exchangeInput':action.dialog.tradeInputIndex$?.next(action.index);break;
      case 'exchangeConfirm':if(!action.dialog.processingExchange&&!action.dialog.invalidExchangeSelected)clickButton(action.dialog.exchangeButton);break;
      case 'closeExchange':world?.services?.ui?.hideExchangeDialog?.();clearNavigation();break;
      case 'exchangeWait':release();break;

      case 'dailyLimit':{if(requestedMode==='daily'){dailyTasks.capped=true;dailyTasks.pending=null;deliveryBatchMode=null;world.services.ui.hideQuestSubmissionDialog();dailyWaiting=false;clearNavigation();break;}const data=signal(world.services.player.data),next=dailyRotation.choose(mode,data,inventoryState,settings.deliveryMultiplier);world.services.ui.hideQuestSubmissionDialog();deliveryBatchMode=null;bossController.cancel();clearNavigation();engine.reset();if(next){const keepRandom=requestedMode==='random';mode=next;requestedMode=keepRandom?'random':next;rotate=false;dailyWaiting=false;post('modeFallback',{mode:requestedMode,message:'當日上限，自動切換至'+globalThis.DVActivities.names[mode]});}else{dailyWaiting=true;release();post('retry',{message:'目前可用玩法受每日交貨上限或滿背包限制，等待恢復'});}break;}
      case 'interact':if(mode!=='boss'&&s.slider?.visible&&s.fishingOpen){release();level.managers.fishing?.handleInteraction?.();break;}if(mode==='fishing'&&s.atVipBoat)vipBoardingLevel=level;if(mode==='fishing'&&s.atFishing&&fishingInteraction(level))break;if(mode!=='mining'||!miningInteraction(level))interact();break;
      case 'navigateVipFishing':{const vip=globalThis.DVActivities.vipFishing(level,world.services,signal(world.services.player.data),available);if(vip.boat)navigate(level,vip.boat);else retry('VIP 管理員暫時不可用，等待重新搜尋');break;}
      case 'travelFishing':transition(level,'travelFishing',()=>world.services.rpg.teleport('waypoint_fishing'));break;
      case 'travelActivity':transition(level,'travelActivity',()=>world.services.rpg.teleport(`waypoint_${mode}`));break;
      case 'exitFishing':{const manager=level.managers[mode]??level.managers.fishing??level.managers.mining??level.managers.hunting??level.managers.boss;if(manager?.exitToHub)transition(level,'exitActivity',()=>{findResult(world)?.hide?.();return manager.exitToHub();});else retry('等待目前地圖的退出操作');break;}
      case 'navigateActivity':{const target=globalThis.DVActivities.target(level,mode,available,pathMap===level?pathTarget:null);if(target&&available(target))navigate(level,target);else{retry('採集目標暫時不可用，等待重新搜尋');}break;}
      case 'combat':combat(level);break;
      case 'dodge':if(navigationTimer){clearTimeout(navigationTimer);navigationTimer=null;}path=null;routeSearch=null;routeWaypoint=null;routeAxis=null;stuckSince=null;move(action.code);if(action.dash===true&&s.bossPhase==='hunting'&&mode==='boss'&&settings.bossGuide&&globalThis.DVDash.attempt(level.managers.entity.player,world.services.gameState,action.code)){globalThis.DVNavigation.resetEscape(level.managers.entity.player);audit('boss:dash',{code:action.code,health:level.managers.entity.player.getCurrentHealth?.()});}break;
      case 'advanceStory':interact();break;
      case 'startBoss':
      case 'startTreasury':clickButton(findPlayButton(world));break;
      case 'activityResult':{const result=findResult(world);if(result&&!result.isCtaClicked){release();if(mode==='boss'){const choice=globalThis.DVActivities.bossResultAction(result,bossController);if(choice==='return')transition(level,'exitBossResult',()=>{result.hide();level.managers.boss.exitToHub();});else if(choice==='retry')clickButton(result.rightButton);break;}if(['random','stockpile','daily'].includes(requestedMode)&&level.managers[mode]?.exitToHub){transition(level,'exitResult',()=>{result.hide();return level.managers[mode].exitToHub();});rotate=true;}else{const b=result.resultType===false||result.result===false?result.rightButton:result.leftButton;clickButton(b);}}break;}
      case 'navigateFishing':{
        const allAreas=fishingAreas(level),vip=globalThis.DVActivities.vipFishing(level,world.services,signal(world.services.player.data),available);
        const exclusive=vip.inside?allAreas.filter(e=>String(e.label??'').includes('hvu')):[];
        const areas=exclusive.length?exclusive:allAreas;
        const current=pathMap===level?areas.find(e=>targetKey(e)===pathTarget):null;
        const chosen=current??areas[0];
        if(chosen){missingSince=null;navigate(level,chosen);}else{missingSince??=Date.now();retry('沒有可到達的釣魚點，等待後重新搜尋');if(Date.now()-missingSince>120000&&Date.now()-lastRecovery>60000){lastRecovery=Date.now();post('recover',{reason:'釣魚目標持續無法到達'});}}break;

      }
      case 'navigateDelivery':{const match=deliveryTarget(level);if(match)navigate(level,match.entity);else retry('交貨 NPC 名稱無法確認，等待重新搜尋');break;}
      case 'submit':{
        const d=world.uiManager?.questSubmissionDialog??world.managers.uiManager?.questSubmissionDialog;
        if(d&&!subject(d.submitDisabled$)&&!d.submissionInProgress){if(requestedMode==='daily')dailyTasks.submitting(mode,s.questSubmissions);clickButton(d.submitButton);}break;
      }
      case 'closeSubmission':if(deliveryBatchMode===mode)bossController.missionCompleted();deliveryBatchMode=null;world.services.ui.hideQuestSubmissionDialog();clearNavigation();break;
      case 'halt':clearNavigation();retryAt=Date.now()+5000;retryMessage=action.message;post('retry',{message:action.message});break;
      case 'offline':release();break;
      case 'wait':
        // Keep movement only while a navigation action is throttled by the scheduler.
        if(s.atFishing||s.loading||s.inputFocused||!s.visible||!s.ready||s.otherDialog||s.slider?.visible||s.submissionOpen||!enabled||dailyWaiting)release();
        break;
    }
  }
  setInterval(()=>{
    try{
      if(enabled&&Date.now()<retryAt){release();return;}
      if(enabled&&['random','stockpile'].includes(requestedMode)&&!bossController.active&&getWorld()?.managers?.level?.currentLevel?.label==='map_hub'&&rotate){
        const data=signal(getWorld()?.services?.player?.data);
        const choices=requestedMode==='stockpile'?globalThis.DVSettings.stockpileChoices(settings,data,inventoryState):['fishing','mining','hunting'].filter(k=>!dailyRotation.exhausted.has(k)&&data?.activities_data?.[k]?.has_played&&(!inventoryState?.[k]?.is_full||globalThis.DVActivities.stockPolicy(k,inventoryState[k].items,data.activities_data[k].next_quest,settings.deliveryMultiplier).ready));
        if(choices.length){const alternatives=choices.filter(k=>k!==mode);const pool=alternatives.length?alternatives:choices;mode=pool[Math.floor(Math.random()*pool.length)];rotate=false;modeStarted=Date.now();lastItemCount=null;clearNavigation();engine.reset();}
      }
      if(enabled&&dailyWaiting&&requestedMode==='random'&&getWorld()?.managers?.level?.currentLevel?.label==='map_hub'){const data=signal(getWorld()?.services?.player?.data),next=['fishing','mining','hunting'].find(k=>!dailyRotation.exhausted.has(k)&&data?.activities_data?.[k]?.has_played&&inventoryState?.[k]&&(!inventoryState[k].is_full||globalThis.DVActivities.stockPolicy(k,inventoryState[k].items,data.activities_data[k].next_quest,settings.deliveryMultiplier).ready));if(next){mode=next;dailyWaiting=false;rotate=false;deliveryBatchMode=null;clearNavigation();engine.reset();}}
      const currentLevel=getWorld()?.managers?.level?.currentLevel;
      const bossResultReady=currentLevel?.label!=='map_boss'||!!findResult(getWorld());
      const dailyData=signal(getWorld()?.services?.player?.data);const hadDailyLimits=dailyRotation.exhausted.size;dailyRotation.observe(dailyData?.quest_submissions_today);if(hadDailyLimits&&!dailyRotation.exhausted.size)dailyWaiting=false;
      const playerLevel=signal(getWorld()?.services?.player?.data)?.overall_level?.level??0;
      if(enabled&&requestedMode==='boss'&&!bossController.active&&bossController.returnMode&&bossResultReady){requestedMode=bossController.returnMode;mode=requestedMode;post('modeFallback',{mode,message:'Boss 挑戰結束，返回任務模式'});clearNavigation();engine.reset();}
      if(enabled&&!dailyWaiting&&requestedMode!=='boss'&&requestedMode!=='stockpile'&&requestedMode!=='missions'&&requestedMode!=='daily'){
        if(bossController.active&&!settings.autoBoss)bossController.cancel();
        if(mode==='boss'&&!bossController.active&&bossResultReady){mode=bossController.returnMode??(requestedMode==='random'?'fishing':requestedMode);clearNavigation();engine.reset();}
        if(mode!=='boss'&&currentLevel?.label==='map_hub'&&!deliveryBatchMode&&bossController.enter(playerLevel,settings,mode)){mode='boss';clearNavigation();engine.reset();}
      }
      if(mode==='hunting')huntingTracker.update(currentLevel,Date.now());auditMining(currentLevel);auditDamage(currentLevel?.managers?.entity?.player);
      if(pendingTransition&&(pendingTransition.level!==currentLevel||pendingTransition.label!==currentLevel?.label))pendingTransition=null;
      if(['random','stockpile'].includes(requestedMode)&&!bossController.active&&currentLevel&&currentLevel.label!=='map_hub'&&!currentLevel.managers?.[mode]){
        const actualMode=['fishing','mining','hunting'].find(k=>currentLevel.managers?.[k]);
        if(actualMode){mode=actualMode;rotate=false;modeStarted=Date.now();lastItemCount=null;clearNavigation();engine.reset();}
      }
      if(enabled&&requestedMode==='daily'&&currentLevel?.label==='map_hub'&&!findResult(getWorld())&&!subject((getWorld()?.uiManager?.questSubmissionDialog)?.isOpen$)&&!getWorld()?.uiManager?.cutsceneUi?.state){
        dailyTasks.observe(dailyData?.quest_submissions_today);
        const desired=dailyTasks.choose(dailyData);
        if(mode!==desired){mode=desired;deliveryBatchMode=null;missionPlanner.reset();clearNavigation();engine.reset();dailyDialogueUntil=Date.now()+60000;}
      }
      if(enabled&&pendingTransition&&Date.now()-pendingTransition.started>30000&&Date.now()-lastRecovery>60000&&!document.hidden&&navigator.onLine){lastRecovery=Date.now();release();post('recover',{reason:'地圖轉場逾時，重新連接'});}
      const s=snapshot();
      if(requestedMode==='stockpile'){dailyWaiting=false;bossController.cancel();}
      if(inventoryState){const bag=inventoryState[mode];s.itemCount=(bag?.items??[]).reduce((sum,item)=>sum+item.quantity,0);s.bagFull=!!bag?.is_full;
        const data=signal(getWorld()?.services?.player?.data),quest=questState?.[mode]?.quest??data?.activities_data?.[mode]?.next_quest;
        s.stock=globalThis.DVActivities.stockPolicy(mode,bag?.items,quest,settings.deliveryMultiplier);if(requestedMode==='daily'&&quest){s.stock={rows:[{name:quest.item,quantity:(bag?.items??[]).find(i=>i.name===quest.item)?.quantity??0,threshold:quest.quantity,exactRequirement:true}],required:quest.quantity,ready:false};}
        if(s.stock.ready)deliveryBatchMode=mode;
        const enoughForCurrent=!!(quest&&quest.quantity>0&&((bag?.items??[]).find(i=>i.name===quest.item)?.quantity??0)>=quest.quantity);
        if(requestedMode==='daily'&&mode!=='missions'&&enoughForCurrent)deliveryBatchMode=mode;
        if(deliveryBatchMode===mode&&!s.submissionOpen&&!enoughForCurrent)deliveryBatchMode=null;
        s.questReady=deliveryBatchMode===mode&&enoughForCurrent;
        s.canSubmit=s.canSubmit&&deliveryBatchMode===mode;if(requestedMode==='daily'&&dailyTasks.choose(data)!==mode)s.canSubmit=false;if(requestedMode==='stockpile'){s.questReady=false;s.canSubmit=false;s.masteryMax=false;deliveryBatchMode=null;}
        s.ready=!!(game?.started&&getWorld()?.managers?.level?.currentLevel?.managers.entity.player&&data);
      }
      if(s.connected===false||!s.online){disconnectedAt??=Date.now();clearNavigation();}
      else if(disconnectedAt){clearNavigation();engine.reset();disconnectedAt=null;recoveryRequested=false;}
      if(enabled&&s.online&&!document.hidden&&disconnectedAt&&Date.now()-disconnectedAt>30000&&!recoveryRequested){recoveryRequested=true;post('recover',{reason:'遊戲連線未恢復'});}
      const now=Date.now();
      if(requestedMode==='daily')dailyTasks.observe(s.questSubmissions);
      if(enabled&&dailyWaiting&&s.online&&s.connected!==false&&s.visible&&now-lastDailyRefresh>60000){lastDailyRefresh=now;getWorld()?.services?.player?.refreshAllUserData$?.subscribe({error:()=>{}});}
      if(enabled&&!s.ready&&s.visible&&s.online){unreadySince??=now;if(now-unreadySince>120000&&now-lastRecovery>60000){lastRecovery=now;post('recover',{reason:'等待遊戲狀態逾時'});}}else unreadySince=null;
      if(enabled&&mode==='fishing'&&s.ready&&s.visible&&s.online&&s.connected!==false&&s.atFishing&&!s.canPlay&&!s.slider?.visible&&!s.loading&&!s.otherDialog&&!s.submissionOpen&&!s.bagFull){
        fishingWaitSince??=now;
        if(now-fishingWaitSince>120000&&now-lastRecovery>60000){lastRecovery=now;post('recover',{reason:'釣魚互動等待逾時'});}
      }else fishingWaitSince=null;
      const gate=engine.decide(s,now);
      let action=engine.connectedAt!==null&&now-engine.connectedAt>=5000?(activities.decide(s,now)??gate):gate;
      if(enabled&&!s.inHub&&!s.inActivity&&['fishing','mining','hunting','boss'].includes(mode)&&!s.loading&&!s.otherDialog&&!s.slider?.visible&&!s.fishingOpen&&(currentLevel?.managers?.fishing||currentLevel?.managers?.mining||currentLevel?.managers?.hunting||currentLevel?.managers?.boss))action={type:'exitFishing',message:'返回城鎮後切換玩法'};
      if(requestedMode==='random'&&mode==='fishing'&&lastItemCount!==null&&s.itemCount>lastItemCount&&now-modeStarted>90000){rotate=true;}
      lastItemCount=s.itemCount;
      if(globalThis.DVNavigation.shouldReturnFishing(requestedMode,mode,rotate,s))action={type:'exitFishing',message:'本輪釣魚完成，返回城鎮隨機切換玩法'};
      if(enabled&&mode!=='fishing'&&s.fishingOpen)action=s.slider?.visible?gate:{type:'wait',message:'完成目前釣魚回合後再切換玩法'};
      if(enabled&&now<retryAt)action={type:'wait',message:retryMessage};
      if(enabled&&['combat','navigateActivity','interact','wait'].includes(action.type)&&!pendingTransition&&!s.questReady&&!s.bagFull&&['mining','hunting','boss'].includes(mode)&&!(mode==='boss'&&(s.bossComplete||s.bossPhase==='fishing'))&&s.ready&&s.visible&&s.online&&s.connected!==false&&!s.loading&&!s.otherDialog&&!s.inputFocused&&!s.resultOpen&&!s.slider?.visible){const player=currentLevel.managers.entity.player;const guide=mode==='boss'&&settings.bossGuide,dangers=mode==='mining'?currentLevel.managers.mining?.mining?.dangers:guide?globalThis.DVNavigation.bossGuideDangers(currentLevel.managers.entity.entities,player):globalThis.DVNavigation.combatDangers(currentLevel.managers.entity.entities);const nearbyWarning=guide&&(dangers??[]).some(d=>d.warning&&d.body&&player.body.x<d.body.x+d.body.width+16&&player.body.x+player.body.width>d.body.x-16&&player.body.y<d.body.y+d.body.height+16&&player.body.y+player.body.height>d.body.y-16);const code=(mode==='hunting'?huntingTracker.evade(player,polygonList(currentLevel),dangers):null)??globalThis.DVNavigation.dodge(player,dangers,polygonList(currentLevel),nearbyWarning?'ArrowDown':null,guide,guide?(bossStands.get(globalThis.DVActivities.target(currentLevel,mode))??globalThis.DVNavigation.bossAnchor(player,globalThis.DVActivities.target(currentLevel,mode),currentLevel.managers.entity.entities)):null);if(code)action={type:'dodge',code,dash:!!nearbyWarning,message:mode==='mining'?'避開落石警示與爆炸區':mode==='hunting'&&huntingTracker.threat?'側移避開黃色小球，追蹤發射來源':'避開戰鬥範圍攻擊與投射物'};}
      if(enabled&&requestedMode==='stockpile'&&s.ready&&s.online&&s.visible&&!s.loading&&!s.otherDialog){if(s.submissionOpen)action={type:'closeSubmission',message:'只採集模式，關閉交貨介面'};else if(s.bagFull||!settings.stockpileModes.includes(mode)){if(!s.inHub)action=s.fishingOpen?{type:'wait',message:'完成目前釣魚回合後切換採集'}:{type:'exitFishing',message:'本項已滿或已取消，返回城鎮切換採集'};else{const next=globalThis.DVSettings.stockpileChoices(settings,signal(getWorld()?.services?.player?.data),inventoryState).find(k=>k!==mode);if(next){mode=next;engine.reset();clearNavigation();action={type:'wait',message:'切換至'+globalThis.DVActivities.names[next]+'繼續採集'};}else action={type:'wait',message:settings.stockpileModes.length?'勾選項目已滿或尚未解鎖，等待可用空間':'未勾選採集項目，等待設定'};}}}
      if(enabled&&s.ready&&s.online&&s.connected!==false&&s.visible&&!s.loading&&!s.inputFocused&&requestedMode==='daily'&&s.submissionOpen&&!s.submitting&&!dailyTasks.pending&&dailyTasks.choose(dailyData)!==mode)action={type:'closeSubmission',message:'本項交貨已確認，切換下一項日常任務'};
      if(dailyWaiting)action={type:'wait',message:'目前可用玩法受每日交貨上限或滿背包限制，等待恢復'};
      if(requestedMode==='missions'||requestedMode==='daily'&&mode==='missions'){const level=getWorld()?.managers?.level?.currentLevel;action=!s.inHub&&s.enabled&&s.ready&&s.visible&&s.online&&s.connected!==false&&!s.loading&&!s.otherDialog&&!s.fishingOpen?{type:'exitFishing',message:'返回城鎮執行對話支線'}:missionPlanner.decide(s,subQuestState,level?.managers?.entity?.entities??[],now,e=>hasContact(level?.managers?.entity?.player,e));}
      if(enabled&&requestedMode==='daily'&&mode==='missions'&&s.ready&&s.online&&s.connected!==false&&s.visible&&!s.inputFocused&&!s.loading&&!s.otherDialog&&!s.storyOpen&&!missionPlanner.active){if(action.missionsIdle||now>dailyDialogueUntil){dailyTasks.finishDialogue();dailyDialogueUntil=now+60000;action={type:'wait',message:dailyTasks.capped?'今日交貨已達官方上限；目前無可執行對話支線，等待每日重置':'對話支線已檢查，立即接續三項交貨'};}}
      const exchange=requestedMode==='daily'?null:balanceAction(s,now);if(exchange)action=exchange;
      if(!exchange&&(action.type==='dailyLimit'||dailyWaiting))release();
      execute(action,s);errorCount=0;
      if(Date.now()-lastStatus>300){lastStatus=Date.now();const level=getWorld()?.managers?.level?.currentLevel,match=deliveryTarget(level),target=action.type==='navigateDelivery'?match?.entity:(level?.managers?.entity?.entities??[]).find(e=>targetKey(e)===pathTarget)??(mode==='fishing'?fishingAreas(level)[0]:globalThis.DVActivities.target(level,mode)),player=level?.managers?.entity?.player;post('status',{missions:globalThis.DVMissions.list(subQuestState,subject(getWorld()?.services?.auth?.userData$)),moduleReady,status:action.message,enabled,mode,map:s.map,level:s.level,diamonds:s.diamonds,itemCount:s.itemCount,stock:s.stock,bossState:{...bossController.progress(),attackLevel:signal(getWorld()?.services?.player?.data)?.activities_data?.hunting?.level,healthLevel:signal(getWorld()?.services?.player?.data)?.activities_data?.mining?.level},hooked:!!game,diagnostics:{daily:requestedMode==='daily'?{index:dailyTasks.index,dialogue:dailyTasks.dialogue,capped:dailyTasks.capped,pending:dailyTasks.pending,count:s.questSubmissions}:null,moduleConnection:{attached:!!game,hooked:[...connectedModules]},projectileSource:mode==='hunting'?{shot:huntingTracker.threat?.shot?.name??null,source:huntingTracker.target?.name??null,impactFrames:huntingTracker.threat?.t??null}:null,exchangeCandidates:['fishing','mining','hunting'].map(k=>({mode:k,exhausted:dailyRotation.exhausted.has(k),quest:signal(getWorld()?.services?.player?.data)?.activities_data?.[k]?.next_quest,items:inventoryState?.[k]?.items,plan:globalThis.DVExchange.plan(k,inventoryState?.[k]?.items,signal(getWorld()?.services?.player?.data)?.activities_data?.[k]?.next_quest,settings.deliveryMultiplier,(getWorld()?.uiManager?.exchangeDialog??getWorld()?.managers?.uiManager?.exchangeDialog)?.itemExchangeConfig)})),exchangeNpcs:(level?.managers?.entity?.entities??[]).filter(e=>props(e).some(p=>p.value==='ui_exchange')).map(e=>({name:e.name,enabled:e.enabled,locked:e.isLocked?.(),body:e.body})),exchange:balanceSession?{mode:balanceSession.mode,pending:!!balanceSession.pending,operations:balanceSession.operations}:null,action:action.type,mode,vip:s.vip,boatCandidates:(level?.managers?.entity?.entities??[]).filter(e=>/boat|hvu/i.test(String(e.name??'')+' '+String(e.label??''))).map(e=>({name:e.name,label:e.label,enabled:e.enabled,destroyed:e.destroyed,canInteract:e.canInteract,locked:e.isLocked?.(),body:e.body,properties:e.properties?.get?.()})),health:player?.getCurrentHealth?.(),boss:mode==='boss'?{returnStance:bossStands.get(globalThis.DVActivities.target(level,mode))??null,slider:s.slider,dash:{enabled:subject(getWorld()?.services?.gameState?.dashEnabled$),ready:subject(getWorld()?.services?.gameState?.canDash$),active:player?.isDashing,cooldown:subject(getWorld()?.services?.ui?.dashCooldownState$)},phase:level?.managers?.boss?.boss?.currentActivity,pending:signal(level?.managers?.boss?.pendingUpdates),health:level?.managers?.boss?.boss?.boss?.getHealth?.(),playerBody:player?.body,weaponBodies:player?.weaponBodies,weapons:Object.values(player?.weapons??{}).map(w=>({name:w.weapon?.name})),dangers:globalThis.DVNavigation.combatDangers(level?.managers?.entity?.entities),pillars:(level?.managers?.entity?.entities??[]).filter(e=>/pillar|column|柱/i.test(String(e.name??'')+' '+String(e.label??''))).map(e=>({name:e.name,label:e.label,body:e.body}))}:null,audit:[...auditEvents],position:player?.body?feet(player):null,target:target?{name:target.name,id:target.id,body:target.body}:null,nextPoint:path?.[0],waypoints:path?.length??0,planning:!!routeSearch,observedStep,routeAxis,rotate,transition:pendingTransition?.action??null,npcMatch:match?{name:match.entity.name,method:match.method,score:match.score}:null,held:[...held],collided:player?.collidedObj?.name,contacts:[...(player?.collidedEntities?.arriving?.values?.()??[]),...(player?.collidedEntities?.staying?.values?.()??[])].map(e=>e.name??e.label),targetPolygon:interactionPolygon(target),submissionOpen:s.submissionOpen,canSubmit:s.canSubmit,submitting:s.submitting,questReady:s.questReady,stock:s.stock,deliveryBatch:deliveryBatchMode===mode,loading:s.loading}});}
    }catch(error){release();clearNavigation();hookError=`遊戲狀態暫時不相容：${error.message}`;if(enabled&&Date.now()>=retryAt){errorCount++;retryAt=Date.now()+3000;retryMessage=hookError;post('retry',{message:hookError,diagnostics:{error:error.message,stack:error.stack}});if(errorCount>=3&&Date.now()-lastRecovery>60000){lastRecovery=Date.now();post('recover',{reason:hookError});}}}

  },30);
})();
