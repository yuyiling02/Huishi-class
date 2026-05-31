import React, { useState } from 'react';
import Landing from './Landing';
import Dashboard from './Dashboard';

type AppView = 'landing' | 'transitioning' | 'dashboard';

export default function App() {
  const [view, setView] = useState<AppView>('landing');

  const handleEnter = () => {
    setView('dashboard');
  };

  if (view === 'landing') {
    return <Landing onEnter={handleEnter} />;
  }

  return <Dashboard playIntro />;
}
