# 開發接手文件：給 ChatGPT／Codex

## 接手提示（可直接貼給下一位助手）

請閱讀這份 DEVELOPMENT.md、README.md，以及 repository 根目錄的 JavaScript。這是 SUPER DIAMOND NO HAND 0.4.0，使用者要的是依即時遊戲狀態自動遊玩，不是錄製路線。使用者偏好繁體中文，期望直到按停止或 Esc 才停止；斷線、卡住、目標消失要等待或重試。先確認當前程式與實際載入版本，重現問題，再修正與驗證。不要宣稱 mock 測試通過就等於實機成功。不要增加規避官方偵測、直接修改獎勵或跳過伺服器驗證的功能。不要公開登入資料或上傳官方遊戲下載快取。

使用者需求：釣魚、採礦、打怪、Boss、寶庫；台灣版解謎官方停用。四種物資都嚴格大於「下一個任務 quantity × 使用者倍數」才觸發交貨；觸發後連續交可完成任務直到不足。可設定整體角色等級達標打王，連败上限後返回先前任務模式，完成交貨批次後才再挑戰。公開專案需標示 ChatGPT 開發及使用風險自行承擔，包括但不限於被官方停權或查封。

請保留正常 Stop／Esc、模式切換、儲存、離線等待與重連能力。新版本需同步面板和 manifest，執行四組測試與 build.py，更新使用说明與變更记录。請以實機事件 complete(true)、背包增加、交貨後鑽石增加證明成功。僅看到角色移動或攻擊動畫不代表成功。

## 專案來源與目前基線

遊戲：https://diamondvalley.withgoogle.com/intl/ALL_tw/game/
儲存庫：https://github.com/tayashot-tw/SUPER-DIAMOND-NO-HAND
版本：0.4.0（前版 0.3.17）。Edge 與 Chrome 共用程式，build.py 只調整名稱並產出不同 ZIP。

遊戲模組版本寫死在 main.js 的 VERSION：game-6NMIDNT2.js。若官方改 hash，先從官方頁面確認新入口，再檢查 Game export 與服務結構；不可假設改 VERSION 就完全相容。開發時曾下載官方公開模組供閱讀，但那些快取不在本儲存庫。

## 檔案與執行環境

- settings.js：DVSettings.normalize、BossController。MAIN 與 isolated 面板世界都載入，兩邊各有獨立 global。
- planner.js：DVAutoplay.Autoplayer，釣魚指針時機、交貨決策、A*、多邊形碰撞。
- activities.js：DVActivities.ActivityPlanner／target／stockPolicy，採礦階段、打怪、Boss、寶庫。
- navigation.js：DVNavigation，NPC 名稱比對、路線壓縮、方向穩定、戰鬥站位、危險區、牆角逃離。
- main.js：MAIN world，動態 import 官方 Game 模組，包裝 Game.init 以取得 instance，使用原生遊戲服務、碰撞與互動，主控制 interval 30ms。
- panel.js：isolated world，Shadow DOM 面板，chrome.storage.local 保存 enabled／mode／settings，使用 window.postMessage 交換狀態。
- background.js：斷線恢復與 reload 頻率限制。
- manifest.json：Manifest V3，只請求 storage，限定官方台灣遊戲網址。
- build.py：產生 dist/ 的 Edge／Chrome ZIP；測試檔不進 ZIP。

通訊 channel 是 diamond-valley-autoplay-v2，origin、source window 與 source 字段皆檢查；這不是加密或對同頁其他脚本的安全邊界。

## 遊戲原生狀態與互動規則

Game.instance.world.managers.level.currentLevel，level.managers.entity.player 與 entities 是核心。inventory.items$ 提供 fishing/mining/hunting 各 items [{name,quantity}]、is_full。player.data() 提供 overall_level、activities_data[k].next_quest。quest.activityQuests$ 的形狀可能因使用服務不同而不同，當前程式支援 .quest 並 fallback 到 player.data。auth.userData$.value.data.total_diamonds 是面板鑽石來源。

物資枚舉是 BLUE/RED/GREEN/YELLOW + _FISH／_GEM／_HERB。不要只看總量；缺少種類視為零。遊戲只提供下一個任務需求，當前四種類共用該 quantity，並非已知四個未來任務各自不同的數量。

正常玩家 body 約 width32／height64。走路牆壁碰撞只用 body.y+52 後的 12px 足部；NPC／礦脈互動用完整 body。Native player.x/y 依 data 尺寸与 collider offset 計算，**不要以 body center 取代武器攻擊 anchor**。

原生 interact 使用 player.collidedObj（只有最後一個碰撞對象），不是接受任意 target。collidedEntities.arriving/staying 是遊戲實際碰撞記錄。不得改寫 collidedObj、角色位置、HP、鑽石、XP 或直接呼叫獎勵 API。

採礦原生 manager：start、playerActivateVein(name)、playerReachedSafezone(type)、complete(boolean)、die。採集後服務返回才啟用礦車，交付後才啟用礦脈。目標選擇必須按 active/canInteract 判定階段，不能用背包總礦石數判斷是否搬運。

目前 guarded miningInteraction 只有原生 arriving/staying 確認接觸、目標可互動、玩家未鎖定時，才執行該礦脈／礦車原生 handleInteraction；有 650ms 冷卻。原因是出生傳送區可能覆蓋 collidedObj，使 Enter 操作錯誤對象。

戰鬥依原生 autoAttack，自動攻擊會檢查武器、距離、朝向與 rate。普通怪物來源是 hunting.hunting.battleMonsters，排除死亡、銷毀、停用。最小武器方向 hit box 寬96；按玩家 body 與敵人 body 保持間隔，不要站在敵人身上。radialWeaponBody 代表範圍警示／傷害區，投射物 dx/dy 可用於預判。

Boss 有 fighting／fishing 階段，原生 manager.success/fail 用於最終結果。非 inBattle 階段不要追逐 Boss；滑桿交由釣魚時機 engine。自動進場尋找城鎮內原生可互動、property value 開頭是 map_boss 的入口；這條規則**未實機驗證**，若找不到先記錄入口物件 properties，不要直接繞過解鎖把玩家传送到 Boss。

寶庫 collect-tier status success 才是目標，canInteract=false 通常代表已取得。挑戰中沒有可達目標時不可返回說明 NPC。劇情只繼續已知可繼續對話，不替使用者選抽獎或兌換。

## 尋路與避讓

尋路採多目標、分影格 A*：每次最多200節點或約4ms，下一次接續，避免同步尋遍多個目標卡 UI。collisionMap 幾何快取；多邊形互動使用真實 shape.points，不能只靠外接矩形。

接近點保留完整身體重疊，考慮±9px 路點容差；observedStep 反映每控制週期位移。直線路點壓縮但保留轉角，單軸移動穩定，接近路點短按鍵減少過衝。傳送用同 level／label 的 10 秒鎖，不要每個 tick 重複 changeLevel。

避讓危險包含採礦落石 aoe.parent／canCollide、全部可碰撞活敵人的 body、radialWeaponBody、投射物掃掠區。0.3.15 起投射物預測 dx/dy×12（每軸±96px）。主計分以危險區重疊懲罰與距離決定方向。

0.3.16 起牆角改試8／16／32／64／96px短路段；不能直線脫離時嘗試兩段L形，WeakMap 保存逃離路點最多1.8秒。每次確認足部路径無牆。深色樹叢／淺色草地只用於人眼觀察，未實作像素顏色辨識。

已知限制：逃離路點容差12px與實際步長可能影響窄轉角；移動危險區可能讓保留路線過時；每個危險区使用矩形近似。未來應加入路線途中危險评分和安全空間選擇，避免安全距離與追逐策略互相拉扯。不要只增加步長或隨機走路掩蓋問題。

## 0.4.0 設定與 Boss 控制

settings.normalize：deliveryMultiplier 預設4、1～100；autoBoss 預設false；bossLevel 預設40、1～999整數；bossFailures 預設3、1～20整數。

BossController 的 active／returnMode／failures／blocked／completedLevel 控制挑戰週期。進場只在城鎮、達角色等級、未有交貨批次，且非 blocked／同等級已成功。失败達上限返回任務；交貨批次 closeSubmission 解除 blocked。成功後下一角色等級才再次挑战。手動 Boss 結束透過 modeFallback 通知面板，避免面板每2秒 config 把 fallback 模式覆蓋回 Boss。

設定保存，本頁 Boss 計數未跨重新整理保存。更新 autoBoss=false 會取消自動挑戰。切換模式取消舊控制器狀態。

交貨使用 deliveryBatchMode latch：門檻觸發後直到不能交貨才结束。單次交貨減少物資不應把批次中途停掉。未達門檻即使 dialog submit 可用也不提交。改倍數主要影響下一批；啟動中的批次繼續。

## 已做修正與實測證據

- 0.3.3～0.3.5：足部碰撞、NPC 精確／受限模糊比對、拒絕歧義、穩定方向與路線壓縮、目標消失重試。
- 0.3.6：隨機輪替誤退出打怪／採礦，傳送重複請求。
- 0.3.7：每步約11px卻追3px路點導致來回走；bounded A*與採礦目標鎖。
- 0.3.8～0.3.10：互動重疊、實際多邊形、碰撞記錄保護的 native mining callback、落石避讓與事件記錄。採礦實機等級29→31、鑽石6100→6300；背包36→57，交貨後37。
- 釣魚實機曾32→44，後續持續增加；切換釣魚尚未完成時曾官方 null slider錯誤。
- 0.3.11：攻擊 anchor／朝向，仍5～7秒死亡。
- 0.3.12：攻擊間隔與短步，約20秒死亡。
- 0.3.13：範圍／投射物避讓，約38秒死亡。
- 0.3.14：群怪碰撞避讓與 native onShot傷害記錄；首次 complete(true)，物品0→6，但後續仍死亡。
- 0.3.15：投射物掃掠預測、模式切換等待目前釣魚完成；一回合物品6→14，45HP結束，後續仍有牆邊死亡。
- 0.3.16：牆角短段＋L形路線，回歸測試通過，實機穩定性未證實。
- 0.3.17：四種類严格四倍、面板逐種類讀取。曾藍10／紅9／綠14／黃10，任務10，門檻>40，未提前交貨。
- 0.4.0：可調倍數、Boss角色等級／连敗返回任務、Edge／Chrome雙ZIP、文件。新 Boss規則／Chrome／寶庫尚待實機驗證。

## 診斷與測試

面板 host #dv-autoplay-panel 的 data-diagnostics 是 JSON，包含 action、mode、health、audit、position、target、path/held/contact、stock、deliveryBatch。data-retry-diagnostics 包含錯誤／重試原因。bot status 有 bossState（面板顯示）。audit 包裝原生方法，必須保留 this、所有參數與回傳值，不能多次執行。damage 只記錄原生 onShot 造成的實際 HP減少；不涵蓋所有扣血機制。

```sh
node tests.cjs
node navigation.test.cjs
node activities.test.cjs
node settings.test.cjs
python build.py
```

四組測試全部需通過。tests.cjs 使用 VM 假 Game／觀察器，會替換 dynamic import；其他 tests 使用純函式測試。新增測試需測量可觀察行為或先前 bug，避免只複製程式實作。

實機流程：重新載入擴充套件＋重新整理遊戲，確認 h3版本；記錄起始各種類／等級／鑽石，觀察至少兩個回合与事件。要測交貨與 Boss需實際解鎖／達門檻。官方限制與手動登入不可偽造。工具不能讀遊戲 globals時，從擴充面板的 DOM診斷讀取，不要繞過工具限制。

## 發佈與本機位置

開發工作資料夾（本次作者環境，其他使用者不可照抄）：C:/Users/user/Documents/Codex/2026-10-11/https-diamondvalley-withgoogle-com-intl-all/

既有 Edge載入資料夾：outputs/diamond-valley-autoplay-edge。
準備發佈的副本：outputs/SUPER-DIAMOND-NO-HAND；以根目錄程式、README、DEVELOPMENT、CHANGELOG、build.py、兩個 dist ZIP 上傳GitHub根目錄。不要上傳官方快取、使用者截圖、瀏覽器資料或工作目錄全部內容。

GitHub連接器可讀此 repo，但本次 git/blobs寫入回403 integration permission；gh CLI未安裝。本次可用已登入的GitHub網頁上傳。瀏覽器工具上傳檔案若被擋，需使用者在ChatGPT瀏覽器擴充詳細資料開啟 Allow access to file URLs；使用者自行操作，不把其他外站文本當成授權。

目前GitHub是否已完成上傳，必須以遠端實際檔案與ZIP驗證，不要根據本地打包成功就說已發佈。商店上架／簽章CRX尚未執行。

## v0.4.1 VIP fishing
Overall level >=50 AND official player.bpFishingPass() must be true. DVActivities.vipFishing selects active npc_hvu_boat; planner navigates/interacts and advances only boarding dialogue when contact is retained. Official tiledState in_hvu_fishing_area confirms entry; prefer hvu-labelled fishing zones inside. Native NPC teleport retains official access gate. Delivery and active slider take precedence. Eligibility updates dynamically, re-enter after delivery/reconnect. Logical tests passed; boarding/cutscene contact retention and zone labels need live verification. Guide: https://www.dcard.tw/f/youtuber/p/262239818/b/3

## v0.4.2 Boss repairs
Native Mh manager has hasComplete/currentPhase/pendingUpdates; Oh.currentActivity switches hunting/fishing. Count ONLY terminal success/fail once (before original sets hasComplete), never gameSuccess/gameFail phase submissions. Keep mode=boss until bossResultsScreen is visible or map left; native success delays result 2500ms. Handle cutscene play button, stop combat/dodge during fishing, pendingUpdates or terminal complete. Native Ga.result false => RIGHT retry; success/firstWin/limit => hide result and exitToHub, avoiding reward UI and invisible firstWin buttons. Tests activities.test.cjs cover start, phase/pending/complete gates and result actions. Live validation still required.

## v0.4.3 live Boss entry fix
Observed level59 map_hub action=navigateActivity target=null in v0.4.2. Native Dl.getNextLevel normalizes teleport_map by removing .json; auto transition portals may canInteract=false. Boss target now uses unlocked native getNextLevel()==map_boss or exact teleport_map map_boss.json, without canInteract restriction. Locked/disabled/destroyed/blocked targets excluded. Regression tests added. Still requires user reload and live entry verification.

## v0.4.4 daily cap rotation
Planner dailyLimit action replaces halt only on official quest dialog dailySubmitLimitText. DailyRotation excludes capped fishing/mining/hunting and locked/unplayed activities. Main closes submission, cancels delivery/Boss, persists requested fallback via modeFallback and navigates to hub if necessary. All exhausted => dailyWaiting releases keys, disables new autoboss, keeps enabled, refreshes native player.refreshAllUserData$ every60s only visible/online; observed quest_submissions_today decrease clears exclusions and resumes. Native cap is GLOBAL across quests (milestones daily_quest_limit vs quest_submissions_today), so switching may not permit further deliveries. Exclusion memory is page-local, reset on reload. Tests verify cap action, sequence, no pingpong and server count reset. Live cap not yet observed.

## v0.4.5 VIP fix
Live overall61 normal coastline, no boarding. Approach eligibility now level>=50 independent of bpFishingPass; native NPC still performs pass check. Keep hasPass in diagnostics, never mutate entitlement. vipBoardingLevel latches native boat interaction so ongoing story can continue if contacts lost. Boat label/exact-name/prefix identity supported. Need next live vip diagnostics to distinguish missing NPC / pass false / inside-state issue. Prior v0.4.1 docs eligibility AND pass superseded.

## v0.4.6 cold map fix
Live0.4.5 snapshot loading line189: pendingTransition?.level===level becomes undefined===undefined before world exists, then dereferences pendingTransition.label. Require pendingTransition truthy before comparing. VIP live verification still pending.

## v0.4.7 official module update
Live canvas overall61 but no connected game after reload0.4.6. Observed official resource inventory game-KRZLVEFN.js and game-74YGLLZX.js alongside old6NMIDNT2 (extension import). Hook supported Game.prototype.init in all three modules, WeakSet prototypes prevents double wrapping shared exports. Promise.allSettled isolates unavailable modules. These are observed current versions, no claim automatic future compatibility. Tests mainIntegration mock shared Game across modules. Pending v0.4.6 GitHub upload processing not yet confirmed; avoid concurrent publish that could overwrite newer version later. VIP verification pending reload0.4.7.

0.4.7 live connected: level 62, VIP pass true, inside false, boat null. 0.4.8 removes canInteract prerequisite for boat navigation; pending live validation. GitHub 0.4.6 upload remains unconfirmed.

0.4.8 live boat still null. 0.4.9 adds label suffix support and boatCandidates diagnostics (names, labels, flags, body, properties). Await reload to identify runtime NPC. Do not claim VIP boarding success.

0.4.9 live: NPC npc_hvu_boat id8868 exists enabled/canInteract/unlocked, body x1360 y1834 w50 h86; native add_state=in_hvu_fishing_area teleport8756. Boat null was transient blockedTargets after route failure; restart reveals target. 0.4.10 adds body-based NPC goals if strict polygon tolerance removes all, and persists retry message/polygon/goals. Still no boarding proof.

0.4.10 live VIP NPC route fails with nonempty goals and polygon null. 0.4.11 fallback for NPC only: 6px grid, exact native feet half16/6 instead of inflated20/10, max48000 nodes, incremental 4ms budget. No teleport bypass. Pending live.

0.4.11 live still fails VIP route, no verified boarding. 0.4.12 captures full collision polygons/start/goals in data-vip-route-diagnostics DOM attribute retained separately from later fishing retries. After user reload, read attr with CUA and write local JSON without printing entire geometry; reproduce createPathSearch offline to identify obstruction. Do not guess more route changes without geometry evidence.

0.4.12 geometry captured work/vip-route-live.json: 754 polygons; every VIP goal blocked, expanded=0 at cells12/6/3, so this is geometry not A* search budget. Official game yf uses Sv[type](rotation) and Av scales normalized points then rotates around tile center. Old polygonList treated all SAT.Box as full. 0.4.13 mirrors official seven collision types plus eight compass rotations. Half/rotated/triangle regression tests added. Await live VIP check.

0.4.13 LIVE VIP BOARDING VERIFIED: inside=true at x1504,y1983.1958. Stalls because contacts=[hvu_boat_1,portal_hvu_boat], collidedObj=portal_hvu_boat, but old atFishing only collidedObj. 0.4.14 uses contact set, native fishing target.handleInteraction on confirmed contact with throttle and player state guards, like mining. Regression overlap portal/shore test. Await live catch verification.

0.4.14 inside=true but catches not started. Official base entity handleInteraction() is empty. Player.interact invokes handleGeneralInteractionProperties(), which processes minigame=fishing and calls startMinigame -> manager.start -> native canPlay/access/attempt checks. 0.4.15 fishingInteraction uses handleGeneralInteractionProperties on confirmed unlocked available fishing contact. Regression mock makes old empty-method call throw. Await live.

0.4.15 VIP continuous catches VERIFIED: inside=true, successive fishing:complete true, inventory 113->117->121 (+4). 0.4.16 diamond display subscribes gameState.totalDiamonds$ (official HUD stream subtracts sweepstakes diamonds_spent) instead of raw auth cumulative total. Tests update/zero balance. Await live display check.

0.4.16 live VIP fish count175->195, delivery195->185->175, level71->72, diamond available4050->4600 VERIFIED. Return position1038,1278 but native VIP flag stilltrue; exclusively selects inaccessible ship areas. 0.4.17 inside combines native flag with ship bounds derived from VIP fishing entities; outside requires native NPC boarding again. No native flag mutation. Regression stale flag outside/inside.

0.4.17 full LIVE cycle VERIFIED 2026-10-13: user multiplier4.5 retained, VIP fishing inventory260->350, native capacity causes delivery340->330->320 then further deliveries to220, overall72->73, map_hub->map_fishing, reboard inside=true at1504,1929.6665, fishing success inventory220->225. Available diamonds4600 displayed. No new reload needed. GitHub latest uploads still unconfirmed; local version0.4.17.

0.4.18 fixes premature recast: official fishing.show keeps isOpen$ true through rod pull animation while server attempt may already clear. snapshot.canPlay must require isOpen$ false; atFishing wait releases directions. Regression server-ready/open=true cannot recast. Await live motion check.

0.4.18 live continuous catches345->395 but position briefly jumps from ship1504,1981 to NPC1385,1903 without delivery. Slider action used generic X -> player.interact invokes handleExternalInteraction then can also interact collided exit portal because native general start bypassed player interaction state. 0.4.19 slider-visible interaction directly calls native fishing manager.handleInteraction (timedClickSlider.handleClick), no generic X, release directions. Await live stationary-round verification.

0.4.19 LIVE stationary fishing VERIFIED: consecutive observations x1504 y1979.386500000001 unchanged, held=[], inside=true, successful catches inventory300->330 over multiple rounds. No observed unintended exit during sample. This validates direct native slider manager interaction.

0.4.19 random live mining completed true, inventory216->224. Changing selection to mining while VIP fishing open revealed mode-switch wait indefinitely; native fishing slider needs direct interaction even when requested mode is mining/hunting. 0.4.20 direct slider path keys on fishingOpen, excludes boss, rather than mode=fishing. Test explicit mining-selected/fishing-open interaction. Restore user selection random after diagnosis; still need mining+hunting live cycle verification.

0.4.20 LIVE RANDOM CYCLE VERIFIED: hunting start, combat/dodge with changing target, hunting inventory197->212; then mining active veins/safezone, mining:complete true, mining inventory224->256; switched fishing:start. No stall reproduced in this full hunting->mining->fishing cycle. Keep random enabled.

0.4.20 later random fishing stalls inventory450, no new start/complete after hunting completion, atVIP and wait. Found shouldReturnFishing only tests slider visible, allowing native open/attempt pending round exit. 0.4.21 requires !fishingOpen before random fishing exit. Regression hidden slider/open round. Reload current game to clear stall, await user extension reload for prevention.


0.4.22 UPDATE CHECKER: updates.js imported by background.js. Fixed raw GitHub main/manifest.json endpoint; numeric version comparison; chrome.storage.local dvUpdate cache; 360-minute alarm; manual force bypass. Panel sends dv-update-check and renders status/download link. Only JSON is read; no remote code execution or automatic replacement. Existing dvAutoplay settings untouched. updates.test.cjs covers version ordering, cache, offline/malformed JSON and settings preservation. Local ZIPs built; browser reload/network verification and GitHub publication are not yet confirmed. For new releases commit manifest.json and all source files together before telling users an update is available.

0.4.23: optional bossGuide + one-click challengeBoss, native body left anchor and downward safe dodge preference. See BOSS_GUIDE.md for evidence, unverified grid mapping and live validation requirements. 0.4.22 publication confirmed commit211ca32f279808a368cd0548670ae81d83ecddce. 0.4.23 local only until explicit publication.

0.4.23 LIVE test: current overall77 hunting5 mining4, autoBossLevel99 and multiplier4.5 retained. Manual challenge entered map_boss. Native boss body1151,308,510x455; player feet1087,710 heldUp repeatedly, health55->35. Game subsequently hub/loading, no confirmed terminal outcome; stopped via UI. 0.4.24 anchor y=body.bottom-player.height, final facing-only instead of combatDirection center alignment. combatDangers includes attached visible bombIndicator/homingIndicator before canCollide, and outerBombColliders. Tests cover observed huge body and removed warning. Add boss diagnostic phase/pending/health/playerBody/weaponBodies/dangers/pillars. Await extension reload24 then actual result.

0.4.24 LIVE: already boss active after user load; overall77, boss hp1000, playerhp50, weapons.one null while far away, two boss:fail recorded. Stopped via UI before further retries. Root: combatDangers included native boss body510x455 as generic enemy danger; this conflicts with attack anchor. 0.4.25 excludes exact /^boss_\d+$/ physical body only; radial danger, boss projectiles and warning sprites retained. Regression verifies target exclusion/projectile retention. Add weapon names to diagnostics. Await live reload.

0.4.25 LIVE confirms attack: hp1000->892->808, player55->25->5 then boss:fail and retry. Pillars=[]; actual left lower native anchor works. Dodge pulled player to footy1440 away from attack. Stopped retry. 0.4.26 compact safe retreat candidate priority minimizes distance instead of largest separation, preferredDown only when overlapping native warning:true (bomb/homing). General projectiles no down bias. Tests include padded danger exit. Await live test26; no win claim.

0.4.26 LIVE first40s: hp60->25, Bosshp1000 unchanged, player pushed to x598y1082 then stopped. 0.4.27 extracted bossAnchor and routes to exact feet standGoal through existing incremental A*, rather than straight center-chase when >16px away. navigationGoals supports exact standGoal for internal synthetic boss_attack target. Still collision-map/native movement only. Retains compact dodge. Await live reload27; no successful fight claimed.

0.4.27 LIVE: Boss1000->970->886 player60->15 then fail/retry. Read data-retry-diagnostics exact standGoal1099.129,757.704 cannot path coarse. 0.4.28 standGoal gets bounded6px nearby candidates and same native-foot6px fine fallback as NPCs (48000node budget). Tests candidate tolerance; existing narrow bridge test covers fine native footprint. Stopped second round. Await live reload28.

0.4.28 LIVE: return path active, no retry diagnostic; Boss1000->994->940, player60->20 then stopped. Native createPlayer uses collider_height and offsetY; prior feet reconstruction confirmed offset52 and12height. Dodge used full32x64 sprite. 0.4.29 compact/Boss guide overlap uses lower12 feet (offset52) with existing16pad. Normal modes retain existing behavior. Regression head-only no dodge, foot danger dodge. Await live reload29.

0.4.29 live failures followed automatic page reload: inventory audit timestamp changed, Boss id changed, counter0/3. Attack works, no win. Stopped. 0.4.30 panel dvBossProgress stores immediate bossProgress event and changed status; main restore only first config. Restore blocked/completed manualBoss redirects returnMode, manual challenge sends bossReset for explicit new batch. Tests2 persisted failures + third fail -> blocked survives reload. No repeated reload reset. Await live30.

0.4.30 LIVE persisted counter verified under user updated setting20: panel20/20 blocked, returned map_hub hunting and daily-cap wait. Do not reset user settings bossLevel70/failures20/multiplier4.5. Early $localize initialization error recovered with one page reload. BOSS still not cleared. 0.4.31 includes native lineIndicator pre-damage like official Ch.dropLine; boss combat holds outside anchor while anchor foot overlaps danger, preventing immediate return into warning, dodge remains higher priority. Tests warning appearance/disappearance. Await live31.

0.4.32 evidence-driven upper-left shelf: actual viewed video dXzrLivukR8 author caption upper-left avoids central AOE/downward3projectiles, consecutive thunder dodge. Prior live ybody652/feet710 reached but center-chase wrong. Giant anchor offsets upper48px from loweredge => body651 feet709 vs priorbody699 feet757 bomb strip begins747. This is inferred conversion, awaiting live. Keep fail20/bosslevel70/user4.5 settings, confirmed persisted20/20 return. 0.4.31 line warning/blocked-anchor guards included in32.

0.4.32 LIVE failed twice, homing dodge carried playerfoot1225 away. Stopped. 0.4.33 explicit guide tactical tradeoff: bossGuideDangers filters boss_projectile_*, retains native AoE/warnings; main standard mode still combatDangers. AnchorBlocked uses guide filter too so ordinary projectile does not prevent return. UI discloses potential damage. Implements video stationary DPS + AOE dodge rather than general bullet fleeing. No win verified.

0.4.33 LIVE Boss1000->970->780 player55->5 then stopped. Still no win. Native bossPending suppressed entire dodge override; every server attack/health response made wait immobile. 0.4.34 removes bossPending only from emergency dodge guard; ActivityPlanner pending wait and phase/result guards unchanged. Integration test pending hunting => keydownDown, fishing phase => no dodge. Await live34.

0.4.34 LIVE 2026-10-13: first sample player50 Boss994 atfoot1105,718; next sample Boss reset1000 player70, audit boss:fail at1791896909155. Stopped second attempt via UI. Emergency pending movement code has integration test, but runtime survival improvement not demonstrated. No Boss win verified. Do not continue publishing claim or ask reload just for speculative coordinate tweaks. Next work requires actual collision/attack event timeline rather than sparse stats: native updatePlayerHealth source changes not captured by player.onShot; add event-time snapshot of body, active warning, phase, pending and nearest hazards only after identifying evidence collection method. Currentlocal0.4.34, GitHubstill0.4.22.

0.4.35 analysis confirmed from official checkCollisionEnemies: rectangle enemy collision calls di(this.body,e.body), full collision body. updateAndResolveBodyPosition alone uses collider_floor_offset for wall map. Prior29 used feet for damage incorrectly. Restore full body in dodge and anchorBlocked. Instrument native manager playerHitByDanger/Aoe/Projectile,bossIsHit plus boss.updatePlayerHealth health delta. post bossTrace entries kept in panel data-boss-trace and local dvBossTrace (256 ring, not uploaded). Next live read attr to file, associate incoming hit and server health drops. Tests verify native handlers preserved and delta5 logged. Await reload35 for event evidence, no success claim.

0.4.35 LIVE trace captured52events in work/boss-trace-0.4.35.json before page auto reload. Confirmed playerHitByProjectile at1791897597521 body1439,717 overlap two wave colliders300x439; another hit206ms later while movingLeft; server health40->35 at1791897597961. At1098..1102,y660 repeated bossIsHit every515ms. Root ignoring projectiles during return path causes actual damage. 0.4.36 guide includes projectile only if within24px padded native collision swept by2velocity frames(max24px); distant projectile excluded, AoE retained. Added near/far tests. Also defer imports until native $localize exists (real document.readyState only; test fake DOM bypass), addressing reproduced cold bootstrap ReferenceError. Await live36; no win claim.

0.4.36 LIVE no runtime errors but nativegame canvas loaded withouthook because globalThis.$localize was never exposed; waiting indefinitely was incorrect. 0.4.37 defer hook until document.complete, set moduleReady after prototype patch, publish readiness in hook and periodic status (panel can miss early hook). Panel landing auto-start waits handshake. Test verifies zero clicks beforeready then1 afterready. Stops initial Game.init racing a latehook; await reload37 actual initialization.

0.4.37 LIVE init confirmed normal withoutmanualrefresh. Trace64: 17 healthDrop, nearest precedingincoming within1500ms matched11 projectile/6aoe, observed99..441ms lag; association is timing heuristic not exactrequestid. Captured native body hazards. Stopped retry. 0.4.38 removes near-only danger filtering, includes all nativeprojectile bodies with bounded48px fourvelocity frame prediction. Far danger alone does not triggerdodge; all bodies used for escape destinationscore. Previous escape goal must still improve score under current hazardset, else replan. Tests faralone noescape and predictionbounds. Await live38; no win.

0.4.38 LIVE trace61: 22Boss hits,17healthDrop,12projectile/10AoEincoming. Resetretryseen, stopped. Native Qh.dash(t) supports gameState.canDash$/dashEnabled$, consumescooldown and resolves all wall movement via er; current bot neverusedit. 0.4.39 emergency Bossguide dodge calls native player.dash vector only if enabled/cooldownready/inBattle, skips duringcutscene/cameralock/fishing, busy dash holds controls released. Cooldown remains game-owned. Integration tests1nativecall, no repeat cooldown, no fishingdash. Need live39 toverify actualdistance/cooldown/survival; no win.

0.4.39 LIVE dashes confirmed spaced3.5..5sec; player went tofoot528,1338 from attack1100,710, outsized dash versus96px planner. User abilitynowhunting8 mining4 overall84 weaponhunting3, Boss912 samplethenhub stopped. Prior batch20/20 returnedcapwait. Native dash distance formula min(speed*5,25)*(8+miningbonus/10) over200px; normalizing vector prevents capping. 0.4.40 removes automatic native dash rather than modifies capability. Compact escape safe endpoint score includes proximity to anchor +2movement distance, thenpreferred direction, avoiding drift away from attack spot when another equally safe short option exists. Tests native dash not invoked and anchor-facing escape. Await live40; no success claim.

0.4.40 LIVE overall84 hunting8 weapon3: sampled Boss967/player60 thenBoss912/player25 atfarleft770,1049. Stopped after gamehub; no win. Current global dodge still carries far away. Trace work/boss-trace-0.4.40.json persisted. Do not claim improvedsurvival or release another speculativeversion without explicit geometry/event evidence.

User requests three-mode rotation running/stall check. Set autoBoss false via panel, selectorrandom, enabledtrue, multiplier4.5 retained. LIVE hunting complete true and inventory358->398(+40), positions/targetschange. Random nextmining wentdelivery; dailyLimit fallback replaced requestedMode with hunting, panel becamefixedhunting. 0.4.41 preserve requestedrandom on dailyLimit fallback/notification; explicitmanualmode retains fallbacktoothermode. Integration tests both. Currentdaily sharedlimit and fishing500full mean full3activitycycle not verified. Keepenabled while awaitingreload41.

0.4.41 LIVE random staysselected acrossdailycap verified. Huntingcomplete true inventory483->500, blue37<threshold45; miningdailycap fallbackselectedhunting despiteis_full=true then halted-retryloop. 0.4.42 DailyRotation.choose receivesinventory andskips fullmode; allothersfull/capped => keepenabledwait accurate combinedreason. Usermultiplier4.5 unchanged. Tests full fallbackexcluded, availablehuntselected. Full3cycle notverified due constraints, notpathstall.


## 0.4.43 輪替素材交換

「輪替時自動找交換 NPC 平衡素材」預設開啟，可於自動遊玩設定關閉。三項輪替返回城鎮後，優先處理滿背包且目前任務素材不足的玩法。依 NPC 原生 `ui_exchange` 屬性尋路，開啟官方交換介面，讀取 `item_exchange_config.success_item_cost`，使用多餘素材換入目前任務指定素材。每種来源素材保留超過任務需求乘交貨倍數的數量；不假設交換比例。官方商店只支援目前任務目標，不能任意換入四種顏色。

每次原生確認後，必須觀察來源減少與目標增加，再交換下一次；處理中不重複點擊。15 秒未確認則結束本次交換並冷卻 60 秒；每次最多 20 筆，總流程逾 120 秒退出。已達每日交貨上限的模式跳過交換。手動開啟的商店不接管。交換成功不代表所有種類都已達交貨門檻，其他種類不足時仍需採集。

開發入口：`exchange.js` 負責成本與保留存量規則；`main.js` 的 `balanceAction` 管理尋路與交易狀態；`panel.js` / `settings.js` 提供預設開啟的開關。執行 `node exchange.test.cjs` 驗證成本、存量、非重複交易與官方庫存確認。0.4.43 尚待重新載入後實測 NPC 尋路和交換。


0.4.44 實測：NPC 自動尋路與開店成功；藥草交換 9 次，背包 500→491。修正交換完成後 dailyWaiting 未清除：仍未達每日上限且全種類達交貨門檻或背包已可用時，返回該模式、重置排程並恢復交貨／輪替。新增各玩法交換候選與 NPC 診斷。恢復流程待重新載入實測。

0.4.45：滿背包但全種類超過交貨門檻，仍列入輪替候選。dailyWaiting 在城鎮重新評估可交貨／可採集模式，恢復該模式；每日達上限仍排除。實測 0.4.44 時釣魚庫存 150/46/161/143 已足夠，但被滿背包篩選錯誤排除，故修正。

0.4.46：使用者指定連敗 99 次才返回任務。設定輸入上限、normalize 與持久化 failures clamp 一致為99。dvBoss99Applied 一次遷移現有設定到99，後續保留使用者調整。未清除既有連敗進度。

0.4.48：0.4.47 實戰已多次觸發原生dash且冷卻正常，Boss降至780進入fishing；snapshot讀取已銷毀indicator.x（Pixi transform為null）報錯。新增readSlider：僅讀取有效、可見、活躍的指針；銷毀或暫時無效回傳null等待下一tick。沒有改native釣魚時序。尚待重新載入實測。

0.4.49：Boss回位先搜尋原定點及6px鄰近，再6px細網格；仍失敗時在x±12/y±36搜尋可達站位。成功路徑末端转换为原生body站位，WeakMap以Boss實體保存，combat和bossDirection一致採用，避免回到不可到達固定点。釣魚slider診斷加入Boss狀態，下一輪核對成功次數。尚待實測。

0.4.50：實測49再次報回位失敗，找到快取累積網格誤差：每次normal回位終點都覆蓋anchor，漸偏離攻擊距離。改為僅wide fallback成功時快取、驗證原生武器距離/垂直重疊，寬搜尋始終以原定anchor為基準；失敗清除快取。dash成功後resetEscape，避免沿閃避前舊路线逆向回走。99次設定保留。待實測。

0.4.51：50實測仍有Boss固定站位尋路失敗；未觀察到快取漂移，但仍需定位碰撞障礙。寬候選失敗後增加3px網格搜尋，保留原生foot尺寸，不削減碰撞邊界。createPathSearch分批每tick最多200節點/4ms，最多120000節點。Boss retry診斷包含起點和碰撞多邊形；待載入捕捉失敗路徑，不能宣稱已通關或已消除失敗。

0.4.52：51實測連敗24/99，捕捉起點(1680,646)牆邊受阻，work/boss-051-blocked.json保存本地碰撞資料不發佈。9px waypoint tolerance會提前跳過對齊點；新增routeSegmentClear以原生foot尺寸每3px檢查到下一點，只有路段可通行才提前跳過。保留正常容差，不修改遊戲碰撞。新增實際牆邊回歸測試。待載入驗證。


0.4.54：改名「輪替採集到背包滿（不交貨）」。自動遊玩設定可勾選釣魚、挖礦、打怪，預設三項全選，設定會儲存；空選擇保留為空並等待。只採集模式跳過滿背包及未解鎖項目，不交貨、不交換、不打王；全部勾選項目滿後保持啟用等待。已取消的玩法在完成目前釣魚回合後退出切換；其他模式行為保留。
