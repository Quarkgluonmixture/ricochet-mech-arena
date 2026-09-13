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
  要求人机转身时上半身一起转（炮塔骑在腿上 + 7 rad/s 回正 + ±100° 射界）。
- **音乐**：菜单曲 `public/audio/menu.mp3`（用户 Suno 出的《Hangar Silence》，已装）；战斗曲 `public/audio/bgm.mp3`
  **尚未到位**（用户说第二首 17–33 s 是 intro、33 s 起是战斗段——代码已按 start 17 / loopStart 33 配好在
  `src/main.ts` 的 `MUSIC`，文件一到放进去就生效）。
- **开始界面重做**（用户「有点廉价」）：不再是卡片贴海报——菜单后面跑 AI vs AI 的 attract 场景（导演镜头慢转、
  HUD 隐藏、音效静音），左侧大标题 + 竖排菜单（Chakra Petch / Rajdhani 自托管 OFL 字体）、右侧滑出设置面板、
  封面图只做加载 splash、键盘上下+Enter 可操作。BGM 改为交叉淡入的无缝循环，支持 `menu.mp3` + `bgm.mp3`，
  暂停时音乐压低。Suno style prompt 在 LOG 同日条目。**改后还没有真人看过。**
- **性能 / 音效 / 开始界面**（2026-09-13 深夜，用户反馈「有点卡、音效垃圾」）：画质三档（默认 Medium：像素比
  1.25、2x MSAA、bloom、1024 阴影）；点光源改固定池（每发炮弹一个灯 ⇒ 灯数变化触发全部着色器重编译 ⇒ 每开一枪卡一下，
  这是卡顿主因之一）；音效换 Kenney CC0 采样 + 混响 + 压缩器；开始界面 = 暂停菜单，含设置面板、加载条、帧时间；
  BGM 位置 `public/audio/bgm.mp3`（用户去 Suno 生成）。**改后还没有真人试过。**
- **视觉提升**（2026-09-13 晚）：六张 Codex 生图素材 + bloom 后处理 + 按墙长缩放 UV + 天幕 + 封面。
  Codex 跑的是 gpt-6-astra，生图工具报的模型名是 gpt-image 2.0，一张约 60 s。截图确认四个视角都对。
  **改后还没有真人看过。**
- **观战模式**（用户要「看两个机器人互相走位」）：T / 起始页按钮 / `?spectate`；蓝方用同一个大脑；导演镜头 +
  俯视；双方各 4 发、0.5 s 射速。做它时抓出两个人机死锁（坑 #7、#8）。**改后还没有真人再玩过**。
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
- 素材重生成：改 `assets-src/PROMPTS.md` → `codex exec --sandbox workspace-write < assets-src/PROMPTS.md`
  （`image_generation` 是 Codex stable feature，已开）→ `./scripts/convert-assets.sh`。
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
6. 「有视线」≠「有射击解」：视线用零宽射线、射击解用炮弹半径膨胀后的墙。两台人机曾在 13 m 外面对面
   永久站定（都以为有视线、都没有解）。凡是给人机打分的几何判断，一律用 `shellWalls`。
7. 人机炮塔被腿「带着转」只能在**移动时**生效：站立时腿会转向炮塔，若此时也带动炮塔，两者会互相追着原地转。
8. 快进模拟（`rma.drive` 一帧推几十秒）会在一帧里制造上百个命中/反弹事件，每个事件一个 PointLight 就把
   渲染拖死（截图 30 s 超时）。FX 灯光已封顶 8 个；快进后先 `waitForTimeout` 再截图。
9. 墙顶灯带曾是一块和墙顶同尺寸的发光薄板，把整个墙顶盖成亮蓝色，从第一版起所有截图里「墙顶太亮」都是它，
   不是光照。现在是沿四边的细边框（合并成一个 mesh）。
10. 未加载完成的贴图渲染成**黑色**而不是「无贴图」：`map` 一律在 load 回调里再赋值（`getTexture`），
    缺文件时保留平色。bloom 阈值要高于被照亮表面的线性亮度（现在 1.35，太阳 1.3 + 天光 1.5），
    否则阳光面整片发光；只让 HDR 自发光体（倍率 1.5–2.0）过阈值。
11. three 的 lit shader 按场景灯数编译：灯的数量一变就全部重编译。⛔ 别按事件增删 PointLight，用固定池、
    用 intensity 0 表示空闲。改画质时允许变一次。
12. 无头 Chromium 的帧时间（swiftshader 软渲染 ~200 ms）说明不了真机性能；性能结论只能来自真机
    「Show frame time」读数。
13. 驾驶舱枪模型挂在相机下面：任何用导演相机的模式（观战、attract）都要显式 `setViewmodelVisible(false)`，
    否则大灰块出现在画面右下角（attract 第一版就是这样）。
14. 无头 Chromium 里 `requestPointerLock` 必失败（WrongDocumentError），所以 Play→锁定→Esc→Resume 这条链
    在无头里走不通，只能真机验。
15. 无头 Chromium（swiftshader）截图偶发整页发白、HUD 半透明、左上角一个破图标 —— 同一状态再截一次就正常。
   是合成器偶发不是产品问题；判定前先重截，⛔ 别按白图改渲染。
