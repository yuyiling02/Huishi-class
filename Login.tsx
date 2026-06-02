import React, { FormEvent, useMemo, useState } from 'react';
import { ArrowLeft, Fingerprint, Lock, ShieldCheck, UserPlus } from 'lucide-react';

export type AuthRole = 'user' | 'admin';

export interface AuthUser {
  id: number;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  role: AuthRole;
  status: 'active' | 'disabled';
  createdAt?: string;
  updatedAt?: string;
}

interface LoginProps {
  onAuthenticated: (user: AuthUser) => void;
  onBack: () => void;
}

type AuthMode = 'login' | 'register' | 'admin';

const modeConfig = {
  login: {
    title: '用户登录',
    subtitle: '进入 3D 智慧课堂控制台',
    icon: Fingerprint,
    endpoint: '/api/auth/login',
    submit: '登录',
  },
  register: {
    title: '用户注册',
    subtitle: '创建普通用户账号后直接进入课堂',
    icon: UserPlus,
    endpoint: '/api/auth/register',
    submit: '注册并进入',
  },
  admin: {
    title: '管理员登录',
    subtitle: '进入用户管理后台',
    icon: ShieldCheck,
    endpoint: '/api/auth/admin/login',
    submit: '管理员登录',
  },
} satisfies Record<AuthMode, {
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  endpoint: string;
  submit: string;
}>;

async function readError(response: Response) {
  try {
    const data = await response.json();
    return data.message || '请求失败';
  } catch {
    return '请求失败';
  }
}

const Login: React.FC<LoginProps> = ({ onAuthenticated, onBack }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const config = modeConfig[mode];
  const ModeIcon = config.icon;
  const helperText = useMemo(() => {
    if (mode === 'register') return '用户名支持中文、字母、数字、下划线、短横线，或邮箱地址。';
    if (mode === 'admin') return '管理员账号由系统管理员创建。';
    return '使用已注册的普通用户账号登录。';
  }, [mode]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    setIsSubmitting(true);

    try {
      const response = await fetch(config.endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const data = await response.json();
      onAuthenticated(data.user);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '登录失败，请稍后重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-login-page min-h-screen bg-[#030712] text-white overflow-hidden relative flex items-center justify-center px-5 py-10">
      <div className="auth-login-bg absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,210,255,0.24),transparent_34%),radial-gradient(circle_at_80%_10%,rgba(61,129,227,0.20),transparent_32%),linear-gradient(135deg,#030712_0%,#061326_48%,#04060d_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-56 bg-[radial-gradient(ellipse_at_bottom,rgba(0,210,255,0.22),transparent_70%)]" />

      <button
        onClick={onBack}
        className="fixed left-6 top-6 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 backdrop-blur-md transition hover:bg-white/10 hover:text-white"
        aria-label="返回首页"
        title="返回首页"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>

      <div className="relative z-10 w-full max-w-[980px] grid gap-8 lg:grid-cols-[1fr_420px] items-center">
        <section className="auth-login-copy hidden lg:block">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-100">
            <Lock className="h-4 w-4" />
            Secure Classroom Access
          </div>
          <h1 className="mt-8 text-5xl font-black leading-tight tracking-normal">
            数智课堂<br />
            <span className="text-cyan-200">身份认证中心</span>
          </h1>
        </section>

        <section className="auth-login-card rounded-lg border border-white/12 bg-black/35 p-6 shadow-2xl shadow-black/40 backdrop-blur-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-cyan-300/25 bg-cyan-300/10 text-cyan-100">
                <ModeIcon className="h-5 w-5" />
              </div>
              <h2 className="mt-5 text-2xl font-bold tracking-normal">{config.title}</h2>
              <p className="mt-2 text-sm text-white/55">{config.subtitle}</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-1">
            {([
              ['login', '用户登录'],
              ['admin', '管理员'],
            ] as const).map(([value, label]) => {
              const isActive = value === 'admin' ? mode === 'admin' : mode !== 'admin';

              return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setMode(value);
                  setMessage('');
                }}
                className={`h-10 rounded-md text-sm font-semibold transition ${isActive ? 'bg-white text-black' : 'text-white/60 hover:bg-white/8 hover:text-white'}`}
              >
                {label}
              </button>
              );
            })}
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-white/70">用户名</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="mt-2 h-12 w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 text-white outline-none transition placeholder:text-white/28 focus:border-cyan-300/60 focus:bg-white/[0.07]"
                placeholder={mode === 'admin' ? 'admin' : '请输入用户名'}
                autoComplete="username"
                required
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-white/70">密码</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 h-12 w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 text-white outline-none transition placeholder:text-white/28 focus:border-cyan-300/60 focus:bg-white/[0.07]"
                placeholder="请输入密码"
                type="password"
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                required
              />
            </label>

            <p className="min-h-5 text-sm text-white/45">{helperText}</p>

            {message && (
              <div className="rounded-lg border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-cyan-200 px-5 text-sm font-bold text-[#03111f] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ModeIcon className="h-4 w-4" />
              {isSubmitting ? '处理中...' : config.submit}
            </button>

            {mode === 'login' && (
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setMessage('');
                  }}
                  className="text-sm font-semibold text-cyan-100/80 transition hover:text-white"
                >
                  注册
                </button>
              </div>
            )}

            {mode === 'register' && (
              <div className="text-center text-sm text-white/45">
                已有账号？
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setMessage('');
                  }}
                  className="ml-1 font-semibold text-cyan-100/80 transition hover:text-white"
                >
                  登录
                </button>
              </div>
            )}
          </form>
        </section>
      </div>
    </div>
  );
};

export default Login;
