# CHECKPOINT — ricochet-mech-arena

## 现场（截至 2026-09-13 深夜）

- **线上可玩**：<https://quarkgluonmixture.github.io/ricochet-mech-arena/>。默认 3v3 团队战（设置可切 1v1/2v2）、
  默认中文、人 3 命 / AI 1 命、Codex 生图素材 + 按概念图重建的机甲、Kenney 采样音效 + 两首 Suno 曲、
  attract 菜单、观战模式、击杀播报。规则与操作以 `README.md` 为准。
- **cursor**：`docs/ROADMAP.md` → M3 已 ship；下一步 = 观赏性方向 2（击杀慢镜头），见 `TODO.md`。
- ⚠ **今天下午之后的改动没有一项经真人玩过**（矮墙之后的全部）。真人验证清单在 `TODO.md` 第一节，
  先让用户玩，再决定改什么。
- 远端 = GitHub `Quarkgluonmixture/ricochet-mech-arena`（public），Pages 接 Actions，只有动了代码才部署
  （`docs/**`、`**.md` 被 paths-ignore）。

## 接手

1. 扫 `GOTCHAS.md`（动手前必读，按你要动哪一块挑读）。
2. 读 `docs/VISION.md`（短，全文；§3 平面锁定、§4 人机契约、§4c 三条命、§6 素材规则是承重的）。
3. `npm install && npm run dev`，进菜单先看 30 秒 attract，再按「开始」玩两回合。
4. 要改人机：`src/sim/ai.ts`；要改美术：`src/render/`；文案：`src/ui/i18n.ts`（⛔ 别在别处写死字符串）。

## Ops 速查

- **无头验证**：本仓不装 playwright，借 `../evofootball-arena/node_modules/playwright`（chromium 已装）。
  起 `npx vite --port <空闲端口> --strictPort --host 127.0.0.1`，先 `curl | grep "<title>Ricochet"` 确认端口上是本项目。
  页面上 `window.rma`：`drive(秒, {fire, move, torsoYaw, dash})` 不要 pointer lock 就推进模拟；`probe()` 拿位置/
  分数/存活数/人机 safe 数/draw calls；`spectate(on)` / `attract(on)` / `roster(1|2|3)`；`hud.setOverlay(false)`
  隐藏菜单；`mechs` / `slots`（每台机的 view/brain/marker/trail）。脚本形状：goto → waitForFunction(probe().drawCalls>0)
  → drive → waitForTimeout → screenshot。
- **推送**：仓库本地 credential helper 钉死个人号 ⇒ 直接 `git push`。⛔ 不要 `gh auth switch`。
  部署验证看线上 `index-*.js` 哈希是否等于本地 `dist/assets`，⛔ 别按 run 标题判断（标题会撞词）。
- **素材**：改 `assets-src/PROMPTS.md` → `codex exec --sandbox workspace-write < assets-src/PROMPTS.md`
  （Codex `image_generation` stable，约 60 s/张，工具报 gpt-image 2.0）→ `./scripts/convert-assets.sh`。
  机甲概念图 `assets-src/mech-concept.png`。
- **音效**：Kenney CC0 原包在 `/tmp/kenney`（会丢，重下见 LOG 2026-09-13「性能、音效」条）；ffmpeg 转 AAC 进
  `public/audio/sfx/`；文件名表在 `src/ui/audio.ts` 的 `SFX`。
- **音乐**：`public/audio/menu.mp3`、`bgm.mp3`；战斗曲 start/loopStart 偏移在 `src/main.ts` 的 `MUSIC`。
- Node ≥ 22.6 直跑 TS：`erasableSyntaxOnly`，⛔ 构造器参数属性（`constructor(private x)`）不能用。
- 测试：`npm test`（vitest，只碰 `src/sim/`，20 条）。改 AI 打分或几何后必跑；改渲染后必截图。

## 文档地图

- `docs/VISION.md` 最高层 authority；`docs/ROADMAP.md` 阶段唯一真相；`README.md` 只写已 ship 的。
- `LOG.md` append-only，标题带 `#decision/#measure/#deadend/#incident/#ship`，`grep -n '^## ' LOG.md` 出目录。
- `GOTCHAS.md` 现役陷阱，编号稳定；`TODO.md` 只放未来。
