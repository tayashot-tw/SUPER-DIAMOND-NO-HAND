const assert=require('node:assert/strict');
require('./activities.js');require('./exchange.js');require('./settings.js');
const rows=(blue=37,red=280,green=63,yellow=120)=>[['BLUE',blue],['RED',red],['GREEN',green],['YELLOW',yellow]].map(([c,quantity])=>({name:c+'_HERB',quantity}));
const quest={item:'BLUE_HERB',quantity:10};
const config=[{slug:'BLUE_HERB',success_item_cost:5}];
const plan=DVExchange.plan('hunting',rows(),quest,4.5,config);
assert.equal(plan.source,'RED_HERB');assert.equal(plan.reserve,46);assert.equal(plan.cost,5);assert.equal(plan.ready,true);
assert.equal(DVExchange.plan('hunting',rows(46),quest,4.5,config),null);
assert.equal(DVExchange.plan('hunting',rows(37,50,46,46),quest,4.5,config),null);
assert.equal(DVExchange.plan('hunting',rows(),{item:'UNKNOWN',quantity:10},4.5,config),null);
assert.equal(DVExchange.plan('hunting',rows(),{...quest,quantity:0},4.5,config),null);
assert.equal(DVExchange.plan('hunting',rows(),quest,4.5,[]).ready,false);
assert.equal(DVExchange.plan('hunting',rows(),quest,4.5,[{slug:'BLUE_HERB',success_item_cost:0}]).ready,false);
assert.equal(DVSettings.normalize({}).autoBalance,true);assert.equal(DVSettings.normalize({autoBalance:false}).autoBalance,false);
assert.equal(DVExchange.fingerprint(rows()),DVExchange.fingerprint(rows().reverse()));
// Exercise the runtime exchange controller with native-style dialog and inventory updates.
const fs=require('node:fs'),vm=require('node:vm'),main=fs.readFileSync(__dirname+'/main.js','utf8');
let now=10000,clicks=0;
const npc={body:{x:1,y:1,width:5,height:5},properties:{get:()=>[{value:'ui_exchange'}]}};
const data={activities_data:{hunting:{has_played:true,next_quest:quest}}};
const inventory={hunting:{items:rows(),is_full:true}};
const dialog={isOpen$:{value:true},itemExchangeConfig:config,selectedActivityTab$:{value:'hunting'},items:{hunting:rows()},tradeOutputIndex:0,tradeInputIndex$:{value:1},invalidExchangeSelected:false,processingExchange:false};
const level={managers:{entity:{entities:[npc],player:{body:{x:0,y:0,width:1,height:1}}}}};
const world={uiManager:{exchangeDialog:dialog},managers:{level:{currentLevel:level}},services:{player:{data}}};
const context={globalThis:null,DVExchange,DVActivities,enabled:true,requestedMode:'random',settings:{autoBalance:true,deliveryMultiplier:4.5},getWorld:()=>world,subject:s=>s?.value,signal:s=>s,inventoryState:inventory,dailyRotation:{exhausted:new Set()},bossController:{active:false},engine:{reset(){}},dailyWaiting:true,mode:'mining',rotate:false,deliveryBatchMode:null,available:()=>true,props:e=>e.properties.get(),center:e=>({x:e.body.x,y:e.body.y}),clearNavigation(){},hasContact:()=>true};context.globalThis=context;
vm.createContext(context);vm.runInContext(main.slice(main.indexOf('  let balanceSession='),main.indexOf('  function execute(action,s)'))+';globalThis.run=balanceAction;',context);
const state={ready:true,online:true,visible:true,inHub:true};
// Already-open user dialog is left alone.
assert.equal(context.run(state,now),null);
dialog.isOpen$.value=false;assert.equal(context.run(state,now).type,'openExchange');dialog.isOpen$.value=true;
assert.equal(context.run(state,now+600).type,'exchangeConfirm');
dialog.processingExchange=true;assert.equal(context.run(state,now+700).type,'exchangeWait');
// Unrelated inventory update must not authorize a second charge.
inventory.hunting.items[2].quantity++;dialog.processingExchange=false;assert.equal(context.run(state,now+800).type,'exchangeWait');
inventory.hunting.items[0].quantity=46;inventory.hunting.items[1].quantity-=5;
assert.equal(context.run(state,now+900).type,'closeExchange');assert.equal(context.dailyWaiting,false);assert.equal(context.mode,'hunting');
console.log('PASS: official cost, strict multiplier reserve, default setting, native dialog ownership, processing lock, confirmed source/target inventory changes');

