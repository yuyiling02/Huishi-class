import React, { useEffect, useState } from 'react';
import AdminUsers from './AdminUsers';
import Dashboard from './Dashboard';
import Landing from './Landing';
import Login, { AuthUser } from './Login';

type AppView = 'landing' | 'login' | 'dashboard' | 'admin';
type AuthTransition = 'idle' | 'entering' | 'leaving';

async function readError(response: Response) {
  try {
    const data = await response.json();
    return data.message || '请求失败';
  } catch {
    return '请求失败';
  }
}

export default function App() {
  const [view, setView] = useState<AppView>('landing');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [authTransition, setAuthTransition] = useState<AuthTransition>('idle');

  useEffect(() => {
    let isMounted = true;

    const restoreSession = async () => {
      try {
        const response = await fetch('/api/auth/me', { credentials: 'include' });
        if (!response.ok) throw new Error(await readError(response));
        const data = await response.json();

        if (isMounted) {
          setUser(data.user);
          setView(data.user.role === 'admin' ? 'admin' : 'dashboard');
        }
      } catch {
        if (isMounted) {
          setUser(null);
          setView('landing');
        }
      } finally {
        if (isMounted) setIsCheckingAuth(false);
      }
    };

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleEnter = () => {
    if (user) {
      setView(user.role === 'admin' ? 'admin' : 'dashboard');
      return;
    }

    setAuthTransition('entering');
    window.setTimeout(() => {
      setView('login');
      window.setTimeout(() => setAuthTransition('idle'), 720);
    }, 360);
  };

  const handleAuthenticated = (nextUser: AuthUser) => {
    setUser(nextUser);
    setView(nextUser.role === 'admin' ? 'admin' : 'dashboard');
  };

  const handleUserUpdated = (nextUser: AuthUser) => {
    setUser(nextUser);
  };

  const handleBackToLanding = () => {
    setAuthTransition('leaving');
    window.setTimeout(() => {
      setView('landing');
      window.setTimeout(() => setAuthTransition('idle'), 260);
    }, 220);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
      setUser(null);
      setView('login');
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-[#030712] text-white flex items-center justify-center">
        <div className="rounded-lg border border-white/10 bg-white/[0.04] px-6 py-4 text-sm text-white/60">
          正在恢复登录状态...
        </div>
      </div>
    );
  }

  if (view === 'login') {
    return (
      <>
        <Login onAuthenticated={handleAuthenticated} onBack={handleBackToLanding} />
        {authTransition !== 'idle' && <div className={`auth-transition-veil ${authTransition}`} />}
      </>
    );
  }

  if (view === 'admin' && user?.role === 'admin') {
    return <AdminUsers currentUser={user} onLogout={handleLogout} />;
  }

  if (view === 'dashboard' && user) {
    return (
      <Dashboard
        playIntro
        currentUser={user}
        onBack={() => setView('landing')}
        onLogout={handleLogout}
        onUserUpdated={handleUserUpdated}
      />
    );
  }

  return (
    <>
      <Landing onEnter={handleEnter} />
      {authTransition !== 'idle' && <div className={`auth-transition-veil ${authTransition}`} />}
    </>
  );
}
