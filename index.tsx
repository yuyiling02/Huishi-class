import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// 注册 Service Worker 缓存 3D 大文件
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.log('⚡ Service Worker 注册成功:', reg.scope))
      .catch((err) => console.warn('❌ Service Worker 注册失败:', err));
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
