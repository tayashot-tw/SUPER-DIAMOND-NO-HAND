(() => {
  const bounded=(value,fallback,min,max)=>Number.isFinite(Number(value))?Math.min(max,Math.max(min,Number(value))):fallback;
  const normalize=input=>({stockpileModes:Array.isArray(input?.stockpileModes)?['fishing','mining','hunting'].filter(m=>input.stockpileModes.includes(m)):['fishing','mining','hunting'],autoBalance:input?.autoBalance!==false,deliveryMultiplier:bounded(input?.deliveryMultiplier,4,1,100),autoBoss:input?.autoBoss===true,bossGuide:input?.bossGuide===true,bossLevel:Math.floor(bounded(input?.bossLevel,40,1,999)),bossFailures:Math.floor(bounded(input?.bossFailures,99,1,99))});
  class DailyRotation {
    constructor(){this.exhausted=new Set();this.lastCount=null;}
    observe(count){if(!Number.isFinite(count))return;if(this.lastCount!==null&&count<this.lastCount)this.exhausted.clear();this.lastCount=count;}
    choose(current,data,inventory={},multiplier=4){this.exhausted.add(current);return ['fishing','mining','hunting'].find(m=>m!==current&&!this.exhausted.has(m)&&data?.activities_data?.[m]?.has_played&&(!inventory?.[m]?.is_full||globalThis.DVActivities?.stockPolicy(m,inventory[m].items,data.activities_data[m].next_quest,multiplier).ready))??null;}
  }
  class BossController {
    constructor(){this.failures=0;this.blocked=false;this.completedLevel=null;this.active=false;this.returnMode=null;}
    restore(state){if(!state||typeof state!=='object')return;this.failures=Math.min(99,Math.max(0,Math.floor(Number(state.failures)||0)));this.blocked=state.blocked===true;this.active=state.active===true&&!this.blocked;this.completedLevel=Number.isFinite(state.completedLevel)?state.completedLevel:null;this.returnMode=['fishing','mining','hunting','random'].includes(state.returnMode)?state.returnMode:'fishing';}
    progress(){return {failures:this.failures,blocked:this.blocked,active:this.active,completedLevel:this.completedLevel,returnMode:this.returnMode};}
    enter(level,settings,mode){if(!settings.autoBoss||mode==='boss'||this.active||this.blocked||level<settings.bossLevel||this.completedLevel!==null&&level<=this.completedLevel)return false;this.active=true;this.returnMode=mode;return true;}
    result(success,level,settings){if(!this.active)return;if(success){this.completedLevel=level;this.failures=0;this.active=false;}else if(++this.failures>=settings.bossFailures){this.active=false;this.blocked=true;}}
    missionCompleted(){if(this.blocked){this.blocked=false;this.failures=0;}}
    cancel(){this.active=false;this.returnMode=null;}
  }
  const stockpileChoices=(settings,data,inventory)=>settings.stockpileModes.filter(m=>data?.activities_data?.[m]?.has_played&&inventory?.[m]&&!inventory[m].is_full);
  globalThis.DVSettings={stockpileChoices,normalize,BossController,DailyRotation};
})();
