import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import jwt from 'jsonwebtoken';
import mysql from 'mysql2/promise';

dotenv.config();
dotenv.config({ path: '.env.local', override: false });

const app = express();

const PORT = Number(process.env.API_PORT || 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-before-deploying';
const COOKIE_NAME = 'hs_auth';
const isProduction = process.env.NODE_ENV === 'production';

const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'huishi_classroom',
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
};

if (!/^[a-zA-Z0-9_$-]+$/.test(dbConfig.database)) {
  throw new Error('MYSQL_DATABASE may only contain letters, numbers, underscore, dollar sign, or dash.');
}

let pool;

app.use(cors({
  origin: CLIENT_ORIGIN,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProduction,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};
const clearCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProduction,
  path: '/',
};

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name || user.username,
    avatarUrl: user.avatar_data_url || '',
    role: user.role,
    status: user.status,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

function signUser(user) {
  return jwt.sign(
    { id: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' },
  );
}

function isValidUsername(username) {
  if (typeof username !== 'string') return false;

  const value = username.trim();
  const plainUsername = /^[a-zA-Z0-9_\u4e00-\u9fa5-]{3,32}$/;
  const emailUsername = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  return plainUsername.test(value) || (value.length <= 64 && emailUsername.test(value));
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 6 && password.length <= 128;
}

function isValidDisplayName(displayName) {
  return typeof displayName === 'string' && displayName.trim().length >= 1 && displayName.trim().length <= 32;
}

function normalizeAvatarUrl(avatarUrl) {
  if (avatarUrl === undefined) return undefined;
  if (avatarUrl === null || avatarUrl === '') return '';
  if (typeof avatarUrl !== 'string') return null;
  if (avatarUrl.length > 650_000) return null;
  if (!/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(avatarUrl)) return null;

  const base64 = avatarUrl.split(',')[1] || '';
  const estimatedBytes = Math.floor((base64.length * 3) / 4);
  if (estimatedBytes > 480_000) return null;

  return avatarUrl;
}

async function findUserByUsername(username) {
  const [rows] = await pool.execute(
    'SELECT * FROM users WHERE username = :username LIMIT 1',
    { username },
  );
  return rows[0] || null;
}

async function findUserById(id) {
  const [rows] = await pool.execute(
    'SELECT * FROM users WHERE id = :id LIMIT 1',
    { id },
  );
  return rows[0] || null;
}

async function countActiveAdmins() {
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS count FROM users WHERE role = "admin" AND status = "active"',
  );
  return Number(rows[0]?.count || 0);
}

async function wouldRemoveLastActiveAdmin(user) {
  return user?.role === 'admin' && user.status === 'active' && await countActiveAdmins() <= 1;
}

async function ensureUsersColumn(name, definition) {
  const [columns] = await pool.query('SHOW COLUMNS FROM users LIKE ?', [name]);
  if (columns.length === 0) {
    await pool.query(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
  }
}

async function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ message: '未登录' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await findUserById(payload.id);

    if (!user || user.status !== 'active') {
      res.clearCookie(COOKIE_NAME, clearCookieOptions);
      return res.status(401).json({ message: '账号不可用，请重新登录' });
    }

    req.user = user;
    return next();
  } catch {
    res.clearCookie(COOKIE_NAME, clearCookieOptions);
    return res.status(401).json({ message: '登录已过期' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: '需要管理员权限' });
  }

  return next();
}

async function initializeDatabase() {
  const bootstrapConnection = await mysql.createConnection({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
  });

  await bootstrapConnection.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await bootstrapConnection.end();

  pool = mysql.createPool(dbConfig);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      username VARCHAR(64) NOT NULL,
      display_name VARCHAR(64) NULL,
      avatar_data_url MEDIUMTEXT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
      status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY users_username_unique (username),
      KEY users_role_index (role),
      KEY users_status_index (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensureUsersColumn('display_name', 'VARCHAR(64) NULL AFTER username');
  await ensureUsersColumn('avatar_data_url', 'MEDIUMTEXT NULL AFTER display_name');

  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123456';
  const [admins] = await pool.execute('SELECT id FROM users WHERE role = "admin" LIMIT 1');

  if (admins.length === 0) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    const seedUser = await findUserByUsername(adminUsername);

    if (seedUser) {
      await pool.execute(
        'UPDATE users SET password_hash = :passwordHash, display_name = COALESCE(NULLIF(display_name, ""), username), role = "admin", status = "active" WHERE id = :id',
        { id: seedUser.id, passwordHash },
      );
    } else {
      await pool.execute(
        'INSERT INTO users (username, display_name, password_hash, role, status) VALUES (:username, :username, :passwordHash, "admin", "active")',
        { username: adminUsername, passwordHash },
      );
    }

    console.log(`Default admin created: ${adminUsername}`);
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/register', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  if (!isValidUsername(username)) {
    return res.status(400).json({ message: '用户名可使用中文、字母、数字、下划线、短横线，或邮箱地址' });
  }

  if (!isValidPassword(password)) {
    return res.status(400).json({ message: '密码需为 6-128 位' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute(
      'INSERT INTO users (username, display_name, password_hash, role, status) VALUES (:username, :username, :passwordHash, "user", "active")',
      { username, passwordHash },
    );
    const user = await findUserById(result.insertId);
    res.cookie(COOKIE_NAME, signUser(user), cookieOptions);
    return res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: '用户名已存在' });
    }

    console.error('Register failed:', error);
    return res.status(500).json({ message: '注册失败，请稍后重试' });
  }
});

async function loginWithRole(req, res, expectedRole) {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  if (!username || !password) {
    return res.status(400).json({ message: '请输入用户名和密码' });
  }

  try {
    const user = await findUserByUsername(username);
    const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false;

    if (!user || !passwordMatches || user.role !== expectedRole) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ message: '账号已被禁用' });
    }

    res.cookie(COOKIE_NAME, signUser(user), cookieOptions);
    return res.json({ user: publicUser(user) });
  } catch (error) {
    console.error('Login failed:', error);
    return res.status(500).json({ message: '登录失败，请稍后重试' });
  }
}

app.post('/api/auth/login', (req, res) => loginWithRole(req, res, 'user'));
app.post('/api/auth/admin/login', (req, res) => loginWithRole(req, res, 'admin'));

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, clearCookieOptions);
  res.json({ ok: true });
});

app.patch('/api/profile', requireAuth, async (req, res) => {
  const displayName = req.body.displayName === undefined ? undefined : String(req.body.displayName || '').trim();
  const avatarUrl = normalizeAvatarUrl(req.body.avatarUrl);

  if (displayName !== undefined && !isValidDisplayName(displayName)) {
    return res.status(400).json({ message: '昵称需为 1-32 个字符' });
  }

  if (avatarUrl === null) {
    return res.status(400).json({ message: '头像需为 PNG、JPEG 或 WebP 图片，且体积不能过大' });
  }

  if (displayName === undefined && avatarUrl === undefined) {
    return res.status(400).json({ message: '请提供要更新的个人资料' });
  }

  const updates = [];
  const values = { id: req.user.id };

  if (displayName !== undefined) {
    updates.push('display_name = :displayName');
    values.displayName = displayName;
  }

  if (avatarUrl !== undefined) {
    updates.push('avatar_data_url = :avatarUrl');
    values.avatarUrl = avatarUrl;
  }

  await pool.execute(
    `UPDATE users SET ${updates.join(', ')} WHERE id = :id`,
    values,
  );

  const updated = await findUserById(req.user.id);
  return res.json({ user: publicUser(updated) });
});

app.get('/api/admin/users', requireAuth, requireAdmin, async (_req, res) => {
  const [rows] = await pool.execute(
    'SELECT id, username, display_name, avatar_data_url, role, status, created_at, updated_at FROM users ORDER BY created_at DESC',
  );
  res.json({ users: rows.map(publicUser) });
});

app.patch('/api/admin/users/:id/status', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const status = req.body.status;

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: '无效的用户 ID' });
  }

  if (!['active', 'disabled'].includes(status)) {
    return res.status(400).json({ message: '无效的账号状态' });
  }

  if (id === req.user.id) {
    return res.status(400).json({ message: '不能禁用当前管理员账号' });
  }

  const target = await findUserById(id);
  if (!target) {
    return res.status(404).json({ message: '用户不存在' });
  }

  if (target.status === 'active' && status === 'disabled' && await wouldRemoveLastActiveAdmin(target)) {
    return res.status(400).json({ message: '不能禁用最后一个启用的管理员账号' });
  }

  await pool.execute(
    'UPDATE users SET status = :status WHERE id = :id',
    { id, status },
  );

  const updated = await findUserById(id);
  return res.json({ user: publicUser(updated) });
});

app.patch('/api/admin/users/:id/role', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const role = req.body.role;

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: '无效的用户 ID' });
  }

  if (!['user', 'admin'].includes(role)) {
    return res.status(400).json({ message: '无效的用户角色' });
  }

  if (id === req.user.id && role !== 'admin') {
    return res.status(400).json({ message: '不能降级当前管理员账号' });
  }

  const target = await findUserById(id);
  if (!target) {
    return res.status(404).json({ message: '用户不存在' });
  }

  if (target.role === 'admin' && role === 'user' && await wouldRemoveLastActiveAdmin(target)) {
    return res.status(400).json({ message: '不能降级最后一个启用的管理员账号' });
  }

  await pool.execute(
    'UPDATE users SET role = :role WHERE id = :id',
    { id, role },
  );

  const updated = await findUserById(id);
  return res.json({ user: publicUser(updated) });
});

app.use((error, _req, res, _next) => {
  console.error('Unhandled API error:', error);
  res.status(500).json({ message: '服务器错误' });
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Auth API listening on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to start auth API:', error);
    process.exit(1);
  });
