import { readFileSync, writeFileSync } from 'node:fs';

const RGBA_RULES = [
  ['rgba(0, 210, 255,', 'rgba(var(--theme-accent-rgb),'],
  ['rgba(0,210,255,', 'rgba(var(--theme-accent-rgb),'],
  ['rgba(61, 129, 227,', 'rgba(var(--theme-primary-rgb),'],
  ['rgba(61,129,227,', 'rgba(var(--theme-primary-rgb),'],
  ['rgba(39, 242, 255,', 'rgba(var(--theme-accent-rgb),'],
  ['rgba(39,242,255,', 'rgba(var(--theme-accent-rgb),'],
  ['rgba(63, 246, 255,', 'rgba(var(--theme-accent-rgb),'],
  ['rgba(63,246,255,', 'rgba(var(--theme-accent-rgb),'],
];

// 括号任意值（Tailwind 类名）里的强调色 -> 语义令牌（brand 主色 / cyan 高亮）
const BRACKET_TO_TOKEN = [
  ['#3D81E3', 'brand'],
  ['#3d81e3', 'brand'],
  ['#00d2ff', 'cyan'],
  ['#86e3ce', 'cyan'],
  ['#3ff6ff', 'cyan'],
  ['#22f4df', 'cyan'],
  ['#27f2ff', 'cyan'],
];

// 原始 CSS 里的裸 hex -> 变量
const CSS_HEX_TO_VAR = [
  ['#00d2ff', 'var(--theme-accent)'],
  ['#3D81E3', 'var(--theme-primary)'],
  ['#3ff6ff', 'var(--theme-accent)'],
  ['#86e3ce', 'var(--theme-accent)'],
  ['#22f4df', 'var(--theme-accent)'],
  ['#27f2ff', 'var(--theme-accent)'],
];

// 阴影任意值里的 _#hex] -> _var(...)]
const SHADOW_HEX = ['#00d2ff', '#86e3ce', '#3ff6ff', '#22f4df', '#27f2ff'];

function processTsx(content) {
  let changed = 0;
  const swap = (oldS, newS) => {
    const n = content.split(oldS).length - 1;
    if (n > 0) {
      content = content.split(oldS).join(newS);
      changed += n;
    }
  };

  for (const [hex, token] of BRACKET_TO_TOKEN) {
    swap(`-[${hex}]`, `-${token}`);
  }
  for (const [oldS, newS] of RGBA_RULES) {
    swap(oldS, newS);
  }
  for (const hex of SHADOW_HEX) {
    swap(`_${hex}]`, `_var(--theme-accent)]`);
  }
  return { content, changed };
}

function processCss(content) {
  let changed = 0;
  const swap = (oldS, newS) => {
    const n = content.split(oldS).length - 1;
    if (n > 0) {
      content = content.split(oldS).join(newS);
      changed += n;
    }
  };

  // rgba 替换不受影响（主题变量块内无 rgba）
  for (const [oldS, newS] of RGBA_RULES) {
    swap(oldS, newS);
  }

  // hex -> var 需按行处理，跳过主题变量定义行（--theme-*）
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].includes('--theme-')) continue;
    for (const [hex, value] of CSS_HEX_TO_VAR) {
      if (lines[i].includes(hex)) {
        lines[i] = lines[i].split(hex).join(value);
      }
    }
  }
  content = lines.join('\n');
  return { content, changed };
}

const targets = [
  { file: 'index.css', kind: 'css' },
  { file: 'Landing.tsx', kind: 'tsx' },
  { file: 'Login.tsx', kind: 'tsx' },
  { file: 'Dashboard.tsx', kind: 'tsx' },
  { file: 'components/UIComponents.tsx', kind: 'tsx' },
];

for (const { file, kind } of targets) {
  const original = readFileSync(file, 'utf8');
  const { content, changed } = kind === 'css' ? processCss(original) : processTsx(original);
  if (changed === 0) {
    console.log(`${file}: no changes`);
    continue;
  }
  writeFileSync(file, content, 'utf8');
  console.log(`${file}: ${changed} replacements`);
}