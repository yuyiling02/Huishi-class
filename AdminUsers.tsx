import React, { useEffect, useState } from 'react';
import { Boxes, ClipboardList, LogOut, MonitorPlay, RefreshCw, ShieldCheck, UserCheck, UserCog, Users, UserX } from 'lucide-react';
import type { AuthUser } from './Login';
import AdminResourceLibrary from './AdminResourceLibrary';
import ThemeSwitcher from './components/ThemeSwitcher';

interface AdminUsersProps {
  currentUser: AuthUser;
  onEnterDashboard: () => void;
  onLogout: () => void;
}

interface ActivityLog {
  id: number;
  userId: number | null;
  usernameSnapshot: string | null;
  action: string;
  description: string | null;
  method: string;
  path: string;
  statusCode: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface LogPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

async function readError(response: Response) {
  try {
    const data = await response.json();
    return data.message || '请求失败';
  } catch {
    return '请求失败';
  }
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN');
}

function statusClass(statusCode: number | null) {
  if (statusCode === null) return 'bg-white/8 text-ink/60';
  if (statusCode >= 500) return 'bg-red-500/15 text-red-700';
  if (statusCode >= 400) return 'bg-amber-400/15 text-amber-700';
  return 'bg-emerald-400/12 text-emerald-700';
}

const USER_TABLE_GRID = 'grid-cols-[minmax(170px,1.3fr)_minmax(140px,1fr)_88px_88px_150px_165px_120px_320px]';

const AdminUsers: React.FC<AdminUsersProps> = ({ currentUser, onEnterDashboard, onLogout }) => {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'users' | 'logs' | 'resources'>('users');
  const [resourceRefreshKey, setResourceRefreshKey] = useState(0);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  const [logsMessage, setLogsMessage] = useState('');
  const [selectedLogUserId, setSelectedLogUserId] = useState<number | null>(null);
  const [logsPage, setLogsPage] = useState(1);
  const [logsPagination, setLogsPagination] = useState<LogPagination | null>(null);

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

  const loadLogs = async () => {
    setLogsMessage('');
    setIsLogsLoading(true);

    try {
      const params = new URLSearchParams({ page: String(logsPage), pageSize: '50' });
      if (selectedLogUserId !== null) params.set('userId', String(selectedLogUserId));
      const response = await fetch(`/api/admin/logs?${params.toString()}`, { credentials: 'include' });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      setLogs(data.logs || []);
      setLogsPagination(data.pagination || null);
    } catch (error) {
      setLogs([]);
      setLogsPagination(null);
      setLogsMessage(error instanceof Error ? error.message : '日志加载失败');
    } finally {
      setIsLogsLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  useEffect(() => {
    if (activeTab === 'logs') void loadLogs();
  }, [activeTab, selectedLogUserId, logsPage]);

  const openUserLogs = (userId: number) => {
    setSelectedLogUserId(userId);
    setLogsPage(1);
    setLogsMessage('');
    setActiveTab('logs');
  };

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

  const refresh = () => {
    if (activeTab === 'users') void loadUsers();
    else if (activeTab === 'logs') void loadLogs();
    else setResourceRefreshKey((current) => current + 1);
  };

  const totalPages = logsPagination?.totalPages || 0;

  return (
    <div className="min-h-screen bg-[var(--theme-bg)] text-ink">
      <header className="border-b border-line/10 bg-cyan/25 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-cyan/20 bg-cyan-300/10 text-cyan">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-normal">管理后台</h1>
              <p className="text-sm text-ink/50">当前管理员：{currentUser.username}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onEnterDashboard}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-cyan/25 bg-cyan-300/10 px-4 text-sm font-semibold text-cyan transition hover:bg-cyan-300/20 hover:text-ink"
            >
              <MonitorPlay className="h-4 w-4" />
              <span>进入操作界面</span>
            </button>
            <ThemeSwitcher className="shrink-0" />
            <button
              type="button"
              onClick={refresh}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line/10 bg-white/5 text-ink/70 transition hover:bg-white/10 hover:text-ink"
              title="刷新"
              aria-label="刷新"
            >
              <RefreshCw className={`h-4 w-4 ${((activeTab === 'users' && isLoading) || (activeTab === 'logs' && isLogsLoading)) ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line/10 bg-white/5 px-4 text-sm font-semibold text-ink/75 transition hover:bg-white/10 hover:text-ink"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">退出登录</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex w-full rounded-lg border border-line/10 bg-cyan/20 p-1 sm:inline-flex sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md px-4 text-sm font-bold transition sm:flex-none ${activeTab === 'users' ? 'bg-cyan-300 text-[#06212a]' : 'text-ink/55 hover:bg-white/[0.06] hover:text-ink'}`}
          >
            <Users className="h-4 w-4" /> 用户管理
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md px-4 text-sm font-bold transition sm:flex-none ${activeTab === 'logs' ? 'bg-cyan-300 text-[#06212a]' : 'text-ink/55 hover:bg-white/[0.06] hover:text-ink'}`}
          >
            <ClipboardList className="h-4 w-4" /> 日志管理
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('resources')}
            className={`inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md px-4 text-sm font-bold transition sm:flex-none ${activeTab === 'resources' ? 'bg-cyan-300 text-[#06212a]' : 'text-ink/55 hover:bg-white/[0.06] hover:text-ink'}`}
          >
            <Boxes className="h-4 w-4" /> 资源管理
          </button>
        </div>

        {activeTab === 'users' ? (
          <>
            {message && (
              <div className="mb-5 rounded-lg border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm text-red-700">
                {message}
              </div>
            )}

            <section className="overflow-hidden rounded-lg border border-line/10 bg-white/[0.03] shadow-2xl shadow-black/25">
              <div className="overflow-x-auto">
                <div className="min-w-[1365px]">
                  <div className={`grid ${USER_TABLE_GRID} gap-3 border-b border-line/10 bg-cyan/10 px-5 py-3 text-xs font-bold uppercase tracking-wide text-ink/70`}>
                    <span>用户名</span>
                    <span>学校</span>
                    <span>角色</span>
                    <span>状态</span>
                    <span>创建时间</span>
                    <span>最近访问时间</span>
                    <span>最近访问 IP</span>
                    <span className="sticky right-0 z-20 -my-3 flex items-center justify-end border-l border-line/8 bg-cyan/10 py-3 pl-4 text-right shadow-[-12px_0_18px_rgba(var(--theme-primary-rgb),0.16)]">操作</span>
                  </div>

                  {isLoading ? (
                    <div className="px-5 py-12 text-center text-ink/50">正在加载用户...</div>
                  ) : users.length === 0 ? (
                    <div className="px-5 py-12 text-center text-ink/50">暂无用户</div>
                  ) : (
                    <div className="divide-y divide-white/8">
                      {users.map((user) => {
                        const isSelf = user.id === currentUser.id;
                        const isActive = user.status === 'active';

                        return (
                          <div
                            key={user.id}
                            className={`grid min-h-20 ${USER_TABLE_GRID} items-center gap-3 px-5 py-4 text-sm`}
                          >
                            <div className="min-w-0 truncate font-semibold text-ink" title={user.username}>{user.username}</div>
                            <div className="min-w-0 truncate text-ink/60" title={user.school || undefined}>{user.school || '-'}</div>
                            <div>
                              <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-bold ${user.role === 'admin' ? 'bg-cyan-300/12 text-cyan' : 'bg-white/8 text-ink/70'}`}>
                                {user.role === 'admin' ? '管理员' : '普通用户'}
                              </span>
                            </div>
                            <div>
                              <span className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold ${isActive ? 'bg-emerald-400/12 text-emerald-700' : 'bg-red-400/12 text-red-700'}`}>
                                {isActive ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
                                {isActive ? '启用' : '禁用'}
                              </span>
                            </div>
                            <div className="whitespace-nowrap tabular-nums text-ink/50">{formatDate(user.createdAt)}</div>
                            <div className="whitespace-nowrap tabular-nums text-ink/50">{formatDate(user.lastAccessAt)}</div>
                            <div className="whitespace-nowrap font-mono text-xs text-ink/50">{user.lastAccessIp || '-'}</div>
                            <div className="sticky right-0 z-10 -my-4 flex min-h-20 flex-nowrap items-center justify-end gap-2 border-l border-line/8 bg-cyan-50 py-4 pl-4 shadow-[-12px_0_18px_rgba(var(--theme-primary-rgb),0.16)]">
                              <button
                                type="button"
                                onClick={() => openUserLogs(user.id)}
                                className="inline-flex h-9 w-24 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-line/10 bg-white/5 px-3 text-xs font-bold text-ink/75 transition hover:bg-white/10 hover:text-ink"
                              >
                                <ClipboardList className="h-3.5 w-3.5" />
                                查看日志
                              </button>
                              <button
                                type="button"
                                onClick={() => updateRole(user)}
                                disabled={isSelf || busyKey !== null}
                                className="inline-flex h-9 w-28 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-cyan/20 bg-cyan-300/10 px-3 text-xs font-bold text-cyan transition hover:bg-cyan-300/18 disabled:cursor-not-allowed disabled:opacity-45"
                              >
                                <UserCog className="h-3.5 w-3.5" />
                                {isSelf ? '当前角色' : busyKey === `role-${user.id}` ? '处理中' : user.role === 'admin' ? '降为用户' : '升为管理员'}
                              </button>
                              <button
                                type="button"
                                onClick={() => updateStatus(user)}
                                disabled={isSelf || busyKey !== null}
                                className={`inline-flex h-9 w-20 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-3 text-xs font-bold transition ${
                                  isActive
                                    ? 'border border-red-300/20 bg-red-500/10 text-red-700 hover:bg-red-500/18'
                                    : 'border border-emerald-300/20 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/18'
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
                </div>
              </div>
            </section>
          </>
        ) : activeTab === 'logs' ? (
          <section className="overflow-hidden rounded-lg border border-line/10 bg-white/[0.03] shadow-2xl shadow-black/25">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/10 bg-white/[0.04] px-5 py-4">
              <div>
                <h2 className="font-bold text-ink">审计日志</h2>
                <p className="mt-1 text-xs text-ink/60">主信息会包含经批准的对话内容和限长建模提示词；不包含密码、凭证、图片数据、Cookie、Token 或完整请求正文。</p>
              </div>
              <label className="flex items-center gap-2 text-sm text-ink/65">
                <span>查看范围</span>
                <select
                  value={selectedLogUserId === null ? '' : String(selectedLogUserId)}
                  onChange={(event) => {
                    setSelectedLogUserId(event.target.value ? Number(event.target.value) : null);
                    setLogsPage(1);
                  }}
                  className="h-10 min-w-[190px] rounded-lg border border-line/10 bg-cyan-50 px-3 text-sm text-ink outline-none focus:border-cyan/60"
                  aria-label="日志查看范围"
                >
                  <option value="">系统全量日志</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>{user.username}（{user.role === 'admin' ? '管理员' : '普通用户'}）</option>
                  ))}
                </select>
              </label>
            </div>

            {logsMessage && (
              <div className="m-5 rounded-lg border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm text-red-700">
                {logsMessage}
              </div>
            )}

            <div className="overflow-x-auto">
              <div className="min-w-[1280px]">
                <div className="grid grid-cols-[1.15fr_1fr_3.3fr_1.8fr_0.7fr_1.1fr] gap-4 border-b border-line/10 px-5 py-3 text-xs font-bold uppercase tracking-wide text-ink/70">
                  <span>时间</span>
                  <span>用户</span>
                  <span>用户行为（主要信息）</span>
                  <span>技术细节（次要信息）</span>
                  <span>状态</span>
                  <span>IP</span>
                </div>
                {isLogsLoading ? (
                  <div className="px-5 py-12 text-center text-ink/50">正在加载日志...</div>
                ) : logs.length === 0 ? (
                  <div className="px-5 py-12 text-center text-ink/50">暂无日志</div>
                ) : (
                  <div className="divide-y divide-white/8">
                    {logs.map((log) => (
                      <div key={log.id} className="grid grid-cols-[1.15fr_1fr_3.3fr_1.8fr_0.7fr_1.1fr] items-center gap-4 px-5 py-4 text-sm">
                        <div className="text-ink/55">{formatDate(log.createdAt)}</div>
                        <div className="truncate text-ink/75" title={log.usernameSnapshot || undefined}>
                          {log.usernameSnapshot || (log.userId === null ? '系统' : '已删除用户')}
                        </div>
                        <div className="min-w-0 break-words font-semibold leading-6 text-cyan" title={log.description || undefined}>
                          {log.description || '历史日志暂无中文说明'}
                        </div>
                        <div className="min-w-0 space-y-1 text-xs leading-5 text-ink/60">
                          <div className="break-all"><span className="text-ink/30">动作代码：</span>{log.action}</div>
                          <div className="break-all"><span className="text-ink/30">HTTP：</span>{log.method} {log.path}</div>
                        </div>
                        <div>
                          <span className={`inline-flex rounded-md px-2 py-1 text-xs font-bold ${statusClass(log.statusCode)}`}>
                            {log.statusCode ?? '-'}
                          </span>
                        </div>
                        <div className="break-all text-ink/55">{log.ipAddress || '-'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-line/10 px-5 py-4 text-sm text-ink/55">
              <span>{logsPagination ? `共 ${logsPagination.total} 条，第 ${logsPagination.page} / ${totalPages || 1} 页` : '—'}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLogsPage((page) => Math.max(1, page - 1))}
                  disabled={isLogsLoading || logsPage <= 1}
                  className="rounded-lg border border-line/10 bg-white/5 px-3 py-2 font-bold text-ink/70 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  上一页
                </button>
                <button
                  type="button"
                  onClick={() => setLogsPage((page) => page + 1)}
                  disabled={isLogsLoading || totalPages === 0 || logsPage >= totalPages}
                  className="rounded-lg border border-line/10 bg-white/5 px-3 py-2 font-bold text-ink/70 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  下一页
                </button>
              </div>
            </div>
          </section>
        ) : (
          <AdminResourceLibrary refreshKey={resourceRefreshKey} />
        )}
      </main>
    </div>
  );
};

export default AdminUsers;
