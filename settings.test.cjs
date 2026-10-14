const assert=require('node:assert/strict');
require('./settings.js');require('./activities.js');
const {normalize,BossController}=DVSettings;
const settings=normalize({autoBoss:true,bossLevel:40,bossFailures:2,deliveryMultiplier:2.5});
assert.equal(settings.deliveryMultiplier,2.5);
assert.equal(normalize({bossFailures:-2,deliveryMultiplier:'bad'}).bossFailures,1);
assert.equal(normalize({deliveryMultiplier:'bad'}).deliveryMultiplier,4);
const controller=new BossController();
assert.equal(controller.enter(39,settings,'hunting'),false);
assert.equal(controller.enter(40,settings,'hunting'),true);
controller.result(false,40,settings);assert.equal(controller.active,true);
controller.result(false,40,settings);assert.equal(controller.active,false);assert.equal(controller.blocked,true);assert.equal(controller.returnMode,'hunting');
assert.equal(controller.enter(40,settings,'mining'),false);
controller.missionCompleted();assert.equal(controller.enter(40,settings,'mining'),true);
controller.result(true,40,settings);assert.equal(controller.enter(40,settings,'mining'),false);
assert.equal(controller.enter(41,settings,'mining'),true);
const items=['BLUE','RED','GREEN','YELLOW'].map(c=>({name:c+'_GEM',quantity:26}));
assert.equal(DVActivities.stockPolicy('mining',items,{quantity:10},2.5).ready,true);
items[0].quantity=25;assert.equal(DVActivities.stockPolicy('mining',items,{quantity:10},2.5).ready,false);
console.log('PASS: persisted setting validation, custom multiplier, boss level, consecutive failure return, task rearm and success cooldown');

const dr=new globalThis.DVSettings.DailyRotation();
const dailyData={activities_data:{fishing:{has_played:true},mining:{has_played:true},hunting:{has_played:true}}};
dr.observe(10);assert.equal(dr.choose('fishing',dailyData),'mining');
assert.equal(dr.choose('mining',dailyData),'hunting');
assert.equal(dr.choose('hunting',dailyData),null);
dr.observe(10);assert.equal(dr.exhausted.size,3);
dr.observe(0);assert.equal(dr.exhausted.size,0);
assert.equal(dr.choose('fishing',{activities_data:{mining:{has_played:false},hunting:{has_played:true}}}),'hunting');
console.log('PASS: daily rotation, exhausted mode exclusion, all-limited wait and server counter reset');

assert.equal(normalize({}).bossGuide,false);assert.equal(normalize({bossGuide:true}).bossGuide,true);

const restored=new BossController();restored.restore({failures:2,active:true,returnMode:'mining'});restored.result(false,77,{bossFailures:3});assert.equal(restored.blocked,true);assert.equal(restored.returnMode,'mining');const afterReload=new BossController();afterReload.restore(restored.progress());assert.equal(afterReload.blocked,true);assert.equal(afterReload.failures,3);assert.equal(afterReload.active,false);

const capWithFull=new DVSettings.DailyRotation();const unlockedAll={activities_data:{fishing:{has_played:true},mining:{has_played:true},hunting:{has_played:true}}};assert.equal(capWithFull.choose('mining',unlockedAll,{fishing:{is_full:true},hunting:{is_full:true}}),null,'daily-cap fallback must not select a full backpack');const otherRoom=new DVSettings.DailyRotation();assert.equal(otherRoom.choose('mining',unlockedAll,{fishing:{is_full:true},hunting:{is_full:false}}),'hunting','available activity still selected');

require('./activities.js');const fullReady=new DVSettings.DailyRotation();const d={activities_data:{fishing:{has_played:true,next_quest:{item:'RED_FISH',quantity:10}}}};const bag={fishing:{is_full:true,items:['BLUE','RED','GREEN','YELLOW'].map(c=>({name:c+'_FISH',quantity:46}))}};assert.equal(fullReady.choose('mining',d,bag,4.5),'fishing');console.log('PASS: full bag with sufficient delivery stock remains eligible');

assert.equal(normalize({bossFailures:99}).bossFailures,99);const many=new BossController();many.active=true;for(let i=0;i<98;i++)many.result(false,85,{bossFailures:99});assert.equal(many.active,true);many.result(false,85,{bossFailures:99});assert.equal(many.blocked,true);const savedMany=new BossController();savedMany.restore(many.progress());assert.equal(savedMany.failures,99);console.log('PASS: 99 failures boundary and persisted count');

assert.deepEqual(normalize({}).stockpileModes,['fishing','mining','hunting']);assert.deepEqual(normalize({stockpileModes:[]}).stockpileModes,[]);assert.deepEqual(normalize({stockpileModes:['mining','bogus','mining']}).stockpileModes,['mining']);const poolData={activities_data:{fishing:{has_played:true},mining:{has_played:true},hunting:{has_played:false}}},poolBag={fishing:{is_full:true},mining:{is_full:false},hunting:{is_full:false}};assert.deepEqual(DVSettings.stockpileChoices(normalize({}),poolData,poolBag),['mining']);assert.deepEqual(DVSettings.stockpileChoices(normalize({stockpileModes:['fishing']}),poolData,poolBag),[]);poolBag.mining.is_full=true;assert.deepEqual(DVSettings.stockpileChoices(normalize({}),poolData,poolBag),[]);console.log('PASS: default three collection modes, selection validation, full/unlocked filtering and all-full wait');
