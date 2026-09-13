# CHECKPOINT — ricochet-mech-arena

## 现场（2026-09-13）

- cursor 在 `docs/ROADMAP.md` **M0**，代码已可玩：FPV 战甲、横移+冲刺、弹墙炮弹、完美闪避人机、
  雷达、威胁提示、合成音效、第三人称切换、计分与回合重置。
- M0 exit 的**测试半边**已过（人机躲直射 / 窄走廊必死 / 不超速 / 反弹解真能到）。
- **第一次真人试玩（2026-09-13）反馈**：太难；第一人称不知道对面在哪；第三人称子弹太少看不出走位。
  已改：墙 3 → 1.5 m（挡弹不挡视线，VISION §5.6）、敌机头顶常显标记、视野外方位+距离、雷达边缘钉标、
  地面走位光带、玩家在飞弹 4 → 8、人机开火间隔 0.7 → 1.0 s。
- **第二轮真人反馈（同日，线上版）**：墙面杂纹（阴影痤疮 + 灯带共面）；死后对面还能被补刀（改成首杀定胜负、
  幸存者无敌）；人机贴墙/离墙 1 m 开火穿墙（炮口在 1.13 m 前、已在墙内 ⇒ 出膛点钳到墙前 + 墙内子弹销毁兜底）；
  要求人机转身时上半身一起转（炮塔骑在腿上 + 7 rad/s 回正 + ±100° 射界）。**改后还没有真人再玩过**。
- 远端 = GitHub `Quarkgluonmixture/ricochet-mech-arena`（public），Pages 接 Actions，
  站点 <https://quarkgluonmixture.github.io/ricochet-mech-arena/>。只有动了代码才部署（docs/md 被 paths-ignore）。

## 接手

1. 读 `docs/VISION.md`（短，全文）。
2. `npm install && npm run dev`，点 Click to play，先感受 30 秒。
3. 看 `README.md` 「Verified」那段的数字；要复现就跑 Ops 里的无头脚本。

## Ops 速查

- 本仓不装 playwright，借 `../evofootball-arena/node_modules/playwright`（chromium 已装）。
  起 `npx vite --port <空闲端口> --strictPort --host 127.0.0.1`，先 `curl | grep "<title>Ricochet"` 确认端口上是本项目。
- 页面上 `window.rma.drive(seconds, {fire, move, torsoYaw, dash})` 不需要 pointer lock 就能推进模拟；
  `window.rma.probe()` 拿位置/击杀/人机 safe 数/解/draw calls；`window.rma.hud.setOverlay(false)` 隐藏起始遮罩；
  `window.rma.rig.toggle()` 切第三人称。截图脚本的形状：goto → waitForFunction(probe().drawCalls>0) → drive → screenshot。
- 推送：仓库本地 credential helper 钉死个人号 ⇒ 直接 `git push`。⛔ 不要 `gh auth switch`。
- Node ≥ 22.6 直跑 TS：`erasableSyntaxOnly`，⛔ 构造器参数属性（`constructor(private x)`）不能用。

## 坑

1. 脚本玩家在出生点朝墙连发会被自己的反弹打死（无头测试里出现过 5 次）。测对射时把双方摆到
   `MAP_A` 第 5 行（z = -4，x ∈ [-12, 12]）这条开阔走廊上。
2. 三方 r185 的光强是物理量级：Hemisphere 2.4 / Directional 3.2 / Ambient 0.9 才够亮，0.75/1.6 一片黑。
3. 人机的反弹解如果每次都取最短路径，目标一动解就在几堵墙之间跳，炮塔永远转不到位 ⇒ 永远不开火。
   已加转向代价（`findFireSolution` 的 `preferYaw`）。
4. 炮口点默认在机体中心前 1.13 m：机体离墙不到 1.13 m 时炮口已在墙内，从墙内出发的射线看不见这堵墙，
   子弹会直接穿过去（真人反馈「不贴墙也穿」）。所有从炮口起算的几何都要改从**机体中心**起算。
5. 人机炮塔一旦和腿耦合，开火频率会掉一个量级（5 rad/s 时 15 s 只有 1–2 发）；调侵略性先动回正速率，
   ⛔ 别放宽 `aimTolerance`（那是精度不是频率）。
6. 无头 Chromium（swiftshader）截图偶发整页发白、HUD 半透明、左上角一个破图标 —— 同一状态再截一次就正常。
   是合成器偶发不是产品问题；判定前先重截，⛔ 别按白图改渲染。
