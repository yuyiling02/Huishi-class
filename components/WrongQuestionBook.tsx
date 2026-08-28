import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  SkipForward,
  Sparkles,
  Trash2,
  Trophy,
  X,
  XCircle,
} from 'lucide-react';
import {
  WrongQuestionEntry,
  WrongQuestionPayload,
  clearWrongBook,
  deleteWrongQuestion,
  fetchWrongBook,
  markWrongQuestionMastered,
} from '../services/quizWrongBook';
import { speakXiaozhi, stopXiaozhiSpeech } from '../services/xiaozhiSpeechService';

interface WrongQuestionBookProps {
  onBack: () => void;
}

const CATEGORY_ORDER = ['化学', '生物', '地理', '少儿兴趣'];
const CATEGORY_BADGE: Record<string, string> = {
  化学: 'border-cyan-300/40 bg-cyan-400/12 text-cyan-100',
  生物: 'border-emerald-300/40 bg-emerald-400/12 text-emerald-100',
  地理: 'border-amber-300/40 bg-amber-400/12 text-amber-100',
  少儿兴趣: 'border-pink-300/40 bg-pink-400/12 text-pink-100',
  其他: 'border-slate-300/40 bg-slate-400/12 text-slate-100',
};

const CATEGORY_ACCENT: Record<string, string> = {
  化学: 'from-cyan-500/30 via-cyan-300/10 to-transparent',
  生物: 'from-emerald-500/30 via-emerald-300/10 to-transparent',
  地理: 'from-amber-500/30 via-amber-300/10 to-transparent',
  少儿兴趣: 'from-pink-500/30 via-pink-300/10 to-transparent',
  其他: 'from-slate-500/30 via-slate-300/10 to-transparent',
};

function formatDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function optionLabel(index: number) {
  return String.fromCharCode(65 + Math.max(0, index));
}

const WrongQuestionBook: React.FC<WrongQuestionBookProps> = ({ onBack }) => {
  const reduceMotion = useReducedMotion();
  const [snapshot, setSnapshot] = useState<{
    entries: WrongQuestionEntry[];
    grouped: Record<string, WrongQuestionEntry[]>;
    includeMastered: boolean;
  }>({ entries: [], grouped: {}, includeMastered: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMastered, setShowMastered] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(new Set());
  const [busyEntryId, setBusyEntryId] = useState<number | null>(null);
  const [explainingId, setExplainingId] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);

  const reload = useCallback(async (options: { includeMastered?: boolean } = {}) => {
    const include = options.includeMastered ?? showMastered;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWrongBook({ includeMastered: include });
      setSnapshot({
        entries: data.entries,
        grouped: data.grouped,
        includeMastered: data.includeMastered,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载错题本失败';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [showMastered]);

  useEffect(() => {
    void reload({ includeMastered: showMastered });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMastered]);

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const toggleEntry = (id: number) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleMaster = async (entry: WrongQuestionEntry) => {
    setBusyEntryId(entry.id);
    try {
      await markWrongQuestionMastered(entry.id, !entry.mastered);
      await reload({ includeMastered: showMastered });
    } catch (err) {
      const message = err instanceof Error ? err.message : '操作失败';
      setError(message);
    } finally {
      setBusyEntryId(null);
    }
  };

  const handleDelete = async (entry: WrongQuestionEntry) => {
    setBusyEntryId(entry.id);
    try {
      await deleteWrongQuestion(entry.id);
      setExpandedEntries((prev) => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
      await reload({ includeMastered: showMastered });
    } catch (err) {
      const message = err instanceof Error ? err.message : '删除失败';
      setError(message);
    } finally {
      setBusyEntryId(null);
    }
  };

  const handleClearAll = async () => {
    if (!snapshot.entries.length) return;
    const confirmed = typeof window !== 'undefined' ? window.confirm('确定要清空全部错题吗？该操作不可撤销。') : true;
    if (!confirmed) return;
    setClearing(true);
    try {
      await clearWrongBook();
      setExpandedEntries(new Set());
      await reload({ includeMastered: showMastered });
    } catch (err) {
      const message = err instanceof Error ? err.message : '清空失败';
      setError(message);
    } finally {
      setClearing(false);
    }
  };

  const handleXiaozhiExplain = (entry: WrongQuestionEntry) => {
    // 正在讲解这条时再点一次 = 跳过播报
    if (explainingId === entry.id) {
      stopXiaozhiSpeech();
      setExplainingId(null);
      return;
    }
    setExplainingId(entry.id);
    const userAnsText =
      entry.userAnswerIndex >= 0 && entry.options[entry.userAnswerIndex]
        ? `${optionLabel(entry.userAnswerIndex)}. ${entry.options[entry.userAnswerIndex]}`
        : '未作答';
    const correctText = `${optionLabel(entry.correctIndex)}. ${entry.options[entry.correctIndex]}`;
    const explanation = entry.explanation ? `。${entry.explanation}` : '';
    const text = `这道题「${entry.question}」，你的答案是 ${userAnsText}，正确答案是 ${correctText}${explanation}`;
    speakXiaozhi(text, {
      onEnd: () => setExplainingId(null),
      onError: () => setExplainingId(null),
    });
  };

  const activeMasteredCount = snapshot.entries.filter((entry) => entry.mastered).length;
  const activePendingCount = snapshot.entries.length - activeMasteredCount;

  const orderedCategories = useMemo(() => {
    const present = Object.keys(snapshot.grouped);
    const ordered = CATEGORY_ORDER.filter((cat) => present.includes(cat));
    const extras = present.filter((cat) => !CATEGORY_ORDER.includes(cat));
    return [...ordered, ...extras];
  }, [snapshot.grouped]);

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-gradient-to-b from-[#050816] via-[#060a1c] to-[#050816] text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-cyan-500/15 via-blue-500/5 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-pink-500/10 via-transparent to-transparent" />

      <div className="relative mx-auto flex min-h-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white/80 transition hover:border-cyan-300/45 hover:bg-cyan-300/10 hover:text-white"
          >
            <ArrowLeft size={16} />
            返回课堂
          </button>
          <div className="flex items-center gap-2 text-xs text-white/55">
            <BookOpenCheck size={16} className="text-cyan-300" />
            <span>随时复盘做错过的题目，按学科分类整理</span>
          </div>
        </header>

        <motion.section
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-black/40 backdrop-blur"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-400/15 text-amber-200">
                <Trophy size={22} />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-wide text-white">我的错题本</h1>
                <p className="text-xs text-white/55">
                  共 <b className="text-amber-200">{snapshot.entries.length}</b> 道错题
                  {activeMasteredCount > 0 && (
                    <span className="ml-2 text-white/45">已掌握 {activeMasteredCount} 道</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:border-cyan-300/40 hover:text-white">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-cyan-400"
                  checked={showMastered}
                  onChange={(event) => setShowMastered(event.target.checked)}
                />
                显示已掌握
              </label>
              <button
                type="button"
                onClick={() => void reload({ includeMastered: showMastered })}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:border-emerald-300/40 hover:text-white"
                disabled={loading}
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                刷新
              </button>
              <button
                type="button"
                onClick={() => void handleClearAll()}
                className="inline-flex items-center gap-2 rounded-2xl border border-rose-300/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:border-rose-300/55 hover:bg-rose-500/20 disabled:opacity-50"
                disabled={clearing || snapshot.entries.length === 0}
              >
                {clearing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                清空错题本
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/12 px-3 py-2 text-xs text-rose-100">
              {error}
            </div>
          )}

          {loading && snapshot.entries.length === 0 ? (
            <div className="mt-6 flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-12 text-sm text-white/55">
              <Loader2 size={18} className="animate-spin text-cyan-300" />
              正在加载错题本…
            </div>
          ) : snapshot.entries.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-emerald-300/30 bg-emerald-400/8 px-5 py-10 text-center text-sm text-emerald-100">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-400/15">
                <CheckCircle2 size={24} />
              </div>
              <p className="text-base font-bold">太棒了，当前没有错题记录！</p>
              <p className="mt-2 text-xs text-white/55">完成答题后，答错的题目会自动整理到这里。</p>
            </div>
          ) : null}
        </motion.section>

        {orderedCategories.length > 0 && (
          <div className="flex flex-col gap-4 pb-10">
            {orderedCategories.map((category) => {
              const items = snapshot.grouped[category] || [];
              if (items.length === 0) return null;
              const isCollapsed = collapsedCategories.has(category);
              const badge = CATEGORY_BADGE[category] || CATEGORY_BADGE.其他;
              const accent = CATEGORY_ACCENT[category] || CATEGORY_ACCENT.其他;
              const masteredCount = items.filter((entry) => entry.mastered).length;
              return (
                <section
                  key={category}
                  className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/55 shadow-xl shadow-black/40 backdrop-blur"
                >
                  <button
                    type="button"
                    onClick={() => toggleCategory(category)}
                    className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-white/5"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-bold ${badge}`}
                      >
                        {category}
                      </span>
                      <h2 className="text-lg font-black text-white">共 {items.length} 题</h2>
                      {masteredCount > 0 && (
                        <span className="text-xs text-white/55">已掌握 {masteredCount} 题</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-white/45">
                      <span>{isCollapsed ? '展开' : '收起'}</span>
                      {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </button>
                  <div className={`h-px bg-gradient-to-r ${accent}`} />
                  <AnimatePresence initial={false}>
                    {!isCollapsed && (
                      <motion.div
                        key="content"
                        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        className="px-5 pb-5 pt-3"
                      >
                        <div className="flex flex-col gap-3">
                          {items.map((entry) => {
                            const expanded = expandedEntries.has(entry.id);
                            const isBusy = busyEntryId === entry.id;
                            const isExplaining = explainingId === entry.id;
                            return (
                              <article
                                key={entry.id}
                                className={`rounded-2xl border ${entry.mastered ? 'border-emerald-300/35 bg-emerald-400/8' : 'border-rose-300/30 bg-rose-500/8'} px-4 py-3 transition`}
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleEntry(entry.id)}
                                  className="flex w-full items-center gap-3 text-left"
                                >
                                  <span
                                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-black ${
                                      entry.mastered
                                        ? 'bg-emerald-400/20 text-emerald-100'
                                        : 'bg-rose-500/15 text-rose-100'
                                    }`}
                                  >
                                    {entry.mastered ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 text-xs text-white/55">
                                      <span className="font-bold text-white/75">{entry.subject}</span>
                                      <span>·</span>
                                      <span>错 {entry.wrongCount} 次</span>
                                      {entry.lastWrongAt && <span>· {formatDate(entry.lastWrongAt)}</span>}
                                    </div>
                                    <div className="mt-1 line-clamp-1 text-sm font-semibold text-white">
                                      {entry.question}
                                    </div>
                                  </div>
                                  {expanded ? <ChevronDown size={16} className="text-white/55" /> : <ChevronRight size={16} className="text-white/55" />}
                                </button>
                                <AnimatePresence initial={false}>
                                  {expanded && (
                                    <motion.div
                                      key="expanded"
                                      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: 'auto' }}
                                      exit={{ opacity: 0, height: 0 }}
                                      transition={{ duration: 0.22 }}
                                      className="mt-3 space-y-3"
                                    >
                                      <div className="rounded-xl border border-white/10 bg-slate-950/55 p-3 text-sm leading-relaxed text-white/80">
                                        <div className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">题干</div>
                                        <p className="mt-1">{entry.question}</p>
                                      </div>
                                      <div className="grid gap-3 md:grid-cols-2">
                                        <div className="rounded-xl border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100">
                                          <div className="text-xs font-bold uppercase tracking-[0.16em] text-rose-200/70">你的答案</div>
                                          <div className="mt-1 font-semibold">
                                            {entry.userAnswerIndex >= 0 && entry.options[entry.userAnswerIndex]
                                              ? `${optionLabel(entry.userAnswerIndex)}. ${entry.options[entry.userAnswerIndex]}`
                                              : '未作答'}
                                          </div>
                                        </div>
                                        <div className="rounded-xl border border-emerald-300/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                                          <div className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-200/70">正确答案</div>
                                          <div className="mt-1 font-semibold">
                                            {optionLabel(entry.correctIndex)}. {entry.options[entry.correctIndex] || '（缺失）'}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm leading-relaxed text-white/80">
                                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-white/45">解析</div>
                                        <p className="mt-1">{entry.explanation || '（暂无解析）'}</p>
                                      </div>
                                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={() => void handleXiaozhiExplain(entry)}
                                            className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/40 bg-cyan-300/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:border-cyan-300/60 hover:bg-cyan-400/20"
                                            title={isExplaining ? '再点一次停止播报' : '让小智讲解'}
                                          >
                                            {isExplaining ? (
                                              <Loader2 size={14} className="animate-spin" />
                                            ) : (
                                              <Sparkles size={14} />
                                            )}
                                            {isExplaining ? '小智讲解中…' : '让小智讲解'}
                                          </button>
                                          {isExplaining && (
                                            <button
                                              type="button"
                                              onClick={() => { stopXiaozhiSpeech(); setExplainingId(null); }}
                                              className="inline-flex items-center gap-2 rounded-xl border border-amber-300/50 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:border-amber-300/70 hover:bg-amber-400/20"
                                              title="跳过播报"
                                            >
                                              <SkipForward size={14} />
                                              跳过
                                            </button>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={() => void handleMaster(entry)}
                                            disabled={isBusy}
                                            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
                                              entry.mastered
                                                ? 'border-amber-300/40 bg-amber-400/10 text-amber-100 hover:border-amber-300/60'
                                                : 'border-emerald-300/40 bg-emerald-400/10 text-emerald-100 hover:border-emerald-300/60'
                                            }`}
                                          >
                                            {isBusy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                            {entry.mastered ? '撤销掌握' : '已掌握'}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => void handleDelete(entry)}
                                            disabled={isBusy}
                                            className="inline-flex items-center gap-2 rounded-xl border border-rose-300/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:border-rose-300/60 hover:bg-rose-500/15 disabled:opacity-60"
                                          >
                                            {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                            移除
                                          </button>
                                        </div>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </article>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>
              );
            })}
            {snapshot.entries.length === 0 && !loading && (
              <div className="rounded-3xl border border-white/10 bg-slate-900/55 px-5 py-8 text-center text-sm text-white/55">
                {showMastered
                  ? '你已经掌握了所有错题，太厉害了！'
                  : `目前还没有未掌握的错题（${activeMasteredCount ? `已掌握 ${activeMasteredCount} 道，勾选"显示已掌握"可查看。` : '请放心开始答题。'}）`}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onBack}
          className="fixed right-5 top-5 z-[85] grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-slate-900/80 text-white/65 transition hover:border-rose-300/45 hover:text-rose-200"
          aria-label="关闭错题本"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
};

export default WrongQuestionBook;
