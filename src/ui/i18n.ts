/**
 * Two languages, one table. Static DOM text is bound with data-i18n (textContent) or data-i18n-html
 * (innerHTML, only for strings from this file that carry our own markup); dynamic strings go through t().
 * Chinese is the default (user, 2026-09-13).
 */
export type Lang = 'zh' | 'en';

const EN = {
  'menu.eyebrow': 'A duel of geometry',
  'menu.lede': 'Direct shots never land on it. It moves exactly as fast as you do, and no faster. Bounce a shell off a wall, corner it, make two shells meet. It does the same to you.',
  'menu.play': 'Play',
  'menu.resume': 'Resume',
  'menu.play.hint': 'first person · Esc opens this menu',
  'menu.watch': 'Watch AI vs AI',
  'menu.watch.hint': 'both mechs on the same brain',
  'menu.settings': 'Settings',
  'menu.settings.hint': 'quality · sound · mouse · language',
  'menu.loading': 'Loading',
  'key.move': 'move', 'key.aim': 'aim', 'key.fire': 'fire', 'key.dash': 'dash', 'key.camera': 'camera', 'key.spectate': 'spectate', 'key.reset': 'reset',
  'key.mouse': 'Mouse', 'key.click': 'Click',
  'foot.build': 'build {date}',
  'foot.sound': 'sound · Kenney CC0',
  'music.none': 'music · none',
  'music.track': 'music · {name}',
  'set.title': 'Settings',
  'set.language': 'Language',
  'set.quality': 'Quality',
  'set.q.low': 'Low · no bloom, no shadows',
  'set.q.medium': 'Medium',
  'set.q.high': 'High · full Retina, 4x MSAA',
  'set.sfx': 'Effects',
  'set.music': 'Music',
  'set.mouse': 'Mouse',
  'set.fps': 'Show frame time',
  'set.note': 'Music: put a looping track at <code>public/audio/bgm.mp3</code>, optionally <code>menu.mp3</code> for this screen.',
  'set.done': 'Done',
  'spec.help': 'AI vs AI &nbsp;·&nbsp; drag to orbit &nbsp;·&nbsp; wheel to zoom &nbsp;·&nbsp; <b>V</b> top-down &nbsp;·&nbsp; <b>Esc</b> back to the cockpit',
  'cam.first': '1st · V',
  'cam.third': '3rd · V',
  'hud.aiSafe': 'AI safe moves {n}/{total}',
  'hud.trapped': ' — trapped',
  'hud.safeBoth': 'BLUE safe moves {b}   ·   RED safe moves {r}',
  'hud.safeDash': '—',
  'hud.safeTrapped': ' trapped',
  'fps': '{ms} ms · {fps} fps',
  'b.hit': 'HIT',
  'b.kill': 'KILL',
  'b.ownGoal': 'OWN GOAL',
  'b.itShotItself': 'IT SHOT ITSELF',
  'b.redScores': 'RED SCORES',
  'b.blueScores': 'BLUE SCORES',
  'b.blueOwnGoal': 'BLUE OWN GOAL',
  'b.redOwnGoal': 'RED OWN GOAL',
  'h.ownRicochet': 'Your own ricochet came back.',
  'h.itsOwnRicochet': 'Its own ricochet.',
  'h.itsOwnRicochetBack': 'Its own ricochet came back.',
  'h.bankFrom': 'Bank shot from {dir}.',
  'h.directKeepMoving': 'Direct hit. Keep moving.',
  'h.direct': 'Direct hit.',
  'h.bankNeverSaw': 'Bank shot. It never saw it coming.',
  'h.cornered': 'Cornered. It had nowhere left to go.',
  'h.livesLeft': '{n} lives left. {how}',
  'h.lastLife': 'Last life. {how}',
  'dir.front': 'the front', 'dir.behind': 'behind', 'dir.right': 'the right', 'dir.left': 'the left',
};

const ZH: Record<keyof typeof EN, string> = {
  'menu.eyebrow': '弹射机甲竞技场 · 几何的决斗',
  'menu.lede': '直射永远打不中它。它的速度和你完全一样，不多不少。让炮弹弹墙、把它逼进死角、让两发炮弹同时到达。它也会这么对你。',
  'menu.play': '开始',
  'menu.resume': '继续',
  'menu.play.hint': '第一人称 · Esc 打开菜单',
  'menu.watch': '观看 AI 对战',
  'menu.watch.hint': '两台机甲用同一个大脑',
  'menu.settings': '设置',
  'menu.settings.hint': '画质 · 声音 · 鼠标 · 语言',
  'menu.loading': '加载中',
  'key.move': '移动', 'key.aim': '瞄准', 'key.fire': '开火', 'key.dash': '冲刺', 'key.camera': '视角', 'key.spectate': '观战', 'key.reset': '重置',
  'key.mouse': '鼠标', 'key.click': '点击',
  'foot.build': '构建 {date}',
  'foot.sound': '音效 · Kenney CC0',
  'music.none': '音乐 · 无',
  'music.track': '音乐 · {name}',
  'set.title': '设置',
  'set.language': '语言',
  'set.quality': '画质',
  'set.q.low': '低 · 无泛光、无阴影',
  'set.q.medium': '中',
  'set.q.high': '高 · 全分辨率、4x MSAA',
  'set.sfx': '音效',
  'set.music': '音乐',
  'set.mouse': '鼠标',
  'set.fps': '显示帧时间',
  'set.note': '音乐：把循环曲目放到 <code>public/audio/bgm.mp3</code>，菜单曲可选 <code>menu.mp3</code>。',
  'set.done': '完成',
  'spec.help': 'AI 对战 &nbsp;·&nbsp; 拖动环绕 &nbsp;·&nbsp; 滚轮缩放 &nbsp;·&nbsp; <b>V</b> 俯视 &nbsp;·&nbsp; <b>Esc</b> 回到驾驶舱',
  'cam.first': '第一人称 · V',
  'cam.third': '第三人称 · V',
  'hud.aiSafe': 'AI 安全走位 {n}/{total}',
  'hud.trapped': ' — 被困',
  'hud.safeBoth': '蓝方安全走位 {b}   ·   红方安全走位 {r}',
  'hud.safeDash': '—',
  'hud.safeTrapped': ' 被困',
  'fps': '{ms} 毫秒 · {fps} 帧',
  'b.hit': '被击中',
  'b.kill': '击杀',
  'b.ownGoal': '乌龙',
  'b.itShotItself': '它打中了自己',
  'b.redScores': '红方得分',
  'b.blueScores': '蓝方得分',
  'b.blueOwnGoal': '蓝方乌龙',
  'b.redOwnGoal': '红方乌龙',
  'h.ownRicochet': '你自己的反弹弹飞回来了。',
  'h.itsOwnRicochet': '它自己的反弹弹。',
  'h.itsOwnRicochetBack': '它自己的反弹弹飞回来了。',
  'h.bankFrom': '来自{dir}的反弹弹。',
  'h.directKeepMoving': '直射命中。保持移动。',
  'h.direct': '直射命中。',
  'h.bankNeverSaw': '反弹弹。它根本没看见。',
  'h.cornered': '逼进死角。它无路可走。',
  'h.livesLeft': '还剩 {n} 条命。{how}',
  'h.lastLife': '最后一条命。{how}',
  'dir.front': '正面', 'dir.behind': '后方', 'dir.right': '右侧', 'dir.left': '左侧',
};

const TABLES: Record<Lang, Record<string, string>> = { en: EN, zh: ZH };
let current: Lang = 'zh';

export function getLang(): Lang { return current; }

export function t(key: keyof typeof EN, params?: Record<string, string | number>): string {
  let s = TABLES[current][key] ?? EN[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Rebind every data-i18n / data-i18n-html element and the document language. */
export function setLang(lang: Lang): void {
  current = lang;
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.body.classList.toggle('zh', lang === 'zh');
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent = t(el.dataset.i18n as keyof typeof EN);
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml as keyof typeof EN);
}
