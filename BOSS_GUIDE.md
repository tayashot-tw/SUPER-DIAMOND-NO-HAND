# BOSS 策略依據與驗證

查核日期：2026-10-13。此文件區分玩家經驗與套件實測，供下一位 ChatGPT 接手。

- 使用者提供凱特叔叔教3C貼文截圖與 https://www.facebook.com/share/p/1CNgzdhWNv/ ：建議攻擊9格、體力7格，在左側最近柱子攻擊，紅圈向下躲。公開網頁讀取失敗；依據為使用者截圖。未確認發布年份，不能當官方保證。
- 2026-09-28第一人稱玩法記錄：[Heresy](https://kheresy.wordpress.com/2026/09/28/2026-google-play-diamond-valley/) 說明打怪升攻擊、採礦升生命，Boss位於上方固定位置，具有大範圍攻擊；作者75級挑戰後整體等級到100，能力熟練度不跟著滿等。
- 上述文章附 [BOSS 影片](https://www.youtube.com/watch?v=tVvDj3Yf4Qw)。已確認嵌入連結，影片本體未成功讀取，不能聲稱逐幀觀看或證實9/7及柱子戰術。
- [2026 Dcard攻略](https://www.dcard.tw/f/youtuber/p/262239818/b/1) 描述能力足夠時靠近小戈倫可持續攻擊，支持接近自動攻擊，但沒有獨立證實9/7或下躲方向。
- [2025巴哈攻略](https://forum.gamer.com.tw/Co.php?bsn=60528&sn=28023) 為不同年度，僅背景參考；不拿舊年度閃避／釣魚／攻擊階段當2026必然規則。

## 實作

settings.bossGuide預設false。panel challengeBoss按鈕設true、mode=boss、enabled=true，不改交貨倍數與連敗設定。既有manual Boss controller仍負責連敗退回任務。

navigation.bossDirection使用原生body與武器距離：明確名稱pillar/column/柱、左側且站位在native reach內才採用柱子。不存在則Boss左側站位；從右側下繞。每步檢查腳底碰撞，受阻回到一般combatDirection。

dodge增加optional preferred參數；Boss攻略模式傳ArrowDown。只有兩條候選都安全才比較方向優先，危險／牆角仍由原本評分與轉彎尋路決定。攻擊警示讀原生radialWeaponBody；不是用紅色像素做認識。

顯示activities_data.hunting.level與mining.level為熟練度。格數映射未確認，9/7不作強制自動進場門檻。

已測：從右側下繞、回左側、避讓後回攻擊列、安全下躲、無警示不躲、面板一鍵開始及設定保留。未測：真Boss通關、柱子實際名稱、整體100等獎勵。不操作抽獎。

## 2026-10-13 第二次影片核對

直接在 Edge 播放 Heresy 影片，觀察0:07與0:40片段：角色會在Boss側邊近身輸出，並非持续全場繞行。留言實際是玩家拿鐵鍬而作者拿劍的差異，不能稱為已證实金劍／木劍的能力門檻。

另找到并播放 [2026 超鑽感謝祭 無腦打戈倫（能力LV8）](https://www.youtube.com/watch?v=dXzrLivukR8)，觀察約0:25片段，作者在最接近Boss的左側柱子右邊站定。說明指出左上位置能打Boss、避開中央範圍與向下三連彈；連續雷擊時需要閃一下。畫面整體等級100，標題能力LV8，兩者不能混用。未驗證這種站位對使用者 hunting5/mining4 必定成功。

0.4.32 調整巨大Boss攻擊站位：在原來左下緣基礎上往上48世界像素，對應 live腳底710附近可達棚位，不追巨大身體中心。細網格與危險站位等待保留。雷擊、炸彈、直線預告與實際投射物仍處理，沒有盲目忽略所有傷害。48px是依影片站位關係與本帳號先前位置的工程推估，不是影片公開座標。新版本未實戰，不能宣稱通關。


## 0.4.47 原生快速閃避驗證

今年參考：[Heresy 2026 攻略](https://kheresy.wordpress.com/2026/09/28/2026-google-play-diamond-valley/)，附 [2026 戈倫影片](https://www.youtube.com/watch?v=tVvDj3Yf4Qw)。已確認今年原生 Player.dash(vector) 檢查 canDash$、dashEnabled$，啟動原生冷卻並使用牆壁碰撞處理。新增 dash.js 僅在攻略模式已決定避讓方向、原生技能就緒時觸發；不修改冷卻、速度、碰撞或血量。尚未實戰驗證改善，不能宣稱無敵。原生動作與抬手警示的對應仍待確認，尚未新增抬手預判。
