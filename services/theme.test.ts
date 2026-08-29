import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_THEME,
  THEMES,
  getStoredTheme,
  getThemeById,
  isThemeId,
} from './theme.ts';

test('classic blue is the first and default theme', () => {
  assert.equal(DEFAULT_THEME, 'classic-blue');
  assert.equal(THEMES[0]?.id, 'classic-blue');
  assert.deepEqual(THEMES[0], {
    id: 'classic-blue',
    name: '经典蓝',
    primary: '#3D81E3',
    accent: '#00D2FF',
  });
});

test('classic blue is accepted while unknown theme ids are rejected', () => {
  assert.equal(isThemeId('classic-blue'), true);
  assert.equal(isThemeId('tech-blue'), true);
  assert.equal(isThemeId('unknown-blue'), false);
  assert.equal(isThemeId(null), false);
});

test('theme lookups and storage fallback use classic blue', () => {
  assert.equal(getThemeById('tech-blue').id, 'tech-blue');
  assert.equal(getThemeById('unknown-blue').id, 'classic-blue');
  assert.equal(getThemeById(null).id, 'classic-blue');
  assert.equal(getStoredTheme(), 'classic-blue');
});
