# CHECKPOINT — ricochet-mech-arena

## 现场（2026-09-13）

- 仓库刚建。cursor 在 `docs/ROADMAP.md` **M0**。
- 决策已定型在 `docs/VISION.md`：战甲不是坦克（§2）、平面锁定只弹墙（§3）、人机契约（§4）、
  FPV 的补偿项（§5）、一版零素材（§6）。

## 接手

1. 读 `docs/VISION.md` 全文（短）。
2. `npm install && npm run dev`。
3. 看 `docs/ROADMAP.md` M0 的 exit 条件。

## Ops 速查

- 本仓不装 playwright，借 `../evofootball-arena/node_modules/playwright` 做截图验证；
  起 `npx vite --port <空闲端口> --strictPort`，先 `curl | grep "<title>Ricochet"` 确认端口上是本项目。
- 推送：仓库本地 credential helper 钉死个人号 ⇒ 直接 `git push`。⛔ 不要 `gh auth switch`。
