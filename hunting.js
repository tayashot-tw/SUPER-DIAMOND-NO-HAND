(() => {
  'use strict';
  const active=e=>!!e?.body&&!e.destroyed&&!e.isDead&&e.enabled!==false;
  const yellow=e=>active(e)&&String(e.name??'').startsWith('monster_yellow_projectile_');
  const center=e=>({x:e.body.x+e.body.width/2,y:e.body.y+e.body.height/2});
  function incoming(player,shot){
    if(!active(player)||!yellow(shot))return null;
    const p=center(player),q=center(shot),dx=Number(shot.dx),dy=Number(shot.dy),speed=dx*dx+dy*dy;
    if(!Number.isFinite(speed)||speed<0.001)return null;
    const t=((p.x-q.x)*dx+(p.y-q.y)*dy)/speed;if(t<0||t>24)return null;
    const x=q.x+dx*t,y=q.y+dy*t;
    if(Math.abs(x-p.x)>(player.body.width+shot.body.width)/2+16||Math.abs(y-p.y)>(player.body.height+shot.body.height)/2+16)return null;
    return {shot,t,dx,dy};
  }
  function inferSource(shot,monsters){
    const q=center(shot),dx=Number(shot.dx),dy=Number(shot.dy),speed=Math.hypot(dx,dy);if(!Number.isFinite(speed)||speed<0.001)return null;
    const candidates=monsters.filter(m=>active(m)&&/yellow/i.test(String(m.monsterData?.monsterType??m.name??''))).map(m=>{const c=center(m),x=q.x-c.x,y=q.y-c.y,back=(x*dx+y*dy)/speed,side=Math.abs(x*dy-y*dx)/speed;return {m,back,side};}).filter(c=>c.back>=0&&c.back<1200&&c.side<24).sort((a,b)=>a.side-b.side||a.back-b.back);
    if(!candidates.length||candidates.length>1&&Math.abs(candidates[0].side-candidates[1].side)<8)return null;
    return candidates[0].m;
  }
  class Tracker {
    constructor(){this.owners=new WeakMap();this.hooked=new WeakSet();this.level=null;this.target=null;this.until=0;this.threat=null;}
    update(level,now){
      if(this.level!==level){this.level=level;this.target=null;this.until=0;}
      this.threat=null;const manager=level?.managers?.hunting?.hunting,entities=level?.managers?.entity?.entities??[],monsters=manager?.battleMonsters??[],player=level?.managers?.entity?.player;
      for(const m of monsters){if(this.hooked.has(m)||typeof m.projectileWeaponShoot!=='function')continue;this.hooked.add(m);const original=m.projectileWeaponShoot,owners=this.owners;m.projectileWeaponShoot=function(...args){const before=new Set(level.managers.entity.entities??[]);const result=original.apply(this,args);for(const e of level.managers.entity.entities??[])if(!before.has(e)&&yellow(e))owners.set(e,this);return result;};}
      const threats=entities.filter(yellow).map(e=>incoming(player,e)).filter(Boolean).sort((a,b)=>a.t-b.t);this.threat=threats[0]??null;
      if(this.threat){const source=this.owners.get(this.threat.shot)??inferSource(this.threat.shot,monsters);if(active(source)&&monsters.includes(source)){this.target=source;this.until=now+3000;}}
      if(!active(this.target)||!monsters.includes(this.target)||now>this.until)this.target=null;
      return this;
    }
    evade(player,polygons,dangers){
      if(!this.threat||!player?.body)return null;
      const t=this.threat,b=player.body,p={x:b.x+b.width/2,y:b.y+(b.height>=52?52:0)+(b.height>=52?b.height-52:b.height)/2,halfX:b.width/2,halfY:(b.height>=52?b.height-52:b.height)/2};
      // A lateral first step avoids charging head-on into the incoming projectile.
      const dirs=Math.abs(t.dx)>=Math.abs(t.dy)?[['ArrowUp',0,-1],['ArrowDown',0,1]]:[['ArrowLeft',-1,0],['ArrowRight',1,0]];
      const source=this.target?center(this.target):null;
      const safe=dirs.map(([code,dx,dy])=>{const end={x:p.x+dx*64,y:p.y+dy*64},body={x:b.x+dx*64,y:b.y+dy*64,width:b.width,height:b.height};const danger=(dangers??[]).some(d=>d.body&&body.x<d.body.x+d.body.width+8&&body.x+body.width>d.body.x-8&&body.y<d.body.y+d.body.height+8&&body.y+body.height>d.body.y-8);return {code,end,danger,clear:globalThis.DVNavigation.routeSegmentClear(p,end,polygons),distance:source?Math.hypot(body.x+b.width/2-source.x,body.y+b.height/2-source.y):0};}).filter(c=>c.clear&&!c.danger).sort((a,b)=>a.distance-b.distance);
      return safe[0]?.code??null;
    }
  }
  globalThis.DVHunting={Tracker,incoming,inferSource};
})();
