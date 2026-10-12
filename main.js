(() => {
  'use strict';
  const VERSION='game-6NMIDNT2.js';
  const engine=new globalThis.DVAutoplay.Autoplayer();
  let settings=globalThis.DVSettings.normalize({});const bossController=new globalThis.DVSettings.BossController();const dailyRotation=new globalThis.DVSettings.DailyRotation();let dailyWaiting=false,lastDailyRefresh=0;
  const activities=new globalThis.DVActivities.ActivityPlanner();let mode='fishing',requestedMode='fishing',rotate=false,modeStarted=0,lastItemCount=null,deliveryBatchMode=null;
  let game=null,enabled=false,hookError='',lastStatus=0,lastNavigation=0,path=null,pathTarget='',pathMap=null,routeAxis=null,routeWaypoint=null,routeSearch=null;
  let disconnectedAt=null,recoveryRequested=false,lastPulse=0,pendingTransition=null;
  const auditEvents=[],auditedManagers=new WeakSet(),auditedPlayers=new WeakSet();
  const audit=(event,detail)=>{auditEvents.push({event,detail,at:Date.now()});if(auditEvents.length>24)auditEvents.shift();};
  function auditMining(level){const manager=level?.managers?.[mode];if(!manager||auditedManagers.has(manager))return;auditedManagers.add(manager);const activityMode=mode;for(const name of ['start','playerActivateVein','playerReachedSafezone','complete','die','success','fail']){const original=manager[name];if(typeof original!=='function')continue;manager[name]=function(...args){if(activityMode==='boss'&&!this.hasComplete&&['success','fail'].includes(name))bossController.result(name==='success',signal(getWorld()?.services?.player?.data)?.overall_level?.level??0,settings);audit(activityMode+':'+name,['string','boolean'].includes(typeof args[0])?args[0]:null);return original.apply(this,args);};}}
  function auditDamage(player){
    if(!player||auditedPlayers.has(player)||typeof player.onShot!=='function')return;
    auditedPlayers.add(player);const original=player.onShot;
    player.onShot=function(...args){const before=this.getCurrentHealth?.();const result=original.apply(this,args);const after=this.getCurrentHealth?.();if(Number.isFinite(before)&&Number.isFinite(after)&&after<before)audit('damage',{source:args[0]?.name??args[0]?.label,amount:before-after,health:after});return result;};
  }
  const held=new Set();let navigationTimer=null,pulseTimer=null,lastPosition=null,stuckSince=null,observedStep=6;const polygonCache=new WeakMap();
  let retryAt=0,retryMessage='',errorCount=0,lastRecovery=0,missingSince=null,unreadySince=null,fishingWaitSince=null;const blockedTargets=new Map();
  const targetKey=e=>e?.uid??e?.id??e?.name;
  const available=e=>e?.body&&!e.destroyed&&e.enabled!==false&&(blockedTargets.get(targetKey(e))??0)<=Date.now();
  function retry(message,target=null){if(target)blockedTargets.set(targetKey(target),Date.now()+30000);clearNavigation();retryAt=Date.now()+1500;retryMessage=message;post('retry',{message,diagnostics:{mode,target:target?{name:target.name,id:target.id}:null}});}
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
  function clearNavigation(){path=null;pathTarget='';pathMap=null;routeAxis=null;routeWaypoint=null;routeSearch=null;lastPosition=null;stuckSince=null;release();}
  function transition(level,action,callback){
    if(pendingTransition?.level===level&&pendingTransition.label===level?.label&&Date.now()-pendingTransition.started<10000)return false;
    clearNavigation();pendingTransition={level,label:level?.label,action,started:Date.now()};
    try{callback();return true;}catch(error){pendingTransition=null;throw error;}
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
    const player=level.managers.entity.player,target=globalThis.DVActivities.target(level,mode);
    if(!target||player.isCutscene||player.lockedCamera){clearNavigation();return;}
    if(navigationTimer){clearTimeout(navigationTimer);navigationTimer=null;}
    const code=globalThis.DVNavigation.combatDirection(player,target,Math.max(12,Math.min(20,observedStep/2)));
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
      const shape=typeof item.body?.toPolygon==='function'?item.body.toPolygon():item.body;
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
  function miningInteraction(level){
    const player=level?.managers?.entity?.player,target=globalThis.DVActivities.target(level,'mining',available,pathMap===level?pathTarget:null);
    if(!target||!hasContact(player,target)||!target.canInteract||!(/^(VEIN_|GENERAL_SAFE_ZONE|SPECIAL_ZONE)/.test(target.name??target.label??''))||typeof target.handleInteraction!=='function'||player.lockedCamera||player.isInteracting||player.isCutscene)return false;
    release();if(Date.now()-lastPulse<650)return true;lastPulse=Date.now();target.handleInteraction();return true;
  }
  function navigationGoals(entity,player){
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
    return [...unique.values()].filter(goal=>!polygon||[-9,9].every(dx=>[-9,9].every(dy=>globalThis.DVAutoplay.polygonIntersectsRect(polygon,{x:goal.x+dx-p.halfX,y:goal.y+dy-p.offset-p.halfY,width:p.halfX*2,height:p.offset+p.halfY*2}))));
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
        release();routeSearch=globalThis.DVAutoplay.createPathSearch(p,navigationGoals(target,player)??[],polygonList(level),{x:p.halfX+4,y:p.halfY+4});pathTarget=targetId;pathMap=level;routeAxis=null;routeWaypoint=null;
      }
      const result=routeSearch.step(200,4);
      if(!result.done){release();return;}
      routeSearch=null;lastPosition=p;stuckSince=null;path=result.path?globalThis.DVNavigation.simplify(result.path):null;
      if(!path){retry(`暫時無法到達 ${target.name??'目標'}，嘗試其他目標`,target);return;}

    }
    const tolerance=Math.min(9,Math.max(3,observedStep/2+1));
    while(path.length&&Math.abs(path[0].x-p.x)<=tolerance&&Math.abs(path[0].y-p.y)<=tolerance)path.shift();
    if(!path.length){release();if(player.collidedObj===target)interact();else{path=null;}return;}
    const dx=path[0].x-p.x,dy=path[0].y-p.y;
    if(routeWaypoint!==path[0]){routeWaypoint=path[0];routeAxis=null;}
    const direction=globalThis.DVNavigation.direction(p,path[0],routeAxis,tolerance);routeAxis=direction.axis;move(direction.code);
    // Near a corner, release between control ticks so several game frames cannot overshoot it.
    const remaining=direction.axis==='x'?Math.abs(dx):Math.abs(dy);
    if(direction.code&&remaining<Math.max(24,observedStep*1.5)&&!navigationTimer){const code=direction.code;navigationTimer=setTimeout(()=>{key('keyup',code);held.delete(code);navigationTimer=null;},10);}
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
      loading:!!((pendingTransition?.level===level&&pendingTransition.label===level?.label&&Date.now()-pendingTransition.started<10000)||level?.preventUpdates||subject(services?.gameState?.inGameLoading$)||player?.isChangingLevel),
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
      diamonds:subject(services?.auth?.userData$)?.data?.total_diamonds,itemCount,bagFull:!!fishingData?.is_full,
      questSubmissions:data?.quest_submissions_today,questReady:globalThis.DVActivities.stockPolicy(mode,fishingData?.items,quest,settings.deliveryMultiplier).ready,
      fishingUnlocked:!!data?.activities_data?.fishing?.has_played,
      vipWanted:mode==='fishing'&&vip.eligible&&!vip.inside, vipBoatAvailable:!!vip.boat, atVipBoat:!!vip.boat&&hasContact(player,vip.boat),
      masteryMax:!!(data&&fishingManager?.maxMasteryLevel?.(data)),
      inHub:level?.label==='map_hub',inFishing:!!fishingManager,
      atFishing:!!player?.collidedObj&&isFishingArea(player.collidedObj),
      atDelivery:!!player?.collidedObj&&player.collidedObj===deliveryTarget(level)?.entity,
      canPlay:!!fishingManager?.canPlayMinigame?.(),
      submissionOpen:!!subject(dialog?.isOpen$)||!!subject(services?.ui?.isQuestSubmissionDialogVisible$),
      canSubmit:!!dialog&&!subject(dialog.submitDisabled$)&&!!dialog.submitButton?.view&&dialog.submitButton.button?.enabled!==false,
      submitting:!!dialog?.submissionInProgress,
      dailyLimit:!!(dialog?.dailySubmitLimitText?.parent&&dialog.dailySubmitLimitText.parent===dialog.container),
      otherDialog:!!(player?.isCutscene||subject(services?.ui?.isRewardsVisible$)||subject(services?.ui?.isBagVisible$)||subject(services?.ui?.isSettingsVisible$)||subject(services?.ui?.isMapVisible$)),
      slider:slider?{visible:!!slider.visible&&(mode==='boss'||!!level?.managers?.fishing?.fishing?.isOpen$?.value),done:slider.isInteracted,cooldown:slider.cooldownTimer,indicator:slider.indicator.x,left:slider.successZone.x,width:slider.successZone.width,clicks:slider.totalClicks}:null
    };
  }
  let questState=null,inventoryState=null,subscriptions=[];
  function connectGame(instance){
    subscriptions.forEach(s=>s.unsubscribe());subscriptions=[];
    game=instance;questState=null;inventoryState=null;engine.reset();clearNavigation();hookError='';
    const observe=(source,callback)=>{if(source?.subscribe)subscriptions.push(source.subscribe(callback));};
    observe(instance.services?.inventory?.items$,value=>{inventoryState=value;audit('inventory',Object.fromEntries(['fishing','mining','hunting'].map(k=>[k,(value?.[k]?.items??[]).reduce((sum,item)=>sum+item.quantity,0)])));});
    observe(instance.services?.quest?.activityQuests$,value=>{questState=value;});
  }
  async function hook(){
    try{
      const module=await import(new URL(`../${VERSION}`,location.href).href);
      if(typeof module.Game?.prototype?.init!=='function')throw new Error('遊戲模組結構不同');
      const original=module.Game.prototype.init;
      module.Game.prototype.init=function(...args){connectGame(this);return original.apply(this,args);};
      post('hook',{message:'已連接遊戲初始化；等待遊戲啟動'});
    }catch(error){hookError=`無法連接遊戲模組：${error.message}`;post('hook',{message:hookError});}
  }
  // The site dynamically imports this same Game module. Hook before its init;
  // the original game initialization, server validation and callbacks are preserved.
  hook();
  window.addEventListener('message',event=>{
    if(event.source!==window||event.origin!==location.origin||event.data?.channel!==channel||event.data.source!=='panel')return;
    if(event.data.type==='config'){settings=globalThis.DVSettings.normalize(event.data.settings);const nextMode=event.data.mode??'fishing';if(nextMode!==requestedMode&&(globalThis.DVActivities.names[nextMode]||nextMode==='random')){dailyWaiting=false;const returnMode=mode==='boss'?'fishing':mode;bossController.cancel();if(nextMode==='boss'){bossController.active=true;bossController.returnMode=returnMode;}deliveryBatchMode=null;requestedMode=nextMode;rotate=nextMode==='random';if(nextMode!=='random')mode=nextMode;modeStarted=Date.now();lastItemCount=null;clearNavigation();engine.reset();}const nextEnabled=event.data.enabled===true;if(nextEnabled!==enabled){clearNavigation();engine.reset();activities.lastAction=-Infinity;retryAt=0;missingSince=null;blockedTargets.clear();errorCount=0;}enabled=nextEnabled;}
  });
  window.addEventListener('offline',()=>{release();engine.reset();disconnectedAt=Date.now();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){release();clearNavigation();engine.reset();}});
  window.addEventListener('pagehide',release);
  window.addEventListener('keydown',event=>{if(event.isTrusted&&event.code==='Escape'){enabled=false;release();post('halt',{message:'已按 Esc 停止'});}});
  function execute(action,s){
    const world=getWorld(),level=world?.managers?.level?.currentLevel;
    if(!['navigateFishing','navigateVipFishing','navigateDelivery','navigateActivity','combat','dodge','wait'].includes(action.type))release();
    switch(action.type){
      case 'dailyLimit':{const data=signal(world.services.player.data),next=dailyRotation.choose(mode,data);world.services.ui.hideQuestSubmissionDialog();deliveryBatchMode=null;bossController.cancel();clearNavigation();engine.reset();if(next){mode=next;requestedMode=next;rotate=false;dailyWaiting=false;post('modeFallback',{mode,message:'當日上限，自動切換至'+globalThis.DVActivities.names[mode]});}else{dailyWaiting=true;release();post('retry',{message:'所有已解鎖採集模式均遇到當日上限，等待計數重置'});}break;}
      case 'interact':if(mode!=='mining'||!miningInteraction(level))interact();break;
      case 'navigateVipFishing':{const vip=globalThis.DVActivities.vipFishing(level,world.services,signal(world.services.player.data),available);if(vip.boat)navigate(level,vip.boat);else retry('VIP 管理員暫時不可用，等待重新搜尋');break;}
      case 'travelFishing':transition(level,'travelFishing',()=>world.services.rpg.teleport('waypoint_fishing'));break;
      case 'travelActivity':transition(level,'travelActivity',()=>world.services.rpg.teleport(`waypoint_${mode}`));break;
      case 'exitFishing':{const manager=level.managers[mode]??level.managers.fishing??level.managers.mining??level.managers.hunting??level.managers.boss;if(manager?.exitToHub)transition(level,'exitActivity',()=>{findResult(world)?.hide?.();manager.exitToHub();});else retry('等待目前地圖的退出操作');break;}
      case 'navigateActivity':{const target=globalThis.DVActivities.target(level,mode,available,pathMap===level?pathTarget:null);if(target&&available(target))navigate(level,target);else{retry('採集目標暫時不可用，等待重新搜尋');}break;}
      case 'combat':combat(level);break;
      case 'dodge':if(navigationTimer){clearTimeout(navigationTimer);navigationTimer=null;}path=null;routeSearch=null;routeWaypoint=null;routeAxis=null;stuckSince=null;move(action.code);break;
      case 'advanceStory':interact();break;
      case 'startBoss':
      case 'startTreasury':clickButton(findPlayButton(world));break;
      case 'activityResult':{const result=findResult(world);if(result&&!result.isCtaClicked){release();if(mode==='boss'){const choice=globalThis.DVActivities.bossResultAction(result,bossController);if(choice==='return')transition(level,'exitBossResult',()=>{result.hide();level.managers.boss.exitToHub();});else if(choice==='retry')clickButton(result.rightButton);break;}if(requestedMode==='random'&&level.managers[mode]?.exitToHub){transition(level,'exitResult',()=>{result.hide();level.managers[mode].exitToHub();});rotate=true;}else{const b=result.resultType===false||result.result===false?result.rightButton:result.leftButton;clickButton(b);}}break;}
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
        if(d&&!subject(d.submitDisabled$)&&!d.submissionInProgress)clickButton(d.submitButton);break;
      }
      case 'closeSubmission':if(deliveryBatchMode===mode)bossController.missionCompleted();deliveryBatchMode=null;world.services.ui.hideQuestSubmissionDialog();clearNavigation();break;
      case 'halt':clearNavigation();retryAt=Date.now()+5000;retryMessage=action.message;post('retry',{message:action.message});break;
      case 'offline':release();break;
      case 'wait':
        // Keep movement only while a navigation action is throttled by the scheduler.
        if(s.loading||s.inputFocused||!s.visible||!s.ready||s.otherDialog||s.slider?.visible||s.submissionOpen||!enabled||dailyWaiting)release();
        break;
    }
  }
  setInterval(()=>{
    try{
      if(enabled&&Date.now()<retryAt){release();return;}
      if(enabled&&requestedMode==='random'&&!bossController.active&&getWorld()?.managers?.level?.currentLevel?.label==='map_hub'&&rotate){
        const data=signal(getWorld()?.services?.player?.data);
        const choices=['fishing','mining','hunting'].filter(k=>!dailyRotation.exhausted.has(k)&&data?.activities_data?.[k]?.has_played&&!inventoryState?.[k]?.is_full);
        if(choices.length){const alternatives=choices.filter(k=>k!==mode);const pool=alternatives.length?alternatives:choices;mode=pool[Math.floor(Math.random()*pool.length)];rotate=false;modeStarted=Date.now();lastItemCount=null;clearNavigation();engine.reset();}
      }
      const currentLevel=getWorld()?.managers?.level?.currentLevel;
      const bossResultReady=currentLevel?.label!=='map_boss'||!!findResult(getWorld());
      const dailyData=signal(getWorld()?.services?.player?.data);const hadDailyLimits=dailyRotation.exhausted.size;dailyRotation.observe(dailyData?.quest_submissions_today);if(hadDailyLimits&&!dailyRotation.exhausted.size)dailyWaiting=false;
      const playerLevel=signal(getWorld()?.services?.player?.data)?.overall_level?.level??0;
      if(enabled&&requestedMode==='boss'&&!bossController.active&&bossController.returnMode&&bossResultReady){requestedMode=bossController.returnMode;mode=requestedMode;post('modeFallback',{mode,message:'Boss 挑戰結束，返回任務模式'});clearNavigation();engine.reset();}
      if(enabled&&!dailyWaiting&&requestedMode!=='boss'){
        if(bossController.active&&!settings.autoBoss)bossController.cancel();
        if(mode==='boss'&&!bossController.active&&bossResultReady){mode=bossController.returnMode??(requestedMode==='random'?'fishing':requestedMode);clearNavigation();engine.reset();}
        if(mode!=='boss'&&currentLevel?.label==='map_hub'&&!deliveryBatchMode&&bossController.enter(playerLevel,settings,mode)){mode='boss';clearNavigation();engine.reset();}
      }
      auditMining(currentLevel);auditDamage(currentLevel?.managers?.entity?.player);
      if(pendingTransition&&(pendingTransition.level!==currentLevel||pendingTransition.label!==currentLevel?.label))pendingTransition=null;
      if(requestedMode==='random'&&!bossController.active&&currentLevel&&currentLevel.label!=='map_hub'&&!currentLevel.managers?.[mode]){
        const actualMode=['fishing','mining','hunting'].find(k=>currentLevel.managers?.[k]);
        if(actualMode){mode=actualMode;rotate=false;modeStarted=Date.now();lastItemCount=null;clearNavigation();engine.reset();}
      }
      const s=snapshot();
      if(inventoryState){const bag=inventoryState[mode];s.itemCount=(bag?.items??[]).reduce((sum,item)=>sum+item.quantity,0);s.bagFull=!!bag?.is_full;
        const data=signal(getWorld()?.services?.player?.data),quest=questState?.[mode]?.quest??data?.activities_data?.[mode]?.next_quest;
        s.stock=globalThis.DVActivities.stockPolicy(mode,bag?.items,quest,settings.deliveryMultiplier);
        if(s.stock.ready)deliveryBatchMode=mode;
        const enoughForCurrent=!!(quest&&quest.quantity>0&&((bag?.items??[]).find(i=>i.name===quest.item)?.quantity??0)>=quest.quantity);
        if(deliveryBatchMode===mode&&!s.submissionOpen&&!enoughForCurrent)deliveryBatchMode=null;
        s.questReady=deliveryBatchMode===mode&&enoughForCurrent;
        s.canSubmit=s.canSubmit&&deliveryBatchMode===mode;
        s.ready=!!(game?.started&&getWorld()?.managers?.level?.currentLevel?.managers.entity.player&&data);
      }
      if(s.connected===false||!s.online){disconnectedAt??=Date.now();clearNavigation();}
      else if(disconnectedAt){clearNavigation();engine.reset();disconnectedAt=null;recoveryRequested=false;}
      if(enabled&&s.online&&!document.hidden&&disconnectedAt&&Date.now()-disconnectedAt>30000&&!recoveryRequested){recoveryRequested=true;post('recover',{reason:'遊戲連線未恢復'});}
      const now=Date.now();
      if(enabled&&dailyWaiting&&s.online&&s.connected!==false&&s.visible&&now-lastDailyRefresh>60000){lastDailyRefresh=now;getWorld()?.services?.player?.refreshAllUserData$?.subscribe({error:()=>{}});}
      if(enabled&&!s.ready&&s.visible&&s.online){unreadySince??=now;if(now-unreadySince>120000&&now-lastRecovery>60000){lastRecovery=now;post('recover',{reason:'等待遊戲狀態逾時'});}}else unreadySince=null;
      if(enabled&&mode==='fishing'&&s.ready&&s.visible&&s.online&&s.connected!==false&&s.atFishing&&!s.canPlay&&!s.slider?.visible&&!s.loading&&!s.otherDialog&&!s.submissionOpen&&!s.bagFull&&!s.masteryMax){
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
      if(enabled&&['mining','hunting','boss'].includes(mode)&&!(mode==='boss'&&(s.bossComplete||s.bossPhase==='fishing'||s.bossPending))&&s.ready&&s.visible&&s.online&&s.connected!==false&&!s.loading&&!s.otherDialog&&!s.inputFocused&&!s.resultOpen&&!s.slider?.visible){const player=currentLevel.managers.entity.player;const code=globalThis.DVNavigation.dodge(player,mode==='mining'?currentLevel.managers.mining?.mining?.dangers:globalThis.DVNavigation.combatDangers(currentLevel.managers.entity.entities),polygonList(currentLevel));if(code)action={type:'dodge',code,message:mode==='mining'?'避開落石警示與爆炸區':'避開戰鬥範圍攻擊與投射物'};}
      if(dailyWaiting)action={type:'wait',message:'所有已解鎖採集模式均遇到當日上限，等待計數重置'};
      if(action.type==='dailyLimit'||dailyWaiting)release();
      execute(action,s);errorCount=0;
      if(Date.now()-lastStatus>300){lastStatus=Date.now();const level=getWorld()?.managers?.level?.currentLevel,match=deliveryTarget(level),target=action.type==='navigateDelivery'?match?.entity:(level?.managers?.entity?.entities??[]).find(e=>targetKey(e)===pathTarget)??(mode==='fishing'?fishingAreas(level)[0]:globalThis.DVActivities.target(level,mode)),player=level?.managers?.entity?.player;post('status',{status:action.message,enabled,mode,map:s.map,level:s.level,diamonds:s.diamonds,itemCount:s.itemCount,stock:s.stock,bossState:{active:bossController.active,failures:bossController.failures,blocked:bossController.blocked},hooked:!!game,diagnostics:{action:action.type,mode,health:player?.getCurrentHealth?.(),audit:[...auditEvents],position:player?.body?feet(player):null,target:target?{name:target.name,id:target.id,body:target.body}:null,nextPoint:path?.[0],waypoints:path?.length??0,planning:!!routeSearch,observedStep,routeAxis,rotate,transition:pendingTransition?.action??null,npcMatch:match?{name:match.entity.name,method:match.method,score:match.score}:null,held:[...held],collided:player?.collidedObj?.name,contacts:[...(player?.collidedEntities?.arriving?.values?.()??[]),...(player?.collidedEntities?.staying?.values?.()??[])].map(e=>e.name??e.label),targetPolygon:interactionPolygon(target),submissionOpen:s.submissionOpen,canSubmit:s.canSubmit,submitting:s.submitting,questReady:s.questReady,stock:s.stock,deliveryBatch:deliveryBatchMode===mode,loading:s.loading}});}
    }catch(error){release();clearNavigation();hookError=`遊戲狀態暫時不相容：${error.message}`;if(enabled&&Date.now()>=retryAt){errorCount++;retryAt=Date.now()+3000;retryMessage=hookError;post('retry',{message:hookError,diagnostics:{error:error.message,stack:error.stack}});if(errorCount>=3&&Date.now()-lastRecovery>60000){lastRecovery=Date.now();post('recover',{reason:hookError});}}}

  },30);
})();
