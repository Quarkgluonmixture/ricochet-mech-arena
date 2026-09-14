# LOG（append-only）

## 2026-09-13 — 建仓

- 用户在对话里定下：做 3D FPV 版「弹墙炮弹 + 完美闪避人机」，载具从坦克换成战甲。
  理由写在 `docs/VISION.md` §2：2D 版的坦克本来就是任意方向瞬移的圆片，FPV 下真履带坦克不能横移，
  玩家就闪不开，对称性断掉。
- 承重决策：平面锁定、只弹墙（§3）。人机的完美闪避因此是 2D 搜索，玩家也能像俯视时一样推算反弹。
- 一版不要素材（§6）：几何体拼战甲，WebAudio 合成音效。

## 2026-09-13 — M0 可玩版

- 模拟层（`src/sim/`）不 import three，12 个 vitest 全绿。人机契约的两半都有测试：开阔地躲直射；
  1.6 m 窄走廊躲不开必死。反弹解用真实炮弹模型飞一遍验证「恰好一次反弹到达」。
- 无头 Chromium 实测（脚本玩家，完美直射、横移、20 s 40 发）：人机 0 次被击中；人机 1.2 s 首发、
  1.6 s 击杀不会躲的脚本玩家；站桩玩家 9.2 s 被走廊墙反弹打死。
- 第一版截图三处返工：光太暗（three r185 物理光强）、出生点正对墙（改成沿最长空走廊朝向）、
  第三人称贴脸（抬高并在被墙挡时向上爬）。
- 人机开火修复：反弹解加「离当前炮塔朝向近」的代价，否则目标一动解就换墙、炮塔永远追不上。
- 没有用任何外部素材（VISION §6）。

## 2026-09-13 — 建远端 + 第一次真人反馈

- 用户授权后建了 GitHub public 仓 + Pages（Actions 部署，首次 45 s 成功）。
- 真人试玩三条反馈：太难 / FPV 找不到人 / 第三人称子弹少看不出走位。根因是 FPV 把 2D 版的「全知」
  拿掉了（VISION §5 早就写了这是要还的债）。修法不是加难度档，是把信息还回去：矮墙（挡弹不挡视线）、
  头顶标记、视野外方位距离、雷达边缘钉标、地面走位光带；子弹 4 → 8 让人机被迫连续走位；人机射速放缓。
- 无头验证：FPV 弹幕 8 发在飞、人机剩 10/17 安全走位；第三人称弹幕人机一度只剩 1/17。

## 2026-09-13 — 第二轮真人反馈（线上版）

- 四条：墙面杂纹 / 死后对面还能被补刀 / 贴墙与离墙开火穿墙 / 转身时上半身要一起转。
- 杂纹 = 阴影痤疮（加 `normalBias` 0.08、缩小阴影视锥）+ 墙顶灯带与墙顶面共面 z-fighting（灯带抬到墙顶之上）。
  阴影在 swiftshader 里复现不了，按标准修法处理，等真机再看。
- 补刀 = 回合没有终态：改成首杀定胜负，同一步内互相命中算平局；人机对手死后继续走位但不开火。
- 穿墙 = 炮口点在墙内（坑 #4）。出膛点钳到墙前 0.02 m；射击解全部从机体中心起算射线；`advanceShell`
  加「子弹在墙内即销毁」兜底。无头 20 s 采样 258 次零穿墙。
- 炮塔耦合：腿转多少炮塔跟多少，回正 7 rad/s，射界 ±100°，站立时腿原地转向炮塔。侵略性从 20 s 7 发降到
  15 s 3–4 发，首杀从 1.6 s 变 10.8 s；用户本来就嫌难，方向一致。

## 2026-09-13 — 观战模式

- 用户要看两台机器互相走位。加 AI vs AI：蓝方复用同一大脑，导演镜头（站在两机连线的侧面、按间距拉远、
  只在已在的一侧不翻面）+ 俯视镜头；T / 按钮 / `?spectate` 进入。
- 第一版两台人机各开一枪后永久对峙：视线判断用零宽射线而射击解用炮弹尺寸的墙，都以为有视线、都没解、都站着。
  修：打分用 `shellWalls`；无解超过 0.8 s 进入「找角度」状态（站立扣分 + 向目标逼近）；有解且无威胁时
  「停下来打」加分。90 s 从 1+1 发变成 106+105 发、3 回合。
- 顺手修：站立时腿转向炮塔不能反过来带动炮塔（否则原地互追打转）；FX 点光源封顶 8 个。

## 2026-09-13 — 视觉提升（Codex 生图）

- 用户要整体视觉提升并指定用 Codex 调 GPT Image。探针：`codex exec` + `image_generation`（stable 已开）
  一张 1024² 约 60 s，工具报模型名 gpt-image 2.0（用户说的 2.5 不可选）。六张素材一次 session 生成
  （地板/舱壁/墙顶/装甲/机库天幕/封面），prompt 存 `assets-src/PROMPTS.md`，原图入库、JPEG 进 `public/`。
- 代码侧：EffectComposer + UnrealBloomPass + OutputPass（MSAA 4x HalfFloat 目标）；贴图按固定米数平铺
  （按 BoxGeometry 逐面缩放 UV）；等距柱状天幕兼环境光；自发光体走 HDR 倍率。
- 第一版 bloom 炸白（强度 0.55 / 阈值 1.0 + 太阳 2.2）：炮弹成光球、枪口和墙顶全白。收到 0.32 / 1.35，
  太阳 1.3。顺带发现墙顶「亮蓝」的真正原因是灯带薄板盖满墙顶（坑 #9）。
- VISION §6 改写：素材允许但只进渲染层、可重生成、无文字、哑光。

## 2026-09-13 — 性能、音效、开始界面

- 用户：有点卡、音效垃圾、要做完整开始界面、BGM 自己去 Suno 生成。
- 卡顿三因：Retina 全像素比 + 4x MSAA 半浮点目标 + bloom；每发炮弹/每次反弹一个 PointLight ⇒ 灯数一变
  全部 lit shader 重编译 ⇒ 每开一枪一个 hitch；每块碎片一个新材质。修：画质三档（默认 Medium）、
  灯改固定池（炮弹 4–6 盏跟随最新的弹，闪光 4 盏）、碎片共用材质。
- 音效：Kenney CC0 三个包（Sci-Fi / Impact / Interface），ffmpeg 转 AAC，25 个文件 272 KB；
  fire 叠一个合成低频 thump；每发炮弹一条循环引擎 hum；混响 + 压缩器；UI 音。合成音全部下线。
- 开始界面：封面 + 加载条 + Play/Watch/Settings + 控制说明 + 设置面板（画质/音量/鼠标/帧时间）+ 音乐状态；
  Esc 回菜单时主按钮变 Resume；设置存 localStorage。
- 真机性能没法在无头里量（swiftshader 200 ms/帧），交给用户用「Show frame time」看。

## 2026-09-13 — 开始界面重做 + Suno prompt

- 用户：开始界面「有点廉价」；要 Suno 的 style prompt。
- 廉价的来源：系统字体、居中卡片、标准按钮、静态海报当背景。改成游戏菜单的语法：左对齐大标题（专用展示字体）、
  竖排菜单带侧边高亮条和悬停提示、右侧滑出面板、菜单后面是真实场景的 attract 模式（AI vs AI + 导演镜头慢转）。
  封面图降级为加载 splash（1.4 s 淡出）。
- BGM：无缝循环用两段重叠 2.5 s 交叉淡入实现；`menu.mp3`（可选）在第一次点击/按键时起，`bgm.mp3` 在 Play/Watch
  时淡入；暂停时音乐压到 35%、音效静音；attract 时音效 10%。
- Suno style prompt（给用户的版本）：
  - 对局：`dark industrial synthwave, mid-tempo 118 BPM, heavy analog bass pulse, mechanical percussion,
    metallic hits, tense arpeggios, cinematic sci-fi, instrumental, no vocals, steady energy, loopable, no fade out`
  - 菜单：`dark ambient sci-fi, slow sub-bass pulse, cavernous hangar reverb, soft synth pads, sparse metallic
    percussion, brooding, instrumental, no vocals, loopable, no build-ups`

## 2026-09-13 — 接入 Suno 音乐

- 用户给了两首：第一首从头当菜单曲；第二首 17–33 s 是 intro、33 s 起是战斗段。Downloads 里当时只有第一首
  《Hangar Silence》（3:45，188 kbps），去掉内嵌封面后装为 `menu.mp3`。
- `playTrack` 加 `start`（首遍起点）/`loopStart`（后续每遍起点）：战斗曲首遍 17 s → 末尾，之后 33 s → 末尾循环，
  末尾 2.5 s 与下一遍交叉淡入。第二首文件未到，`bgm.mp3` 缺失时静默、菜单曲继续。

## 2026-09-13 — 第二首到位 + 弹墙音重做

- 《Chrome Pulse》装为 `bgm.mp3`（3:17，-15.0 LUFS，菜单曲 -14.3）。
- 用户：弹墙音「太脆，像敲玻璃杯」。用 ffmpeg `aspectralstats` 排全部候选样本的平均频谱质心：原来用的
  `impactMetal_light` 是全包最亮（2006 Hz）而且代码里还升了音高。换 sci-fi 包 `impactMetal`（384 Hz）做主体 +
  `impactMetal_heavy`（1078 Hz，0.17 s）做瞬态，音高 0.9 / 0.82，低通 2.6 k / 3.2 k，混响送 0.5。

## 2026-09-13 — 美术第二轮（机甲形态 + 场景）

- Codex（gpt-6-astra + 生图）先出一张正/侧视概念图（`assets-src/mech-concept.png`），再按图用 RoundedBoxGeometry
  重建机甲：每台约 45 个网格，关节/活塞/推进器/散热口都有；步态加膝盖弯曲和脚部反向补偿。
- 场景：地面延伸 apron、每 10 m 一根 8 m 高灯柱（合并成两个网格）、冷蓝暖橙两盏无阴影轮廓光、灯带和灯柱呼吸、
  360 粒漂浮尘埃、炮弹改为小热核 + 加色光晕精灵、CSS 暗角。
- 首版推进器和散热口待机时太亮（像两只眼睛 / 橙色贴纸），待机倍率降到 0.18 / 0.12，只在冲刺 / 开火时点亮。

## 2026-09-13 — 三条命

- 用户：人 vs AI 时人三条命，被打受击扣一命。实现：`hp/hpMax/invulnT` 进 Mech；`hitTest` 非致命命中扣命 + 无敌窗口
  并发 `fatal:false` 事件，回合不结束；观战/attract 时 `applyLives()` 把玩家 hpMax 压到 1。HUD 加命条（最后一命红色脉冲）、
  红色受击闪、无敌时蓝边光；镜头 `hurt()` 大震；受击音 = impactPlate_heavy + 低频 boom，最后一命加警报。
- 测试坑：无敌 1.2 s 用 float 步进累计，恰好等长时可能剩 2e-16 s 没归零，测试要多等 0.1 s。

## 2026-09-13 — 中英文切换（默认中文）

- 用户：设置里加中英文切换和音乐/音效调节（音量滑杆此前已有），默认中文。
- 一张表两种语言；静态 DOM 用 data 属性绑定、动态字符串用 `t()`；`<html lang>` 与 `body.zh` 随切换；
  Rajdhani 无 CJK 字形，中文按字回退到系统字体，因此中文时把字距收小。踩到一个 `t` 变量遮蔽导入的坑。

## 2026-09-13 — 3v3 团队战

- 模拟层：arena 解析 `B/R` 额外出生点；Mech 加 `team`；World 加 `score`、`alive/enemiesOf/matesOf`，团灭定回合，
  同步互灭算平；AI 加 `pickTarget`（距离 + 无射线罚 10 m）、`findFireSolution` 的 `mates` 参数（两段路径都不穿队友）、
  `planMove` 的队友间距惩罚。测试 20 条全过；两条写错的测试（视线罚分 vs 30 m 距离差、走廊里其实有绕队友的反弹解）
  是测试的错不是代码的错。
- 界面层：`main.ts` 重写成 roster（每台机 view/brain/marker/trail 一组），设置加对战规模（换规模 = 新比赛），
  雷达画全员、威胁环指向最近敌人、导演镜头框全场（最远两点定站位），击杀播报，玩家先死切导演镜头。

## [2026-09-13 22:47] session 收尾：M3 团队战已上线，快照瘦身，坑拆出 GOTCHAS  #ship #decision
- 截至 2026-09-13 22:47 线上 = 3v3 默认（设置可切 1v1/2v2）、默认中文、三条命、Codex 生图素材 + 概念图重建机甲、
  Kenney 采样音效 + 两首 Suno 曲、attract 菜单、观战。全部由无头 Chromium 验证；⚠ 今天下午之后的所有改动
  （矮墙之后）没有一项经真人再玩，真人验证清单在 TODO。
- 快照里堆了一天的逐块历史，全部驱逐到本 LOG（各条目已在上面），CHECKPOINT 重写成接手页。
- 坑从 15 条起拆出 `GOTCHAS.md`：编号沿用 1–15 不重排；#4（穿墙）、#8（FX 灯洪水）、#9（墙顶薄板）已有闸或已根治，
  退休成墓碑；#2 的具体光强数字已过期，改写成机制。
- 决策（今天定的，写入 memory）：团队战默认 3v3；人 3 命 / AI 1 命是难度杠杆不是 bug；UI 默认中文；
  素材只进渲染层且可从 prompt 重生成；观赏性下一步按 2（击杀慢镜头）→ 3（地形美术）→ 4（占点）。
- 下一步：等真人反馈；用户点头则做击杀慢镜头 + 播报镜头。

## [2026-09-13 22:55] 机甲碰撞体积、中文文案重写（Gemini）、菜单音乐开站渐入  #ship #decision
- 碰撞：`stepMotion` 加 `others` 圆-圆推开（含再撞墙校正），world 每步后对称消解剩余重叠，AI 预演把其他机甲当冻结障碍。
  无头 3v3 60 s 最小两机距离恒为 1.400（= 半径和），测试 `mech collision` 锁住。
- 文案：用户嫌中文机翻味重，指定用 agy 的 Gemini 3.8 Flash 重写。跑法：85 条 key 连同英文原文和旧中文内联进 prompt，
  `--output-format json --json-schema` 强制 85 键 JSON（⚠ `--json-schema` 必须配 `--output-format json`），high effort 2 分钟。
  结果用「跳弹」替代「反弹弹」、「目标击毁 / 机体被击毁 / 友军误伤 / 规避路径」等；占位符与 HTML 校验全过。
  我只改了一处：致命横幅 `b.hit` 从「机体受创」改成「机体被击毁」（那是死亡不是受伤）。旧表在 LOG 之外没有副本，
  要对比看 git 历史。
- 音乐：页面打开时 `tryAutostart()` 尝试 resume AudioContext，成功则菜单曲 4 s 渐入；浏览器拦截（首次访问的站点）
  就退回第一次点击/按键。无头两种 autoplay 策略都验过路径。

## [2026-09-13 23:00] PvE 固定 1v1、EvE 阵容独立、集火 + 交叉火力、命条右上  #decision #ship
- 用户问「3v3 究竟在对抗什么，队友的弹也得躲？」。诚实答案：此前是三个独立的 1v1 大脑，只有不穿队友开枪和拉开距离；
  跳弹对所有人生效、AI 本来就躲全部炮弹。改成：`pickTarget` 对队友正在打的目标减 6 m（集火）；`planMove` 奖励与队友
  相差 90° 的进攻方位（交叉火力，最大 +1.2）。理由回到 VISION §4：完美闪避只能被几何打死，两条方向不同的弹道才能
  切掉安全走位。
- 用户要 PvE / EvE 分开：Play 固定 1v1（回到 VISION §1 的决斗），观战与 attract 用设置里的「观战阵容」。进观战即结束
  人类对局（Play 重新开一局）。
- 命条从底部中央挪到右上角，AI 读数下移一行。

## [2026-09-13 23:04] session 收尾（第二次）：PvE/EvE 分离后的现场  #ship
- 截至 2026-09-13 23:04 线上 = Play 固定 1v1 三条命；观战 / attract 用「观战阵容」（默认 3v3，AI 集火 + 交叉火力）；机甲有碰撞体积；
  中文文案为 Gemini 3.8 Flash 重写版；菜单音乐开站尝试渐入；命条右上。今天下午之后的改动仍无真人验证。
- 坑 +1（#16）：`buildRoster` 会整体换掉 `world` / `player` 对象，任何缓存下来的引用都会指向旧世界。
- 下一步不变：等真人反馈 → 观赏性 2（击杀慢镜头）。

## [2026-09-13 23:24] 观赏性 2：击杀慢镜头 + 导演镜头聚焦  #ship #decision #measure
- 做法：`src/ui/slowmo.ts` 纯函数包络（0.25×，attack 0.06 / hold 0.85 / release 0.4 真实秒，二次触发从当前速度续接不回弹）；
  主循环两套时钟 `dt`（屏幕）/ `sdt`（世界）；`SpectatorCamera.focus()` 甩镜头（lerp 7/10 vs 常态 3/4，D≈6 m、高 4.1 m，
  看点 62% 偏受害者）；音频 hum 变速 + 世界一次性音效变调 + 音乐低通 20 kHz→~900 Hz；HUD 黑边 7vh + 字幕（attract 不出黑边）；
  弹尾改按 0.2 m 距离采样，否则慢放里彗尾缩成 1/4。killcam 存 mech id 不存对象（GOTCHAS #16）；round 事件和 buildRoster 都清。
- 决策：慢放对所有击杀生效（含 3v3 中途击杀、attract 后台），镜头甩只在导演模式，驾驶舱里只拉长时间保留操控；非致命受击不慢放。
- 决策（截图逼出来的）：**光走屏幕时间、物质走世界时间**——命中爆闪球按世界时间在慢放里成了 1.8 s 半透明圆顶罩住残骸，
  改成 `fx.update(dt, sdt)`：爆闪 / 光环 / 池灯用 dt，碎片用 sdt。⇒ GOTCHAS #18。
- 测量（无头 Chromium，swiftshader，帧约 0.4 s、dt 夹 0.1）：观战 3v3 自然击杀 timeScale 轨迹 1.00 → 0.25 × 9 帧 → 0.35 / 0.60 /
  0.86 → 1.00，`#killcam` className `bars on`、`--k` 0.871、字幕「击杀镜头 · ¼ 速」；PvE 自杀跳弹后 相机到残骸距离 32.6 → 6.0 m、
  高 4.1 m，focusing 全程 1，包络结束回到 D=48 的全场框。无头帧慢使包络在墙钟上拉长 3–4×，属族 B，不代表真机。
- 坑：无头 0.3 s 截图没黑边，className 却已是 `on` —— CSS transition 合成落后，0.9 s 才 opacity 1。⇒ GOTCHAS #17。
- 测试 +5（`tests/slowmo.test.ts`：卡在 <1 不回来、hold 时长、上下界、二次触发续接）；CLAUDE.md 的「测试只碰 sim」放宽为
  「sim + 不碰 DOM/three 的纯函数模块」。26 条全过，tsc 干净。
- 下一步：真人验证（TODO 第一节，含慢镜头 5 问）→ 观赏性 3 地形美术。

## [2026-09-14 12:05] 用户线上反馈三条：开站无声、慢放提前、默认 2v2  #ship #decision #measure #incident
- **开站无声（quarkspace.top 首访）**：不是回归，是 Chrome autoplay 按 origin 放行、新域名首访必静音到第一次点击。代码路径本来就有
  回退（pointerdown / keydown once）；这次只加了页脚提示「声音 · 点一下任意处开启」（`music.blocked`），被拦时代替曲名显示。
  ⇒ GOTCHAS #19。⚠ 无头 Chromium 即使加 `--autoplay-policy=user-gesture-required` 也不拦 → 被拦路径**没能无头验证**，tsc 过、逻辑一处。
- **慢放提前到命中前**（用户「再往前一点」）：新 `src/sim/predict.ts` 的 `predictImpacts(world, lead)` 每个模拟步把在飞炮弹按
  `hitTest` 同一套墙 / 半径 / 自伤武装规则往前扫 0.12 s（机甲按当前速度外推），致命命中就先 `slowmo.trigger()` 并把 killcam 指向
  受害者 + 射手；命中事件再 restart hold（0.85→0.7 s，因为 run-up 已占约 0.5 s 真实时间）。**AI 受害者只在 `lastSafe === 0` 时提前**
  ——有安全走位的 AI 多半会躲，否则每几秒一次慢放 near miss。5 条测试（直线命中 / 超出 lead / 侧移躲开 / 撞墙先死 / 自伤武装 / 无敌 & 回合已定）。
- 测量（无头，`drive` 逐步）：人类最后一命、炮弹 3 m 外直冲 → 提前触发 t=0.075、命中 t=0.192，**lead 0.1167 s**（目标 0.12）；
  AI 受害者同样布置 → 全程 `aiSafe=15`，未提前、也躲开了，无误触发。观战里 60 s 墙钟只跑出 12 s 模拟且零击杀，**误报率未测**，交真人。
- **观战阵容默认 2v2**（用户定，原 3v3）：`settings.ts` DEFAULTS 改 2，并加 VERSION=2 一次性迁移——每次保存都写整个对象，
  从未碰过阵容的老访客也存着 3。实测：无存储 → 2；v1 存 3 → 2 并回写 v:2；v2 存 3 → 保持 3。
- 顺手修的老 bug：`World.step` 开头清空 events，所以**直接调用** `resetRound()/resetMatch()`（R 键、Play、Watch）推进去的 `round`
  事件从未被 `handleEvents` 处理——trail 不重置、yaw 不同步、击杀镜头残留到重生机上。抽出 `onRound()`，手动重置走
  `resetRoundNow()/resetMatchNow()`。无头按 R：慢放 active → false、killcam → null。
- 部署：重新 build → 重拷进 quarkspace 仓 `public/`。⚠ 那边 webhook 是否已修未知，push 后要看线上哈希。
