import React, { useEffect, useRef, useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { THEMES, type ThemeId } from '../services/theme';
import { useTheme } from './ThemeProvider';

interface ThemeSwitcherProps {
  className?: string;
}

export default function ThemeSwitcher({ className }: ThemeSwitcherProps) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const pick = (id: ThemeId) => {
    setTheme(id);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative ${className || ''}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-cyan/45 bg-cyan-50/80 text-ink shadow-[0_0_18px_rgba(var(--theme-accent-rgb),0.22)] transition hover:border-cyan/75 hover:bg-cyan-50"
        aria-label="切换主题"
        title="切换主题"
        aria-expanded={open}
      >
        <Palette className="h-5 w-5 text-cyan" />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+10px)] z-[100] w-60 overflow-hidden rounded-2xl border border-line/12 bg-cyan-50/95 p-2 shadow-2xl shadow-black/60 backdrop-blur-xl">
          <div className="px-3 pb-2 pt-1.5 text-xs font-semibold uppercase tracking-widest text-ink/45">
            选择主题配色
          </div>
          <div className="grid grid-cols-1 gap-1">
            {THEMES.map((item) => {
              const active = item.id === theme;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => pick(item.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm transition ${
                    active ? 'bg-white/8 text-ink' : 'text-ink/75 hover:bg-white/6 hover:text-ink'
                  }`}
                >
                  <span
                    className="relative grid h-6 w-6 shrink-0 place-items-center rounded-full ring-1 ring-white/15"
                    style={{ background: `linear-gradient(135deg, ${item.primary}, ${item.accent})` }}
                  >
                    {active && <Check className="h-3.5 w-3.5 text-ink drop-shadow" />}
                  </span>
                  <span className="flex-1 font-medium">{item.name}</span>
                  {active && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ink/40">当前</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}