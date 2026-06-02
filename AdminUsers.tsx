import React, { useEffect, useState } from 'react';
import { LogOut, RefreshCw, ShieldCheck, UserCheck, UserCog, UserX } from 'lucide-react';
import type { AuthUser } from './Login';

interface AdminUsersProps {
  currentUser: AuthUser;
  onLogout: () => void;
}

async function readError(response: Response) {
  try {
    const data = await response.json();
    return data.message || '请求失败';
  } catch {
    return '请求失败';
  }
}

const AdminUsers: React.FC<AdminUsersProps> = ({ currentUser, onLogout }) => {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const loadUsers = async () => {
    setMessage('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/admin/users', { credentials: 'include' });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      setUsers(data.users || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '用户列表加载失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const updateStatus = async (user: AuthUser) => {
    const nextStatus = user.status === 'active' ? 'disabled' : 'active';
    setBusyKey(`status-${user.id}`);
    setMessage('');

    try {
      const response = await fetch(`/api/admin/users/${user.id}/status`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      setUsers((current) => current.map((item) => (item.id === user.id ? data.user : item)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '状态更新失败');
    } finally {
      setBusyKey(null);
    }
  };

  const updateRole = async (user: AuthUser) => {
    const nextRole = user.role === 'admin' ? 'user' : 'admin';
    setBusyKey(`role-${user.id}`);
    setMessage('');

    try {
      const response = await fetch(`/api/admin/users/${user.id}/role`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });

      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      setUsers((current) => current.map((item) => (item.id === user.id ? data.user : item)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '角色更新失败');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#071018] text-white">
      <header className="border-b border-white/10 bg-black/25 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-normal">用户管理后台</h1>
              <p className="text-sm text-white/50">当前管理员：{currentUser.username}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadUsers}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
              title="刷新"
              aria-label="刷新"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onLogout}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              退出登录
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {message && (
          <div className="mb-5 rounded-lg border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {message}
          </div>
        )}

        <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] shadow-2xl shadow-black/25">
          <div className="grid grid-cols-[1.3fr_0.75fr_0.75fr_1fr_1.7fr] gap-4 border-b border-white/10 bg-white/[0.04] px-5 py-3 text-xs font-bold uppercase tracking-wide text-white/45">
            <span>用户名</span>
            <span>角色</span>
            <span>状态</span>
            <span>创建时间</span>
            <span className="text-right">操作</span>
          </div>

          {isLoading ? (
            <div className="px-5 py-12 text-center text-white/50">正在加载用户...</div>
          ) : users.length === 0 ? (
            <div className="px-5 py-12 text-center text-white/50">暂无用户</div>
          ) : (
            <div className="divide-y divide-white/8">
              {users.map((user) => {
                const isSelf = user.id === currentUser.id;
                const isActive = user.status === 'active';

                return (
                  <div
                    key={user.id}
                    className="grid grid-cols-[1.3fr_0.75fr_0.75fr_1fr_1.7fr] items-center gap-4 px-5 py-4 text-sm"
                  >
                    <div className="font-semibold text-white">{user.username}</div>
                    <div>
                      <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-bold ${user.role === 'admin' ? 'bg-cyan-300/12 text-cyan-100' : 'bg-white/8 text-white/70'}`}>
                        {user.role === 'admin' ? '管理员' : '普通用户'}
                      </span>
                    </div>
                    <div>
                      <span className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold ${isActive ? 'bg-emerald-400/12 text-emerald-100' : 'bg-red-400/12 text-red-100'}`}>
                        {isActive ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
                        {isActive ? '启用' : '禁用'}
                      </span>
                    </div>
                    <div className="text-white/50">
                      {user.createdAt ? new Date(user.createdAt).toLocaleString('zh-CN') : '-'}
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => updateRole(user)}
                        disabled={isSelf || busyKey !== null}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 text-xs font-bold text-cyan-100 transition hover:bg-cyan-300/18 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <UserCog className="h-3.5 w-3.5" />
                        {isSelf ? '当前角色' : busyKey === `role-${user.id}` ? '处理中' : user.role === 'admin' ? '降为用户' : '升为管理员'}
                      </button>
                      <button
                        onClick={() => updateStatus(user)}
                        disabled={isSelf || busyKey !== null}
                        className={`inline-flex h-9 items-center justify-center rounded-lg px-4 text-xs font-bold transition ${
                          isActive
                            ? 'border border-red-300/20 bg-red-500/10 text-red-100 hover:bg-red-500/18'
                            : 'border border-emerald-300/20 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/18'
                        } disabled:cursor-not-allowed disabled:opacity-45`}
                      >
                        {isSelf ? '当前账号' : busyKey === `status-${user.id}` ? '处理中' : isActive ? '禁用' : '启用'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default AdminUsers;
