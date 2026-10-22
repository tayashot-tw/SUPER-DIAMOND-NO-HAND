(() => {
  'use strict';
  function list(subQuests,userData){
    const rows=[];
    if(Array.isArray(subQuests))for(const q of subQuests){if(!q||typeof q.title!=='string')continue;rows.push({id:String(q.gamePart??q.slug??q.title),title:q.title,status:String(q.status??'待確認'),description:String(q.description??''),kind:'官方支線'});}
    const data=userData?.data??userData;
    if(data?.sign_in&&Number.isFinite(data.sign_in.days_progress)&&Number.isFinite(data.sign_in.days_target))rows.push({id:'daily-sign-in',title:'每日登入累積',status:`${data.sign_in.days_progress}／${data.sign_in.days_target} 天`,kind:'官方進度'});
    if(data?.game_part_statuses?.wisdom_well)rows.push({id:'wisdom-well',title:'智慧之井',status:String(data.game_part_statuses.wisdom_well.status??'待確認'),kind:'官方進度'});
    return rows;
  }
  const excluded=/boss|treasur|wisdom|sign.?in|refer|invite|team|survey|question|sponsor|festival|purchase|redeem|pass|payment/i;
  const id=q=>String(q?.gamePart??q?.slug??'');
  function matchNpc(q,entity){
    if(!q||!['todo','ongoing'].includes(q.status)||!id(q)||excluded.test(id(q)+' '+String(q.slug??'')))return false;
    if(!entity?.body||entity.destroyed||entity.enabled===false||entity.visible===false||entity.canInteract!==true||entity.isLocked?.())return false;
    const props=entity.properties?.get?.()??[];
    return props.some(p=>p.name==='game_part'&&p.value===q.gamePart&&!!q.gamePart||p.name==='quest_slug'&&p.value===q.slug&&!!q.slug||p.name==='cutscene'&&q.gamePart&&typeof p.value==='string'&&p.value.split('/').at(-1).replace(/\.json$/,'')===q.gamePart);
  }
  class Planner {
    constructor(){this.active=null;this.cooldowns=new Map();this.lastAction=0;}
    reset(){this.active=null;this.lastAction=0;}
    decide(s,quests,entities,now,contact){
      if(!s.enabled||!s.ready||!s.online||s.connected===false||!s.visible||s.inputFocused)return {type:'wait',message:'等待遊戲連線與畫面恢復'};
      if(!Array.isArray(quests))return {type:'wait',message:'等待官方支線任務資料'};
      if(!s.inHub)return {type:'wait',message:'請先返回城鎮，才能執行額外任務'};
      const current=this.active;
      if(current){
        const q=quests.find(q=>id(q)===current.id);
        if(q?.status==='complete'){this.cooldowns.set(current.id,now+60000);this.reset();return {type:'wait',message:'官方已確認支線完成，搜尋下一項'};}
        if(now-current.started>60000){this.cooldowns.set(current.id,now+60000);this.reset();return {type:'wait',message:'支線等待逾時，稍後重試'};}
        if(s.storyOpen){
          current.opened=true;
          if(!s.storyCanContinue)return {type:'wait',message:'任務對話需要選擇或確認，請手動處理'};
          if(now-this.lastAction<900)return {type:'wait',message:'等待任務對話更新'};
          this.lastAction=now;return {type:'advanceStory',message:'繼續一般支線任務對話'};
        }
        if(current.opened){if(now-this.lastAction<5000)return {type:'wait',message:'等待官方更新支線完成狀態'};this.cooldowns.set(current.id,now+60000);this.reset();return {type:'wait',message:'尚未確認完成，保留任務待後續處理'};}
        if(s.loading||s.otherDialog||s.submissionOpen||s.resultOpen)return {type:'wait',message:'等待目前介面關閉'};
        if(!entities.includes(current.npc)||!matchNpc(q,current.npc)){this.reset();return {type:'wait',message:'任務 NPC 狀態變更，重新搜尋'};}
        if(contact(current.npc)){if(now-this.lastAction<1000)return {type:'wait',message:'等待 NPC 回應'};this.lastAction=now;return {type:'interact',message:'與支線任務 NPC 互動'};}
        return {type:'navigateMission',target:current.npc,message:'前往支線 NPC：'+q.title};
      }
      if(s.storyOpen||s.loading||s.otherDialog||s.submissionOpen||s.resultOpen)return {type:'wait',message:'等待目前介面關閉後搜尋支線'};
      for(const q of quests){if((this.cooldowns.get(id(q))??0)>now)continue;const npc=entities.find(e=>matchNpc(q,e));if(npc){this.active={id:id(q),npc,started:now,opened:false};return {type:'navigateMission',target:npc,message:'前往支線 NPC：'+q.title};}}
      return {type:'wait',message:'目前沒有可明確對應的普通對話支線；其他任務請由官方清單確認'};
    }
  }
  globalThis.DVMissions={list,matchNpc,Planner};
})();
