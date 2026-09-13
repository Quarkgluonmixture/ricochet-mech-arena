# CHECKPOINT — ricochet-mech-arena

## 现场（2026-09-13）

- cursor 在 `docs/ROADMAP.md` **M0**，代码已可玩：FPV 战甲、横移+冲刺、弹墙炮弹、完美闪避人机、
  雷达、威胁提示、合成音效、第三人称切换、计分与回合重置。
- M0 exit 的**测试半边**已过（人机躲直射 / 窄走廊必死 / 不超速 / 反弹解真能到）；
  **真人半边**未验：还没有人真玩过，不知道反弹击杀和逼角对人来说是否做得到、手感是否对。
- 远端仓库未建（等用户点头），Pages 未接。

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
