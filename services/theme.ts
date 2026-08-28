export type ThemeId =
  | 'tech-blue'
  | 'dream-pink'
  | 'forest-green'
  | 'violet'
  | 'sunset-orange'
  | 'golden'
  | 'cherry-rose';

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  primary: string;
  accent: string;
}

export const THEMES: ThemeDefinition[] = [
  { id: 'tech-blue', name: '科技蓝', primary: '#3D9EFF', accent: '#24F7FF' },
  { id: 'forest-green', name: '森林绿', primary: '#5EFFB8', accent: '#00FFA3' },
  { id: 'dream-pink', name: '梦幻粉', primary: '#FF8FB0', accent: '#FF6B9D' },
  { id: 'violet', name: '罗兰紫', primary: '#C77DFF', accent: '#B478FF' },
  { id: 'sunset-orange', name: '曜日橙', primary: '#FFB347', accent: '#FF9F40' },
  { id: 'golden', name: '鎏金色', primary: '#FFD970', accent: '#FFC845' },
  { id: 'cherry-rose', name: '樱绯红', primary: '#FF7070', accent: '#FF5252' },
];

export const DEFAULT_THEME: ThemeId = 'tech-blue';
export const THEME_STORAGE_KEY = 'huishi:theme';

const VALID_THEME_IDS = new Set<string>(THEMES.map((theme) => theme.id));

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && VALID_THEME_IDS.has(value);
}

export function getThemeById(id: string | null | undefined): ThemeDefinition {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}

export function getStoredTheme(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeId(saved) ? saved : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(id: ThemeId): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = id;
  }
}

export function persistTheme(id: ThemeId): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}