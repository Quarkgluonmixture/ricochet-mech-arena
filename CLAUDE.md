# ricochet-mech-arena — 给 agent 的入口

## 接手顺序

1. `CHECKPOINT.md` — 当前现场；`GOTCHAS.md` — 编号稳定的现役陷阱，**动手前按「你要动哪一块」挑读**。
2. `docs/VISION.md` — **用户想要什么的最高层 authority**。判断拿不准先对照它，写明用了哪一节。
3. `docs/ROADMAP.md` — 阶段唯一真相；别处只放一行 cursor。
4. `README.md` — **当前已 ship** 的规则 / 控制 / 架构。

## Authority 规则

- 方向冲突：`VISION > ROADMAP > 当前实现`。
- **平面锁定 + 只弹墙**（VISION §3）是承重决策：⛔ 不加跳跃、蹲、坡道、地板/天花板反弹。
- **人机契约**（VISION §4）：人机与玩家共用同一套运动模型；只读几何真相（位置/速度/墙/在飞炮弹），
  ⛔ 不读玩家输入。人机只能被几何打死；难度旋钮是墙和在飞弹数，不是反应时间。
- `src/sim/` 不得 import three；渲染只在 `src/render/`、`src/ui/`。测试跑在 node 上只碰 sim。
- 素材只进渲染层，sim 不依赖；删掉 `public/textures/` 游戏必须照常能玩（VISION §6）。生成 prompt 在
  `assets-src/PROMPTS.md`，重生成 = 改 prompt 重跑 Codex 生图，⛔ 别手修 PNG。

## Git / ops

- 提交按显式路径 stage。push 走个人号（仓库本地 credential helper 已钉死 `Quarkgluonmixture`）；
  ⛔ 不要 `gh auth switch`。要用个人号调 API：`GH_TOKEN=$(gh auth token --user Quarkgluonmixture) gh ...`。
- Node ≥ 22.6 直跑 TS：源码只用可擦除语法（`erasableSyntaxOnly`），import 带 `.ts` 后缀。
- 改样式 / 相机后必须真实页面截图验证（方法见 CHECKPOINT「Ops 速查」）。
