(() => {
  'use strict';
  const aliases={fishing:['npc_fishing'],mining:['npc_mining'],hunting:['npc_combat','npc_hunting']};
  const normalize=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/[\s\u200B-\u200D\uFEFF_-]/g,'');
  function similarity(a,b){
    a=normalize(a);b=normalize(b);if(!a||!b)return 0;
    let row=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next;}
    return 1-row[b.length]/Math.max(a.length,b.length);
  }
  function delivery(entities,mode){
    const expected=aliases[mode];if(!expected)return null;
    const ranked=(entities??[]).filter(e=>e?.body&&!e.destroyed&&e.enabled!==false).map(entity=>{
      const values=[entity.name,entity.label].filter(Boolean);
      const exact=values.some(v=>expected.some(a=>normalize(v)===normalize(a)));
      // Restrict fuzzy matching to NPC identifiers, never portals or activity zones.
      const score=exact?1:Math.max(0,...values.filter(v=>normalize(v).startsWith('npc')).flatMap(v=>expected.map(a=>similarity(v,a))));
      return {entity,score,method:exact?'exact':'fuzzy'};
    }).filter(r=>r.score>=.85).sort((a,b)=>b.score-a.score);
    if(!ranked.length||ranked[1]&&ranked[0].score-ranked[1].score<.08)return null;
    return ranked[0];
  }
  function simplify(path){
    if(!path||path.length<3)return path;
    const result=[path[0]];
    for(let i=1;i<path.length-1;i++){
      const a=result.at(-1),b=path[i],c=path[i+1];
      const vertical=a.x===b.x&&b.x===c.x&&(b.y-a.y)*(c.y-b.y)>=0;
      const horizontal=a.y===b.y&&b.y===c.y&&(b.x-a.x)*(c.x-b.x)>=0;
      if(!vertical&&!horizontal)result.push(b);
    }
    result.push(path.at(-1));return result;
  }
  function direction(position,waypoint,previousAxis=null,tolerance=3){
    const dx=waypoint.x-position.x,dy=waypoint.y-position.y;
    if(Math.abs(dx)<=tolerance&&Math.abs(dy)<=tolerance)return {code:null,axis:null};
    let axis=previousAxis;
    if(axis==='x'&&Math.abs(dx)<=tolerance||axis==='y'&&Math.abs(dy)<=tolerance)axis=null;
    if(!axis)axis=Math.abs(dx)<=tolerance?'y':Math.abs(dy)<=tolerance?'x':Math.abs(dx)>Math.abs(dy)?'x':'y';
    return {axis,code:axis==='x'?(dx>0?'ArrowRight':'ArrowLeft'):(dy>0?'ArrowDown':'ArrowUp')};
  }
  function shouldReturnFishing(requestedMode,mode,rotate,s){
    return requestedMode==='random'&&mode==='fishing'&&rotate&&s.inFishing&&!s.inHub&&!s.fishingOpen&&!s.slider?.visible&&!s.loading&&!s.otherDialog&&s.visible&&s.online&&s.connected!==false&&!s.questReady;
  }
  function combatDirection(player,target,tolerance=12){
    if(!player?.body||!target?.body)return null;
    const b=player.body,t=target.body;
    const x=Number.isFinite(player.x)?player.x:b.x+b.width/2;
    const y=Number.isFinite(player.y)?player.y:b.y+b.height/2;
    const tx=t.x+t.width/2,ty=t.y+t.height/2,dx=tx-x,dy=ty-y;
    if(Math.abs(dy)>tolerance)return dy>0?'ArrowDown':'ArrowUp';
    const onRight=tx>=b.x+b.width/2;
    const gap=onRight?t.x-(b.x+b.width):b.x-(t.x+t.width);
    const toward=onRight?'ArrowRight':'ArrowLeft',away=onRight?'ArrowLeft':'ArrowRight';
    const facing=Number.isFinite(player.scale?.x)?(player.scale.x>0)===onRight:true;
    // The smallest native weapon is 96px wide over a 32px body. Leave room
    // for a movement frame while still overlapping the weapon's real hit box.
    const weapon=Object.values(player.weaponBodies??{}).find(w=>w?.width>0);
    const reach=Math.max(44,(weapon?.width??96)-b.width-12);
    if(gap<20||!facing&&gap<40)return away;
    if(gap>reach||!facing)return toward;
    return null;
  }
  function combatDangers(entities){
    return (entities??[]).filter(e=>e&&!e.destroyed&&e.enabled!==false).flatMap(e=>{
      const dangers=[];
      if(e.radialWeaponBody)dangers.push({body:e.radialWeaponBody,canCollide:true,name:e.name});
      if(e.isEnemy&&e.canCollide&&!e.isDead&&e.body){
        const b=e.body,projectile=/projectile|particle/.test(e.name??'');
        const dx=projectile?Math.max(-96,Math.min(96,(e.dx??0)*12)):0,dy=projectile?Math.max(-96,Math.min(96,(e.dy??0)*12)):0;
        dangers.push({body:{x:b.x+Math.min(0,dx),y:b.y+Math.min(0,dy),width:b.width+Math.abs(dx),height:b.height+Math.abs(dy)},canCollide:true,name:e.name});
      }
      return dangers;
    });
  }
  const escapePlans=new WeakMap();
  function dodge(player,dangers,polygons){
    const b=player?.body;if(!b)return null;
    const active=(dangers??[]).filter(e=>!e.destroyed&&e.body&&(e.canCollide||e.aoe?.parent)).map(e=>e.body);
    const overlap=(r,d)=>r.x<d.x+d.width+16&&r.x+r.width>d.x-16&&r.y<d.y+d.height+16&&r.y+r.height>d.y-16;
    if(!active.some(d=>overlap(b,d))){escapePlans.delete(player);return null;}
    const score=r=>active.reduce((sum,d)=>sum+(overlap(r,d)?-10000+10*Math.max(r.x-d.x-d.width,d.x-r.x-r.width,r.y-d.y-d.height,d.y-r.y-r.height):0)+Math.hypot(Math.max(d.x-r.x-r.width,0,r.x-d.x-d.width),Math.max(d.y-r.y-r.height,0,r.y-d.y-d.height)),0);
    const local=(polygons??[]).filter(p=>{
      const xs=p.map(v=>v.x),ys=p.map(v=>v.y);
      return Math.min(...xs)<b.x+b.width+200&&Math.max(...xs)>b.x-200&&Math.min(...ys)<b.y+b.height+200&&Math.max(...ys)>b.y-200;
    });
    const clear=(from,to)=>{const length=Math.max(Math.abs(to.x-from.x),Math.abs(to.y-from.y));
      for(let distance=0;distance<=length;distance+=4){const ratio=length?Math.min(1,(distance+4)/length):0;const foot={x:from.x+(to.x-from.x)*ratio,y:from.y+(to.y-from.y)*ratio+(b.height>=52?52:0),width:b.width,height:b.height>=52?b.height-52:b.height};if(local.some(p=>globalThis.DVAutoplay.polygonIntersectsRect(p,foot)))return false;}return true;
    };
    const previous=escapePlans.get(player);
    if(previous&&Date.now()<previous.expires){
      while(previous.points.length&&Math.abs(previous.points[0].x-b.x)<=12&&Math.abs(previous.points[0].y-b.y)<=12)previous.points.shift();
      if(previous.points.length&&clear(b,previous.points[0]))return direction(b,previous.points[0],null,12).code;
      escapePlans.delete(player);
    }
    const directions=[['ArrowRight',1,0],['ArrowLeft',-1,0],['ArrowDown',0,1],['ArrowUp',0,-1]],candidates=[];
    for(const [code,dx,dy] of directions)for(const distance of [8,16,32,64,96]){
      const moved={...b,x:b.x+dx*distance,y:b.y+dy*distance};
      if(clear(b,moved))candidates.push({code,points:[moved],score:score(moved),safe:!active.some(d=>overlap(moved,d))});
    }
    if(!candidates.some(c=>c.safe)){
      for(const first of [...candidates])for(const [code,dx,dy] of directions){
        if((first.code.includes('Left')||first.code.includes('Right'))===(dx!==0))continue;
        const corner=first.points[0],moved={...b,x:corner.x+dx*96,y:corner.y+dy*96};
        if(clear(corner,moved))candidates.push({code:first.code,points:[corner,moved],score:score(moved)-5,safe:!active.some(d=>overlap(moved,d))});
      }
    }
    candidates.sort((a,b)=>Number(b.safe)-Number(a.safe)||b.score-a.score);
    const best=candidates[0];
    if(!best||best.score<=score(b))return null;
    escapePlans.set(player,{points:best.points,expires:Date.now()+1800});return best.code;
  }
  globalThis.DVNavigation={delivery,similarity,simplify,direction,shouldReturnFishing,dodge,combatDirection,combatDangers};
})();
