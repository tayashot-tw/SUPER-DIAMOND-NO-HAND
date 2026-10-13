## 0.4.22

- 每 6 小時檢查 GitHub 版本，提供立即檢查與新版 ZIP 下載提示。
- 手動覆蓋原資料夾、重新載入；不下載或執行遠端程式碼。
- 已通過版本比較、快取、離線與設定保留測試；尚待瀏覽器重新載入實測。

## 0.4.21

- 釣魚原生回合尚未結束時，延後隨機模式返回城鎮。滿背包重新進場仍待驗證。

## 0.4.20

- Finish a pending fishing slider even after the requested mode changes. Live random hunting → mining → fishing cycle verified; hunting inventory +15 and mining inventory +32.

## 0.4.19

- Operate the fishing slider through its native controller to prevent an overlapping exit portal from receiving the generic interaction key. Multiple successful rounds verified with unchanged player position.

## 0.4.17

- Reboard VIP ship after quest delivery when fast travel retains the native VIP state outside the ship. Live diamond balance and delivery verified on 0.4.16.

## 0.4.16

- VIP continuous catches verified on 0.4.15. Display live spendable diamond balance from the official HUD stream.

## 0.4.15

- Start fishing through native general interaction properties; base entity handleInteraction is empty. VIP catches await live verification.

## 0.4.14

- VIP boarding verified in 0.4.13. Fix overlapping exit portal masking the fishing contact; select native contacted fishing target. Live catches pending.

## 0.4.13

- Reconstruct half and diagonal collision tiles with native rotation instead of treating every tile as a full square. VIP live verification pending.

## 0.4.12

- Retain VIP route collision geometry for offline reproduction; VIP boarding remains unverified.

## 0.4.8

- VIP boat NPC navigation no longer requires canInteract before approaching. Native access checks remain in force. Live boarding verification pending.

# 0.4.7

- 連接目前觀察到的官方新遊戲模組，修正畫面已載入但面板一直等待狀態。
- 共用 Game 類別只連接一次，不重複包裝。

# 0.4.6

- 修正遊戲初始化、地圖尚未載入時等待傳送判斷的空值錯誤。

# 0.4.5

- 50 等先找船隻管理員，不再因船票同步阻止尋路。
- 登船對話不依賴持續碰撞接觸，新增 VIP 資格及入口診斷。

# 0.4.4

- 當日交貨上限自動切換到其他已解鎖採集模式，排除已达上限模式。
- 全數達上限後等待官方每日計數重置，自動恢復。

# 0.4.3

- 修正 Boss 城鎮入口辨識：接受官方 map_boss.json 傳送目標及原生自動傳送門。
- 實機確認舊版在 map_hub 沒有目標；新增入口鎖定與格式測試。

# 0.4.2

- 修正 Boss 開場、勝敗畫面等待、失敗重試及首次勝利返回。
- 釣魚與伺服器提交階段停止追擊和避讓，避免戰鬥按鍵干擾。
- 避免重複計算終局連敗；新增 Boss 流程測試。

# 0.4.1

- 角色 50 等且取得官方船票後自動前往 VIP 釣魚區，交貨後重新登船。
- 保留交貨與釣魚回合優先，新增等級、資格及登船流程測試。

# 0.4.0

- 可設定各類物資超過任務需求幾倍才交貨。
- 可設定自動打王的角色等級與連敗上限。
- 連敗達上限返回任務，完成一批交貨後再挑戰。
- Edge／Chrome 各自提供 Manifest V3 ZIP。
- 補上使用方法、ChatGPT 開發標示與使用風險。
- Boss／寶庫及 Chrome 實機仍待驗證。
