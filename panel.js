(() => {
  'use strict';
  const channel='diamond-valley-autoplay-v2';let enabled=false,mode='fishing',loaded=false,lastConfig=0,haltReason='',lastStart=0;
  let settings=globalThis.DVSettings.normalize({});
  const host=document.createElement('div');host.id='dv-autoplay-panel';
  const root=host.attachShadow({mode:'open'});
  root.innerHTML=`<style>:host{position:fixed;left:16px;bottom:16px;z-index:2147483647;font:14px system-ui;color:white}section{width:290px;padding:14px;border:1px solid #7696c6;border-radius:12px;background:#10233dee;box-shadow:0 4px 24px #0008}h3{margin:0 0 8px}p{font-size:12px;line-height:1.5;margin:8px 0}button{padding:9px 12px;border:0;border-radius:6px;background:#276fd3;color:white;cursor:pointer}button:disabled{opacity:.4}#stop{background:#a63248}#status{color:#a8d9ff;overflow-wrap:anywhere}</style><section><h3>自動遊玩：釣魚</h3><p id="status">等待遊戲連接</p><p id="stats"></p><p id="resources"></p><button id="start" disabled>開始自動遊玩</button> <button id="stop">停止（Esc）</button><p>自動判斷指針、尋路與交貨。請先完成釣魚教學，保持遊戲分頁可見。沒有錄製功能。</p><details><summary>自動遊玩設定</summary><p><label>交貨倍數 <input id="multiplier" type="number" min="1" max="100" step="0.5" value="4" style="width:60px"></label></p><p><label><input id="autoBoss" type="checkbox">達到等級自動打王</label></p><p><label>打王等級 <input id="bossLevel" type="number" min="1" max="999" value="40" style="width:60px"></label></p><p><label>連敗 <input id="bossFailures" type="number" min="1" max="20" value="3" style="width:50px"> 次後返回任務</label></p><p>連敗達上限後，完成一批交貨才再挑戰。成功後升級再挑戰。</p><p id="bossState"></p></details><details><summary>診斷與限制</summary><p>安裝後需重新整理，才能連接遊戲狀態。斷線時暫停；在線但遊戲斷線逾 30 秒時嘗試重新載入。路徑被阻擋或目標暫時消失時自動重試。達到遊戲限制時等待，保留啟用狀態。</p><p>2026 台灣版相容性版本。實際遊玩仍需測試；不會操作抽獎或兌換 Play Points。</p></details></section>`;
  document.documentElement.appendChild(host);
  const $=id=>root.getElementById(id);
  const broadcast=()=>{lastConfig=Date.now();window.postMessage({channel,source:'panel',type:'config',enabled,mode,settings},location.origin);};
  const invalidated=()=>{enabled=false;haltReason='擴充套件已更新，請重新整理遊戲頁';broadcast();update();$('status').textContent=haltReason;};
  const persist=()=>{try{chrome.storage.local.set({dvAutoplay:{enabled,mode,settings}}).catch(invalidated);}catch(error){invalidated();}};
  const settingsInputs=()=>{for(const [id,key] of [['multiplier','deliveryMultiplier'],['bossLevel','bossLevel'],['bossFailures','bossFailures']])$(id).value=String(settings[key]);$('autoBoss').checked=settings.autoBoss;};
  for(const id of ['multiplier','autoBoss','bossLevel','bossFailures'])$(id).onchange=()=>{settings=globalThis.DVSettings.normalize({deliveryMultiplier:$('multiplier').value,autoBoss:$('autoBoss').checked,bossLevel:$('bossLevel').value,bossFailures:$('bossFailures').value});settingsInputs();persist();broadcast();};
  const update=()=>{$('start').disabled=!loaded||enabled;};
  $('start').onclick=()=>{enabled=true;haltReason='';persist();broadcast();update();};
  $('stop').onclick=()=>{enabled=false;haltReason='已停止';persist();broadcast();update();$('status').textContent='已停止';};
  window.addEventListener('message',event=>{
    if(event.source!==window||event.origin!==location.origin||event.data?.channel!==channel||event.data.source!=='bot')return;
    const m=event.data;if(m.type==='modeFallback'){mode=m.mode;selector.value=mode;persist();broadcast();$('status').textContent=m.message;}if(m.bossState)$('bossState').textContent=`本次連敗 ${m.bossState.failures}／${settings.bossFailures} · ${m.bossState.blocked?'返回任務，等待完成交貨':m.bossState.active?'挑戰 Boss 中':'等待等級／城鎮條件'}`;
    if(m.type==='status'||m.type==='hook')$('status').textContent=!enabled&&haltReason?haltReason:m.status??m.message;
    if(m.type==='status'){$('stats').textContent=`等級 ${m.level??'—'} · 鑽石 ${m.diamonds??'—'} · 物品 ${m.itemCount??0} · ${m.map??'載入中'}`;const colors={BLUE:'藍',RED:'紅',GREEN:'綠',YELLOW:'黃'},kinds={FISH:'魚',GEM:'礦石',HERB:'藥草'};const resourceText=(m.stock?.rows??[]).map(r=>{const [color,kind]=r.name.split('_');return `${colors[color]??color}${kinds[kind]??kind} ${r.quantity}／>${r.threshold??'未知'}`;}).join(' · ');if($('resources'))$('resources').textContent=resourceText;host.setAttribute?.('data-diagnostics',JSON.stringify(m.diagnostics??{}));}
    if(m.type==='retry'){ $('status').textContent=m.message;if(m.diagnostics)host.setAttribute?.('data-retry-diagnostics',JSON.stringify(m.diagnostics));}
    if(m.type==='halt'){enabled=false;haltReason=m.message;if(m.diagnostics)host.setAttribute?.('data-halt-diagnostics',JSON.stringify(m.diagnostics));persist();broadcast();update();$('status').textContent=m.message;}
    if(m.type==='recover'&&enabled){try{chrome.runtime.sendMessage({type:'dv-autoplay-recover'}).catch(invalidated);}catch(error){invalidated();}}
  });
  const selector=document.createElement('select');selector.id='mode';selector.innerHTML='<option value="fishing">釣魚</option><option value="mining">挖礦（待實測）</option><option value="hunting">打怪（待實測）</option><option value="boss">Boss（開發測試）</option><option value="treasury">寶庫（開發測試）</option><option value="riddle">解謎（尚未完成）</option>';
  selector.innerHTML='<option value="random">隨機轮替：釣魚／挖礦／打怪</option>'+selector.innerHTML.replace('解謎（尚未完成）','解謎（官方停用）');
  const title=root.querySelector?.('h3');if(title)title.textContent='自動遊玩 0.4.0';
  root.querySelector?.('section')?.insertBefore(selector,$('status'));
  selector.onchange=()=>{mode=selector.value;haltReason=enabled?'持續自動遊玩，已切換模式':'已切換模式，請按開始';persist();broadcast();update();};
  chrome.storage.local.get('dvAutoplay').then(result=>{settings=globalThis.DVSettings.normalize(result.dvAutoplay?.settings);settingsInputs();enabled=result.dvAutoplay?.enabled===true;mode=result.dvAutoplay?.mode??'fishing';selector.value=mode;loaded=true;broadcast();update();}).catch(()=>{loaded=true;update();});
  setInterval(()=>{
    if(loaded&&Date.now()-lastConfig>2000)broadcast();
    if(!loaded||!enabled||document.hidden||!navigator.onLine||document.querySelector('canvas')||Date.now()-lastStart<5000)return;
    // Authenticated landing-page start button from the official GameComponent.
    const start=document.querySelector('dv-game button.play-cta');
    const text=start?.textContent?.replace(/[\u200B-\u200D\uFEFF\s]/g,'')??'';
    if(start&&!start.disabled&&start.getBoundingClientRect().width>0&&text==='立即展開冒險'){
      lastStart=Date.now();$('status').textContent='重新連線後自動啟動遊戲';start.click();
    }
  },2000);
})();
