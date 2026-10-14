(() => {
  'use strict';
  function plan(mode,items,quest,multiplier,config){
    const stock=globalThis.DVActivities.stockPolicy(mode,items,quest,multiplier),target=stock.rows.find(r=>r.name===quest?.item);
    if(!target||stock.required===null||target.quantity>target.threshold)return null;
    const reserve=Math.floor(target.threshold)+1;
    const donors=stock.rows.filter(r=>r.name!==target.name&&r.quantity>reserve).sort((a,b)=>b.quantity-a.quantity);
    if(!donors.length)return null;
    const cost=Number(config?.find(c=>c.slug===target.name)?.success_item_cost);
    const source=Number.isFinite(cost)&&cost>0?donors.find(r=>r.quantity-cost>=reserve):donors[0];
    if(!source)return null;
    return {mode,target:target.name,source:source.name,reserve,cost,ready:Number.isFinite(cost)&&cost>0};
  }
  const fingerprint=items=>JSON.stringify((items??[]).map(i=>[i.name,i.quantity]).sort((a,b)=>a[0].localeCompare(b[0])));
  globalThis.DVExchange={plan,fingerprint};
})();
