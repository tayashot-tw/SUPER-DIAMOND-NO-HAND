(() => {
  const names={fishing:'釣魚',mining:'挖礦',hunting:'打怪',boss:'Boss',treasury:'寶庫',riddle:'解謎'};
  const center=e=>e?.body&&({x:e.body.x+e.body.width/2,y:e.body.y+e.body.height/2});
  const near=(p,entities)=>entities.filter(e=>center(e)).sort((a,b)=>Math.hypot(center(a).x-p.x,center(a).y-p.y)-Math.hypot(center(b).x-p.x,center(b).y-p.y))[0];
  const active=e=>!!e&&!e.destroyed&&e.enabled!==false&&e.canInteract===true&&!e.isLocked?.();
  function target(level,mode,usable=()=>true,preferred=null) {
    if(!level?.managers?.entity?.player)return null;
    const manager=level.managers[mode],player=level.managers.entity.player,p=center(player),entities=level.managers.entity.entities;
    if(!p)return null;
    const choose=list=>list.find(e=>preferred!==null&&(e.uid??e.id??e.name)===preferred)??near(p,list);
    if(mode==='mining'){
      const mining=manager?.mining;
      const carts=[mining?.cart,...(mining?.hvuCarts??[])].filter(e=>active(e)&&usable(e));
      const veins=(mining?.veins??[]).filter(e=>active(e)&&usable(e));
      const hasActiveCart=[mining?.cart,...(mining?.hvuCarts??[])].some(active);
      if(hasActiveCart)return choose(carts);
      return choose(veins.length?veins:entities.filter(e=>active(e)&&e.label==='portal_to_mine_play'));
    }
    if(mode==='hunting'){
      if(player.inBattle)return near(p,(manager?.hunting?.battleMonsters??[]).filter(e=>!e.destroyed&&!e.isDead&&e.enabled!==false));
      return near(p,entities.filter(e=>active(e)&&e.label==='portal_to_monster_play'));
    }
    if(mode==='boss'&&level.label==='map_hub')return near(p,entities.filter(e=>e&&!e.destroyed&&e.enabled!==false&&!e.isLocked?.()&&usable(e)&&(e.getNextLevel?.()==='map_boss'||(e.properties?.get?.()??[]).some(prop=>prop.name==='teleport_map'&&String(prop.value).trim().replace(/\.json$/,'')==='map_boss'))));
    if(mode==='boss'){const boss=manager?.boss?.boss;return boss&&!boss.destroyed&&!boss.isDead&&boss.enabled!==false?boss:null;}
    if(mode==='treasury'){
      const treasures=entities.filter(e=>active(e)&&usable(e)&&e.status==='success');
      if(treasures.length)return choose(treasures);
      if(level.getWorldData?.()?.services?.treasury?.isActiveValue)return null;
      return near(p,entities.filter(e=>active(e)&&(e.properties?.get?.()??[]).some(prop=>prop.name==='cutscene'&&String(prop.value).includes('treasury_room'))));
    }
    return null;
  }
  function bossResultAction(result,controller){
    if(!result||result.isCtaClicked)return 'wait';
    if(result.result===true||result.firstWin||!controller.active)return 'return';
    return 'retry';
  }
  function vipFishing(level,services,data,usable=()=>true){
    const entities=level?.managers?.entity?.entities??[],player=level?.managers?.entity?.player;
    const eligible=Number(data?.overall_level?.level)>=50;
    const hasPass=services?.player?.bpFishingPass?.()===true||data?.bp_fishing_pass===true;
    const inside=services?.tiledState?.getAll?.()?.includes('in_hvu_fishing_area')===true;
    const boat=eligible&&player?.body?near(center(player),entities.filter(e=>active(e)&&usable(e)&&(e.label==='npc_hvu_boat'||e.name==='npc_hvu_boat'||String(e.name??'').startsWith('npc_hvu_boat_')))):null;
    return {eligible,hasPass,inside,boat};
  }
  function stockPolicy(mode,items,quest,multiplier=4){
    const suffix={fishing:'FISH',mining:'GEM',hunting:'HERB'}[mode];
    const quantity=Number(quest?.quantity),required=Number.isFinite(quantity)&&quantity>0?quantity:null;
    const rows=suffix?['BLUE','RED','GREEN','YELLOW'].map(color=>{
      const name=color+'_'+suffix,quantity=(items??[]).filter(i=>i.name===name).reduce((sum,i)=>sum+Math.max(0,Number(i.quantity)||0),0);
      return {name,quantity,threshold:required===null?null:required*multiplier};
    }):[];
    return {rows,required,ready:rows.length===4&&required!==null&&rows.every(r=>r.quantity>r.threshold)};
  }
  class ActivityPlanner {
    constructor(){this.lastAction=-Infinity;}
    decide(s,now){
      if(!s.enabled||!s.ready||!s.online||s.connected===false||!s.visible||s.inputFocused)return null;
      if(s.mode==='fishing'||s.slider?.visible)return null;
      if(s.mode==='riddle')return {type:'halt',message:'目前台灣版官方設定停用解謎（riddle.enabled=false）'};
      if(['boss','treasury'].includes(s.mode)&&s.storyOpen){
        if(now-this.lastAction<700)return {type:'wait',message:'等待對話更新'};
        if(s.storyCanContinue){this.lastAction=now;return {type:'advanceStory',message:'繼續目前遊戲劇情'};}
        if(s.mode==='boss'&&s.bossStartButton){this.lastAction=now;return {type:'startBoss',message:'開始 Boss 挑戰'};}
        if(s.treasuryStartButton){this.lastAction=now;return {type:'startTreasury',message:'開始寶庫挑戰'};}
        return {type:'wait',message:'對話需要確認選項，暫停自動操作'};
      }
      if(s.resultOpen){if(now-this.lastAction<1800)return {type:'wait',message:'等待結果畫面'};this.lastAction=now;return {type:'activityResult',message:'關閉本輪結果，準備下一輪'};}
      if(s.loading||s.otherDialog)return null;
      if(s.mode==='boss'&&s.slider?.visible)return null;
      if(s.questReady||s.bagFull||s.masteryMax)return null;
      if(s.inHub&&s.mode==='boss')return {type:s.targetCollided?'interact':'navigateActivity',message:'前往已解鎖的 Boss 入口'};
      if(s.inHub&&['mining','hunting'].includes(s.mode)){
        if(!s.activityUnlocked)return {type:'halt',message:`請先完成${names[s.mode]}教學，再啟動自動遊玩`};
        if(now-this.lastAction<1800)return {type:'wait',message:'等待傳送'};
        this.lastAction=now;return {type:'travelActivity',message:`前往${names[s.mode]}區`};
      }
      if(!s.inActivity)return {type:'halt',message:`請先進入${names[s.mode]}地圖；此模式不會穿越未解鎖區域`};
      if(s.mode==='hunting'&&s.inBattle)return {type:'combat',message:'追蹤史萊姆，保持攻擊距離'};
      if(s.mode==='boss'&&(s.bossComplete||s.bossPhase==='fishing'||s.bossPending))return {type:'wait',message:'等待 Boss 階段／結果同步'};
      if(s.mode==='boss'&&!s.inBattle)return {type:'wait',message:'等待 Boss 戰鬥／釣魚階段切換'};
      if(s.mode==='boss')return {type:'combat',message:'接近 Boss 並由遊戲自動攻擊；釣魚階段自動判斷指針'};
      if(s.mode==='treasury'&&!s.treasuryActive)return {type:s.targetCollided?'interact':'navigateActivity',message:'前往寶庫挑戰說明 NPC'};
      if(s.targetCollided){if(now-this.lastAction<650)return {type:'wait',message:'等待採集／交互結果'};this.lastAction=now;return {type:'interact',message:'操作目前採集點'};}
      return {type:'navigateActivity',message:`尋路至${names[s.mode]}目標`};
    }
  }
  globalThis.DVActivities={ActivityPlanner,target,names,stockPolicy,vipFishing,bossResultAction};
})();
