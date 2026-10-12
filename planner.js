(() => {
  'use strict';
  function pointInPolygon(x,y,points) {
    let inside = false;
    for (let i=0,j=points.length-1;i<points.length;j=i++) {
      const a=points[i],b=points[j];
      if (((a.y>y)!==(b.y>y)) && x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x) inside=!inside;
    }
    return inside;
  }
  function polygonIntersectsRect(points,r) {
    const corners=[{x:r.x,y:r.y},{x:r.x+r.width,y:r.y},{x:r.x+r.width,y:r.y+r.height},{x:r.x,y:r.y+r.height}];
    if (corners.some(p=>pointInPolygon(p.x,p.y,points))) return true;
    if (points.some(p=>p.x>=r.x&&p.x<=r.x+r.width&&p.y>=r.y&&p.y<=r.y+r.height)) return true;
    const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    for(let i=0;i<points.length;i++) for(let j=0;j<4;j++) {
      const a=points[i],b=points[(i+1)%points.length],c=corners[j],d=corners[(j+1)%4];
      if (Math.max(a.x,b.x)<Math.min(c.x,d.x)||Math.max(c.x,d.x)<Math.min(a.x,b.x)||Math.max(a.y,b.y)<Math.min(c.y,d.y)||Math.max(c.y,d.y)<Math.min(a.y,b.y)) continue;
      if(cross(a,b,c)*cross(a,b,d)<=0 && cross(c,d,a)*cross(c,d,b)<=0) return true;
    }
    return false;
  }
  class MinHeap {
    constructor(){this.a=[];}
    before(a,b){return a.f<b.f||(a.f===b.f&&a.g>b.g);}
    push(item){let i=this.a.length;this.a.push(item);while(i){const p=(i-1)>>1;if(!this.before(item,this.a[p]))break;this.a[i]=this.a[p];i=p;}this.a[i]=item;}
    pop(){const root=this.a[0],tail=this.a.pop();if(this.a.length){let i=0;while(i*2+1<this.a.length){let c=i*2+1;if(c+1<this.a.length&&this.before(this.a[c+1],this.a[c]))c++;if(!this.before(this.a[c],tail))break;this.a[i]=this.a[c];i=c;}this.a[i]=tail;}return root;}
  }
  // Bounds and collision polygons come from the current map, never a recorded route.
  function findPath(start,goal,polygons,halfSize,cell=12,maxNodes=24000) {
    const all=polygons.flat();
    const xs=[start.x,goal.x,...all.map(p=>p.x)],ys=[start.y,goal.y,...all.map(p=>p.y)];
    const minX=Math.floor((Math.min(...xs)-64)/cell),maxX=Math.ceil((Math.max(...xs)+64)/cell);
    const minY=Math.floor((Math.min(...ys)-64)/cell),maxY=Math.ceil((Math.max(...ys)+64)/cell);
    const sx=Math.round(start.x/cell),sy=Math.round(start.y/cell),gx=Math.round(goal.x/cell),gy=Math.round(goal.y/cell);
    const key=(x,y)=>`${x},${y}`,startKey=key(sx,sy),goalKey=key(gx,gy);
    const boxes=polygons.map(points=>({points,minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y))}));
    const cache=new Map();
    const blocked=(x,y)=>{
      const k=key(x,y);if(k===startKey)return false;if(cache.has(k))return cache.get(k);
      const r={x:x*cell-halfSize.x,y:y*cell-halfSize.y,width:halfSize.x*2,height:halfSize.y*2};
      const hit=boxes.some(b=>!(r.x+r.width<b.minX||r.x>b.maxX||r.y+r.height<b.minY||r.y>b.maxY)&&polygonIntersectsRect(b.points,r));
      cache.set(k,hit);return hit;
    };
    if(blocked(gx,gy))return null;
    const open=new MinHeap(),cost=new Map([[startKey,0]]),parents=new Map();
    open.push({x:sx,y:sy,f:Math.abs(gx-sx)+Math.abs(gy-sy),g:0});
    let expanded=0;
    while(open.a.length&&expanded++<maxNodes){
      const n=open.pop(),k=key(n.x,n.y);if(n.g!==cost.get(k))continue;
      if(k===goalKey){const path=[goal];let p=k;while(p!==startKey){const [x,y]=p.split(',').map(Number);path.unshift({x:x*cell,y:y*cell});p=parents.get(p);}return path;}
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const x=n.x+dx,y=n.y+dy;if(x<minX||x>maxX||y<minY||y>maxY||blocked(x,y))continue;
        const next=key(x,y),g=n.g+1;if(g>=(cost.get(next)??Infinity))continue;
        cost.set(next,g);parents.set(next,k);open.push({x,y,g,f:g+Math.abs(gx-x)+Math.abs(gy-y)});
      }
    }
    return null;
  }
  // Resume bounded chunks between game frames instead of blocking on every approach point.
  function createPathSearch(start,goals,polygons,halfSize,cell=12,maxNodes=24000){
    const key=(x,y)=>`${x},${y}`,sx=Math.round(start.x/cell),sy=Math.round(start.y/cell),startKey=key(sx,sy);
    const boxes=polygons.map(points=>({points,minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y))}));
    const buckets=new Map(),bucketSize=96;
    for(const b of boxes)for(let x=Math.floor(b.minX/bucketSize);x<=Math.floor(b.maxX/bucketSize);x++)for(let y=Math.floor(b.minY/bucketSize);y<=Math.floor(b.maxY/bucketSize);y++){const k=key(x,y);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(b);}
    const cache=new Map();
    const blocked=(x,y)=>{
      const k=key(x,y);if(k===startKey)return false;if(cache.has(k))return cache.get(k);
      const r={x:x*cell-halfSize.x,y:y*cell-halfSize.y,width:halfSize.x*2,height:halfSize.y*2},seen=new Set();let hit=false;
      for(let bx=Math.floor(r.x/bucketSize);bx<=Math.floor((r.x+r.width)/bucketSize)&&!hit;bx++)for(let by=Math.floor(r.y/bucketSize);by<=Math.floor((r.y+r.height)/bucketSize)&&!hit;by++)for(const b of buckets.get(key(bx,by))??[]){if(seen.has(b))continue;seen.add(b);if(polygonIntersectsRect(b.points,r)){hit=true;break;}}
      cache.set(k,hit);return hit;
    };
    const targets=new Map();
    for(const goal of goals){const x=Math.round(goal.x/cell),y=Math.round(goal.y/cell);if(!blocked(x,y))targets.set(key(x,y),goal);}
    const tx=[...targets.values()].map(p=>Math.round(p.x/cell)),ty=[...targets.values()].map(p=>Math.round(p.y/cell));
    const left=Math.min(...tx),right=Math.max(...tx),top=Math.min(...ty),bottom=Math.max(...ty);
    const h=(x,y)=>Math.max(left-x,0,x-right)+Math.max(top-y,0,y-bottom);
    const minX=Math.floor((Math.min(start.x,...goals.map(p=>p.x),...boxes.map(b=>b.minX))-64)/cell),maxX=Math.ceil((Math.max(start.x,...goals.map(p=>p.x),...boxes.map(b=>b.maxX))+64)/cell);
    const minY=Math.floor((Math.min(start.y,...goals.map(p=>p.y),...boxes.map(b=>b.minY))-64)/cell),maxY=Math.ceil((Math.max(start.y,...goals.map(p=>p.y),...boxes.map(b=>b.maxY))+64)/cell);
    const open=new MinHeap(),cost=new Map([[startKey,0]]),parents=new Map();let expanded=0,done=!targets.size,result=null;
    if(!done)open.push({x:sx,y:sy,g:0,f:h(sx,sy)});
    return {step(limit=200,budgetMs=4){
      if(done)return {done,path:result,expanded};
      const begin=performance.now();let count=0;
      while(open.a.length&&expanded<maxNodes&&count++<limit&&performance.now()-begin<budgetMs){
        const n=open.pop(),k=key(n.x,n.y);if(n.g!==cost.get(k))continue;expanded++;
        if(targets.has(k)){result=[targets.get(k)];let p=k;while(p!==startKey){const [x,y]=p.split(',').map(Number);result.unshift({x:x*cell,y:y*cell});p=parents.get(p);}done=true;break;}
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=n.x+dx,y=n.y+dy;if(x<minX||x>maxX||y<minY||y>maxY||blocked(x,y))continue;const next=key(x,y),g=n.g+1;if(g>=(cost.get(next)??Infinity))continue;cost.set(next,g);parents.set(next,k);open.push({x,y,g,f:g+h(x,y)});}
      }
      if(!open.a.length||expanded>=maxNodes)done=true;
      return {done,path:result,expanded};
    }};
  }
  function fishingClick(slider) {
    if(!slider?.visible||slider.done||slider.cooldown>0)return false;
    const {indicator,left,width}=slider;
    if(![indicator,left,width].every(Number.isFinite)||width<=0)return false;
    const margin=Math.min(width*.12,12);
    return indicator>=left+margin&&indicator<=left+width-margin;
  }
  class Autoplayer {
    constructor(){this.reset();}
    reset(){this.connectedAt=null;this.lastAction=-Infinity;this.lastClick=-Infinity;this.lastProgress=null;this.signature=null;this.lastMap=null;}
    decide(s,now) {
      if(!s.enabled){this.reset();return {type:'wait',message:'已停止'};}
      if(!s.online||s.connected===false){this.connectedAt=null;return {type:'offline',message:'連線中斷，暫停操作'};}
      if(!s.ready)return {type:'wait',message:s.hookError||'等待遊戲載入及狀態連接'};
      if(!s.visible)return {type:'wait',message:'分頁在背景，等待回到遊戲'};
      if(this.connectedAt===null){this.connectedAt=now;this.lastMap=null;}
      if(now-this.connectedAt<5000)return {type:'wait',message:'連線恢復，重新讀取遊戲狀態'};
      const signature=JSON.stringify([s.map,s.level,s.experience,s.itemCount,s.questSubmissions,s.slider?.clicks]);
      if(signature!==this.signature){this.signature=signature;this.lastProgress=now;}
      if(s.loading)return {type:'wait',message:'等待地圖、伺服器或升級動畫'};
      if(s.inputFocused)return {type:'wait',message:'文字輸入中，暫停'};
      if(s.slider?.visible){
        if(fishingClick(s.slider)&&now-this.lastClick>=420){this.lastClick=now;return {type:'interact',message:'指針進入成功區，按下釣魚鍵'};}
        return {type:'wait',message:'釣魚中：監看指針與成功區'};
      }
      if(s.submissionOpen){
        if(s.dailyLimit)return {type:'dailyLimit',message:'目前模式今日交貨達上限，切換其他模式'};
        if(s.submitting)return {type:'wait',message:'等待交貨結果'};
        if(s.canSubmit&&now-this.lastAction>=1800){this.lastAction=now;return {type:'submit',message:'交貨取得經驗值'};}
        if(!s.canSubmit&&now-this.lastAction>=1800){this.lastAction=now;return {type:'closeSubmission',message:'交貨完成，返回釣魚'};}
        return {type:'wait',message:'等待交貨介面更新'};
      }
      if(s.vipWanted&&(s.atVipBoat||s.vipDialogue)&&s.storyOpen){
        if(s.storyCanContinue&&now-this.lastAction>=700){this.lastAction=now;return {type:'advanceStory',message:'繼續登船對話'};}
        return {type:'wait',message:'等待 VIP 登船對話'};
      }
      if(s.otherDialog)return {type:'wait',message:'等待其他介面關閉'};
      if(s.masteryMax&&!s.questReady)return {type:'halt',message:'釣魚熟練度已達上限；本版自動釣魚完成'};
      if(s.bagFull&&!s.questReady)return {type:'halt',message:'背包已滿但交貨物品不足，需處理背包後再開始'};
      if(now-this.lastAction<350)return {type:'wait',message:'等待前一步操作生效'};
      if(s.questReady||s.bagFull){
        if(!s.inHub){this.lastAction=now;return {type:'exitFishing',message:'物品足夠，返回城鎮交貨'};}
        if(s.atDelivery){this.lastAction=now;return {type:'interact',message:'與釣魚交貨 NPC 互動'};}
        return {type:'navigateDelivery',message:'依角色位置尋路到交貨 NPC'};
      }
      if(s.inHub){
        if(!s.fishingUnlocked)return {type:'halt',message:'請先完成釣魚教學、解鎖釣魚傳送點'};
        this.lastAction=now;return {type:'travelFishing',message:'使用已解鎖的釣魚傳送點'};
      }
      if(!s.inFishing)return {type:'halt',message:'本版支援城鎮與釣魚地圖，請先返回城鎮'};
      if(s.vipWanted&&s.vipBoatAvailable){
        if(s.atVipBoat){this.lastAction=now;return {type:'interact',message:'與船隻管理員互動，進入 VIP 釣魚區'};}
        return {type:'navigateVipFishing',message:'50 等已取得船票，前往 VIP 釣魚區'};
      }
      if(s.atFishing&&s.canPlay){this.lastAction=now;return {type:'interact',message:'在釣魚區開始下一次釣魚'};}
      if(s.atFishing)return {type:'wait',message:'等待釣魚結果與背包同步'};
      return {type:'navigateFishing',message:'依地圖碰撞資料尋路到釣魚區'};
    }
  }
  globalThis.DVAutoplay={Autoplayer,findPath,createPathSearch,fishingClick,pointInPolygon,polygonIntersectsRect};
})();
