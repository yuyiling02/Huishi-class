import type { InteractionMode } from '../types.ts';

const lastMatchIndex = (text: string, pattern: RegExp): number => {
  let lastIndex = -1;
  for (const match of text.matchAll(pattern)) lastIndex = match.index;
  return lastIndex;
};

export const parseVoiceInteractionMode = (text: string): InteractionMode | null => {
  const normalized = String(text || '').replace(/[\s，。！？、,.!?；;：“”'‘’]/g, '');
  if (!normalized) return null;

  const singleIndex = lastMatchIndex(normalized, /单手(?:模式|控制|操作)?|一只手(?:模式|控制|操作)?|\b(?:single[ -]?hand|one[ -]?hand)\b/gi);
  const dualIndex = lastMatchIndex(normalized, /双手(?:模式|控制|操作)?|两只手(?:模式|控制|操作)?|\b(?:dual[ -]?hand|two[ -]?hands|both[ -]?hands)\b/gi);

  if (singleIndex < 0 && dualIndex < 0) return null;
  return singleIndex > dualIndex ? 'single' : 'dual';
};
