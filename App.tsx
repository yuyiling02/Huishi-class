import React, { useState } from 'react';
import Landing from './Landing';
import Dashboard from './Dashboard';

export default function App() {
  const [started, setStarted] = useState(false);

  if (!started) {
    return <Landing onEnter={() => setStarted(true)} />;
  }

  return <Dashboard />;
}
