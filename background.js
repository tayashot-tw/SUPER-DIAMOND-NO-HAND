chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message?.type!=='dv-autoplay-recover'||sender.frameId!==0||!sender.tab?.id||!sender.url?.startsWith('https://diamondvalley.withgoogle.com/intl/ALL_tw/game/'))return;
  (async()=>{
    const data=await chrome.storage.local.get(['dvAutoplay','dvRecovery']);
    if(!data.dvAutoplay?.enabled)return reply({reloaded:false});
    const now=Date.now(),recent=(data.dvRecovery??[]).filter(time=>now-time<3600000);
    if(recent.length>=5||recent.some(time=>now-time<60000))return reply({reloaded:false,reason:'backoff'});
    await chrome.storage.local.set({dvRecovery:[...recent,now]});
    await chrome.tabs.reload(sender.tab.id);reply({reloaded:true});
  })().catch(()=>reply({reloaded:false}));
  return true;
});
