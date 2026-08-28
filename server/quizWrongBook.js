import express from 'express';

const MAX_QUESTION_TEXT = 4_000;
const MAX_OPTIONS_ITEMS = 8;
const MAX_OPTION_LENGTH = 200;
const MAX_EXPLANATION_LENGTH = 2_000;
const MAX_BATCH_ITEMS = 50;

const CATEGORY_PATTERN = /^(化学|生物|地理|少儿兴趣)$/;

function clampIndex(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 32) return 0;
  return number;
}

function clampBatchLength(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_BATCH_ITEMS);
}

function safeJson(value, fallback) {
  try {
    if (typeof value !== 'string') return value || fallback;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeOptions(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const clean = [];
  for (let i = 0; i < Math.min(list.length, MAX_OPTIONS_ITEMS); i += 1) {
    const text = String(list[i] ?? '').trim().slice(0, MAX_OPTION_LENGTH);
    if (text) clean.push(text);
  }
  return clean;
}

function normalizeCategory(raw) {
  const value = String(raw ?? '').trim();
  return CATEGORY_PATTERN.test(value) ? value : '其他';
}

function normalizeSubject(raw) {
  return String(raw ?? '').trim().slice(0, 64) || '未分类';
}

function normalizeQuestionText(raw) {
  return String(raw ?? '').trim().slice(0, MAX_QUESTION_TEXT) || '(题目内容缺失)';
}

function normalizeExplanation(raw) {
  return String(raw ?? '').trim().slice(0, MAX_EXPLANATION_LENGTH);
}

function normalizeQuestionId(raw) {
  return String(raw ?? '').trim().slice(0, 64) || `unknown-${Date.now().toString(36)}`;
}

function publicWrongEntry(row) {
  const options = safeJson(row.options_json, []);
  return {
    id: Number(row.id),
    questionId: row.question_id,
    subject: row.subject,
    category: row.category,
    question: row.question_text,
    options: Array.isArray(options) ? options : [],
    userAnswerIndex: Number(row.user_answer_index ?? -1),
    correctIndex: Number(row.correct_index ?? 0),
    explanation: row.explanation || '',
    wrongCount: Number(row.wrong_count ?? 1),
    mastered: Boolean(row.mastered),
    firstWrongAt: row.first_wrong_at,
    lastWrongAt: row.last_wrong_at,
  };
}

export async function initializeQuizWrongBook(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_wrong_questions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      question_id VARCHAR(64) NOT NULL,
      subject VARCHAR(64) NOT NULL DEFAULT '未分类',
      category VARCHAR(32) NOT NULL DEFAULT '其他',
      question_text TEXT NOT NULL,
      options_json JSON NOT NULL,
      user_answer_index INT NOT NULL DEFAULT -1,
      correct_index INT NOT NULL DEFAULT 0,
      explanation MEDIUMTEXT NULL,
      wrong_count INT UNSIGNED NOT NULL DEFAULT 1,
      mastered TINYINT(1) NOT NULL DEFAULT 0,
      first_wrong_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_wrong_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY quiz_wrong_user_question_unique (user_id, question_id),
      KEY quiz_wrong_user_category_index (user_id, category, mastered, last_wrong_at),
      CONSTRAINT quiz_wrong_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function ownedEntry(pool, userId, entryId) {
  const [rows] = await pool.execute(
    'SELECT * FROM quiz_wrong_questions WHERE id = :id AND user_id = :userId LIMIT 1',
    { id: Number(entryId), userId },
  );
  return rows[0] || null;
}

async function replaceEntry(pool, { userId, payload }) {
  const questionId = normalizeQuestionId(payload.questionId);
  const subject = normalizeSubject(payload.subject);
  const category = normalizeCategory(payload.category);
  const questionText = normalizeQuestionText(payload.question);
  const options = normalizeOptions(payload.options);
  const userAnswerIndex = clampIndex(payload.userAnswerIndex);
  const correctIndex = clampIndex(payload.correctIndex);
  const explanation = normalizeExplanation(payload.explanation);
  const optionsJson = JSON.stringify(options);

  await pool.execute(
    `
    INSERT INTO quiz_wrong_questions
      (user_id, question_id, subject, category, question_text, options_json,
       user_answer_index, correct_index, explanation, wrong_count, mastered,
       first_wrong_at, last_wrong_at)
    VALUES
      (:userId, :questionId, :subject, :category, :questionText, :optionsJson,
       :userAnswerIndex, :correctIndex, :explanation, 1, 0,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON DUPLICATE KEY UPDATE
      subject = VALUES(subject),
      category = VALUES(category),
      question_text = VALUES(question_text),
      options_json = VALUES(options_json),
      user_answer_index = VALUES(user_answer_index),
      correct_index = VALUES(correct_index),
      explanation = VALUES(explanation),
      wrong_count = wrong_count + 1,
      mastered = 0,
      last_wrong_at = CURRENT_TIMESTAMP
    `,
    {
      userId,
      questionId,
      subject,
      category,
      questionText,
      optionsJson,
      userAnswerIndex,
      correctIndex,
      explanation,
    },
  );

  const [rows] = await pool.execute(
    'SELECT * FROM quiz_wrong_questions WHERE user_id = :userId AND question_id = :questionId LIMIT 1',
    { userId, questionId },
  );
  return rows[0] ? publicWrongEntry(rows[0]) : null;
}

export function registerQuizWrongBookRoutes(app, { getPool, requireAuth }) {
  const router = express.Router();

  router.use(requireAuth);

  router.get('/wrong-questions', async (req, res) => {
    try {
      const pool = getPool();
      const includeMastered = req.query.includeMastered === 'true';
      const params = { userId: req.user.id };
      const where = ['user_id = :userId'];
      if (!includeMastered) where.push('mastered = 0');
      const [rows] = await pool.execute(
        `SELECT * FROM quiz_wrong_questions
         WHERE ${where.join(' AND ')}
         ORDER BY last_wrong_at DESC
         LIMIT 500`,
        params,
      );
      const entries = rows.map(publicWrongEntry);
      const grouped = {};
      entries.forEach((entry) => {
        const key = entry.category || '其他';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(entry);
      });
      res.json({
        entries,
        grouped,
        total: entries.length,
        includeMastered: Boolean(includeMastered),
      });
    } catch (error) {
      console.error('Load quiz wrong book failed:', error);
      res.status(500).json({ message: '加载错题本失败' });
    }
  });

  router.post('/wrong-questions', async (req, res) => {
    const items = clampBatchLength(req.body?.items);
    if (items.length === 0) return res.status(400).json({ message: '请提供需要记录的错题列表' });
    const pool = getPool();
    const saved = [];
    for (const item of items) {
      const entry = await replaceEntry(pool, { userId: req.user.id, payload: item || {} });
      if (entry) saved.push(entry);
    }
    res.status(201).json({ saved, total: saved.length });
  });

  router.patch('/wrong-questions/:id/mastered', async (req, res) => {
    const entryId = Number(req.params.id);
    if (!Number.isInteger(entryId) || entryId <= 0) {
      return res.status(400).json({ message: '无效的错题编号' });
    }
    try {
      const pool = getPool();
      const owned = await ownedEntry(pool, req.user.id, entryId);
      if (!owned) return res.status(404).json({ message: '错题不存在' });
      const mastered = req.body?.mastered === false ? 0 : 1;
      await pool.execute(
        'UPDATE quiz_wrong_questions SET mastered = :mastered WHERE id = :id AND user_id = :userId',
        { mastered, id: entryId, userId: req.user.id },
      );
      const [rows] = await pool.execute(
        'SELECT * FROM quiz_wrong_questions WHERE id = :id AND user_id = :userId',
        { id: entryId, userId: req.user.id },
      );
      res.json({ entry: publicWrongEntry(rows[0]) });
    } catch (error) {
      console.error('Update mastery failed:', error);
      res.status(500).json({ message: '更新错题状态失败' });
    }
  });

  router.delete('/wrong-questions/:id', async (req, res) => {
    const entryId = Number(req.params.id);
    if (!Number.isInteger(entryId) || entryId <= 0) {
      return res.status(400).json({ message: '无效的错题编号' });
    }
    try {
      const pool = getPool();
      const [result] = await pool.execute(
        'DELETE FROM quiz_wrong_questions WHERE id = :id AND user_id = :userId',
        { id: entryId, userId: req.user.id },
      );
      if (!result.affectedRows) return res.status(404).json({ message: '错题不存在' });
      res.status(204).end();
    } catch (error) {
      console.error('Delete wrong entry failed:', error);
      res.status(500).json({ message: '删除错题失败' });
    }
  });

  router.delete('/wrong-questions', async (req, res) => {
    try {
      const pool = getPool();
      await pool.execute('DELETE FROM quiz_wrong_questions WHERE user_id = :userId', {
        userId: req.user.id,
      });
      res.status(204).end();
    } catch (error) {
      console.error('Clear wrong book failed:', error);
      res.status(500).json({ message: '清空错题本失败' });
    }
  });

  app.use('/api/quiz', router);
}
