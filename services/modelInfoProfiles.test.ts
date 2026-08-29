import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BUILTIN_MODEL_SEED_KEYS,
  getModelInfoProfile,
  MODEL_INFO_PROFILES,
  MODEL_SEED_KEY_BY_URL,
} from './modelInfoProfiles.ts';

test('19 个内置资源均有稳定且完整的模型说明', () => {
  assert.equal(BUILTIN_MODEL_SEED_KEYS.length, 19);
  assert.equal(new Set(BUILTIN_MODEL_SEED_KEYS).size, 19);
  assert.equal(Object.keys(MODEL_SEED_KEY_BY_URL).length, 19);

  for (const seedKey of BUILTIN_MODEL_SEED_KEYS) {
    const profile = getModelInfoProfile(seedKey);
    assert.ok(profile, seedKey);
    assert.equal(profile.seedKey, seedKey);
    assert.ok(profile.title);
    assert.ok(profile.subtitle);
    assert.ok(profile.description);
    assert.ok(profile.illustration);
    assert.ok(profile.metrics.length >= 4);
    assert.equal(profile.tips.length, 2);
  }
});

test('只有现有心脏和 9 个新器官拥有器官工具能力', () => {
  const organTools = Object.values(MODEL_INFO_PROFILES)
    .filter((profile) => profile.capabilities.organTools)
    .map((profile) => profile.seedKey)
    .sort();

  assert.equal(organTools.length, 10);
  assert.deepEqual(organTools, [
    'bio-heart',
    'bio-organ-brain',
    'bio-organ-eyeball',
    'bio-organ-heart',
    'bio-organ-intestine',
    'bio-organ-kidneys',
    'bio-organ-liver',
    'bio-organ-lungs',
    'bio-organ-pancreas',
    'bio-organ-skin',
  ]);
});
