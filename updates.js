(() => {
  const endpoint='https://raw.githubusercontent.com/tayashot-tw/SUPER-DIAMOND-NO-HAND/main/manifest.json';
  const download='https://github.com/tayashot-tw/SUPER-DIAMOND-NO-HAND/archive/refs/heads/main.zip';
  const interval=6*60*60*1000;
  function compare(a,b){const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<4;i++){const d=(x[i]??0)-(y[i]??0);if(d)return Math.sign(d);}return 0;}
  let pending=null;
  async function check(force=false){
    const stored=(await chrome.storage.local.get('dvUpdate')).dvUpdate;
    if(!force&&stored&&Date.now()-stored.checkedAt<interval)return stored;
    if(pending)return pending;
    pending=(async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
      try{
        const response=await fetch(endpoint,{cache:'no-store',credentials:'omit',signal:controller.signal});
        if(!response.ok)throw new Error('HTTP '+response.status);
        const manifest=await response.json(),version=manifest.version;
        if(typeof version!=='string'||!/^\d+(?:\.\d+){1,3}$/.test(version))throw new Error('Invalid version');
        const current=chrome.runtime.getManifest().version;
        const result={checkedAt:Date.now(),current,latest:version,available:compare(version,current)>0,download,error:false};
        await chrome.storage.local.set({dvUpdate:result});return result;
      }catch(error){
        const result={checkedAt:Date.now(),current:chrome.runtime.getManifest().version,error:true};
        await chrome.storage.local.set({dvUpdate:result});return result;
      }finally{clearTimeout(timer);}
    })();
    try{return await pending;}finally{pending=null;}
  }
  globalThis.DVUpdates={check,compare};
  if(chrome.alarms){
    chrome.alarms.create('dv-github-update',{periodInMinutes:360});
    chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='dv-github-update')check().catch(()=>{});});
  }
  chrome.runtime.onStartup?.addListener(()=>check().catch(()=>{}));
  chrome.runtime.onInstalled?.addListener(()=>check().catch(()=>{}));
})();
