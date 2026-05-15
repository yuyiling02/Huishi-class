import React, { useEffect, useState } from 'react';
import { ExternalLink, HeartPulse, Loader2, WifiOff } from 'lucide-react';

interface BioDigitalViewerProps {
  src: string;
  onFallback: () => void;
}

const SLOW_LOAD_TIMEOUT_MS = 11000;

const BioDigitalViewer: React.FC<BioDigitalViewerProps> = ({ src, onFallback }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    setIsLoaded(false);
    setIsSlow(false);

    const slowTimer = window.setTimeout(() => {
      setIsSlow(true);
    }, SLOW_LOAD_TIMEOUT_MS);

    return () => window.clearTimeout(slowTimer);
  }, [src]);

  const openInNewWindow = () => {
    window.open(src, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="relative h-full w-full bg-white">
      <iframe
        title="BioDigital 心脏模型"
        src={src}
        className="h-full w-full border-0 bg-white"
        allow="fullscreen; autoplay; xr-spatial-tracking"
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => setIsLoaded(true)}
      />

      <div className="absolute left-6 top-6 z-20 flex gap-2">
        <button
          type="button"
          onClick={onFallback}
          className="flex items-center gap-2 rounded-xl border border-white/60 bg-white/85 px-4 py-2 text-[10px] font-black text-emerald-600 shadow-sm backdrop-blur-md transition hover:bg-white"
          aria-label="切换到本地备用模型"
          title="切换到本地备用模型"
        >
          <HeartPulse size={14} />
          本地备用
        </button>
        <button
          type="button"
          onClick={openInNewWindow}
          className="flex items-center gap-2 rounded-xl border border-white/60 bg-white/85 px-4 py-2 text-[10px] font-black text-gray-600 shadow-sm backdrop-blur-md transition hover:bg-white"
          aria-label="在新窗口打开 BioDigital 模型"
          title="在新窗口打开"
        >
          <ExternalLink size={14} />
          新窗口
        </button>
      </div>

      {!isLoaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 px-6 backdrop-blur-md">
          <div className="max-w-md rounded-[24px] border border-white bg-white/90 p-6 text-center shadow-xl">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
              {isSlow ? <WifiOff size={30} /> : <HeartPulse size={30} />}
            </div>

            <h2 className="mb-2 text-xl font-black text-gray-700">
              {isSlow ? '跨境网络可能较慢' : '正在加载 BioDigital 心脏模型'}
            </h2>
            <p className="mb-5 text-sm font-medium leading-relaxed text-gray-500">
              {isSlow
                ? '如果中国大陆网络无法稳定访问 BioDigital，可切换到本地心脏备用模型继续展示。'
                : '模型由 BioDigital 在线服务提供，首次加载需要访问外部 3D 资源。'}
            </p>

            {isSlow ? (
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={onFallback}
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black text-white shadow-sm transition hover:bg-emerald-600"
                >
                  切换本地备用模型
                </button>
                <button
                  type="button"
                  onClick={openInNewWindow}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-black text-gray-600 shadow-sm transition hover:bg-gray-50"
                >
                  新窗口打开
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 text-xs font-black text-emerald-500">
                <Loader2 className="animate-spin" size={16} />
                加载中
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BioDigitalViewer;
