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
