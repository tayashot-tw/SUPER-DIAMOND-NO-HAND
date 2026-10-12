(() => {
  const bounded=(value,fallback,min,max)=>Number.isFinite(Number(value))?Math.min(max,Math.max(min,Number(value))):fallback;
  const normalize=input=>({deliveryMultiplier:bounded(input?.deliveryMultiplier,4,1,100),autoBoss:input?.autoBoss===true,bossLevel:Math.floor(bounded(input?.bossLevel,40,1,999)),bossFailures:Math.floor(bounded(input?.bossFailures,3,1,20))});
  class BossController {
    constructor(){this.failures=0;this.blocked=false;this.completedLevel=null;this.active=false;this.returnMode=null;}
    enter(level,settings,mode){if(!settings.autoBoss||mode==='boss'||this.active||this.blocked||level<settings.bossLevel||this.completedLevel!==null&&level<=this.completedLevel)return false;this.active=true;this.returnMode=mode;return true;}
    result(success,level,settings){if(!this.active)return;if(success){this.completedLevel=level;this.failures=0;this.active=false;}else if(++this.failures>=settings.bossFailures){this.active=false;this.blocked=true;}}
    missionCompleted(){if(this.blocked){this.blocked=false;this.failures=0;}}
    cancel(){this.active=false;this.returnMode=null;}
  }
  globalThis.DVSettings={normalize,BossController};
})();
