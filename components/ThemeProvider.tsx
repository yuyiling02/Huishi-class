import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  applyTheme,
  DEFAULT_THEME,
  getStoredTheme,
  getThemeById,
  isThemeId,
  persistTheme,
  type ThemeDefinition,
  type ThemeId,
} from '../services/theme';

interface ThemeContextValue {
  theme: ThemeId;
  themeDef: ThemeDefinition;
  setTheme: (id: ThemeId, opts?: { remote?: boolean }) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

async function persistToServer(id: ThemeId): Promise<void> {
  try {
    await fetch('/api/theme', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ theme: id }),
    });
  } catch {
    /* 未登录或网络异常时静默忽略，本地仍会保存 */
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    const stored = getStoredTheme();
    applyTheme(stored);
    return stored;
  });

  const setTheme = useCallback((id: ThemeId, opts?: { remote?: boolean }) => {
    const next = isThemeId(id) ? id : DEFAULT_THEME;
    applyTheme(next);
    persistTheme(next);
    setThemeState(next);
    if (!opts?.remote) void persistToServer(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, themeDef: getThemeById(theme), setTheme }),
    [theme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme 必须在 ThemeProvider 内使用');
  return ctx;
}