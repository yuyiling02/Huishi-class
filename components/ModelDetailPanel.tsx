import React from 'react';
import { BookOpen, MessageSquareText, PanelRightClose, Sparkles } from 'lucide-react';
import type { ModelInfoProfile } from '../services/modelInfoProfiles';
import KnowledgeNarrationPanel from './KnowledgeNarrationPanel';
import ModelInfoCard from './ModelInfoCard';

export type DetailPanelTab = 'info' | 'narration';

interface ModelDetailPanelProps {
  activeTab: DetailPanelTab;
  profile: ModelInfoProfile | null;
  modelName: string;
  content: string;
  isStreaming: boolean;
  isNarrating: boolean;
  narrationCharIndex: number | null;
  structureImage?: string;
  structureImageButtonRef?: React.Ref<HTMLButtonElement>;
  onStructureImageClick?: () => void;
  onTabChange: (tab: DetailPanelTab) => void;
  onClose: () => void;
}

const ModelDetailPanel: React.FC<ModelDetailPanelProps> = ({
  activeTab,
  profile,
  modelName,
  content,
  isStreaming,
  isNarrating,
  narrationCharIndex,
  structureImage,
  structureImageButtonRef,
  onStructureImageClick,
  onTabChange,
  onClose,
}) => {
  const narrationAvailable = Boolean(content || isStreaming);

  return (
    <aside className="lab-detail-panel" aria-label="模型知识详情">
      <div className="lab-detail-tabs" role="tablist" aria-label="模型详情内容">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'info'}
          onClick={() => onTabChange('info')}
          className={`lab-detail-tab ${activeTab === 'info' ? 'is-active' : ''}`}
        >
          <BookOpen size={15} />
          模型资料
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'narration'}
          onClick={() => onTabChange('narration')}
          className={`lab-detail-tab ${activeTab === 'narration' ? 'is-active' : ''}`}
        >
          <MessageSquareText size={15} />
          AI 讲解
          {(isStreaming || isNarrating) && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="lab-detail-close"
          aria-label={activeTab === 'narration' && narrationAvailable ? '关闭知识讲解并返回模型资料' : '收起知识详情栏'}
          title={activeTab === 'narration' && narrationAvailable ? '结束讲解' : '收起详情'}
        >
          <PanelRightClose size={17} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden" role="tabpanel">
        {activeTab === 'info' ? (
          profile ? (
            <ModelInfoCard profile={profile} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-8 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl border border-cyan/15 bg-cyan-300/[0.06] text-cyan">
                <BookOpen size={23} />
              </div>
              <h2 className="mt-5 text-lg font-black text-white">{modelName || '选择一个模型'}</h2>
              <p className="mt-2 max-w-[260px] text-xs leading-6 text-slate-300">
                {modelName ? '该模型暂未配置结构资料，你仍可继续旋转、缩放、手势控制或让小智进行讲解。' : '从左侧资源库选择模型后，这里会显示模型介绍、关键数据和学习提示。'}
              </p>
            </div>
          )
        ) : narrationAvailable ? (
          <KnowledgeNarrationPanel
            content={content}
            isStreaming={isStreaming}
            isNarrating={isNarrating}
            narrationCharIndex={narrationCharIndex}
            structureImage={structureImage}
            structureImageButtonRef={structureImageButtonRef}
            onStructureImageClick={onStructureImageClick}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl border border-amber-300/15 bg-amber-300/[0.06] text-amber-200">
              <Sparkles size={23} />
            </div>
            <h2 className="mt-5 text-lg font-black text-white">等待 AI 讲解</h2>
            <p className="mt-2 max-w-[260px] text-xs leading-6 text-slate-300">向小智提出“讲解这个模型”等问题，生成的课堂内容会自动出现在这里。</p>
          </div>
        )}
      </div>
    </aside>
  );
};

export default ModelDetailPanel;
