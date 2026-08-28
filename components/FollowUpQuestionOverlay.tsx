import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Mic, X, XCircle } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ControlRefs, FollowUpQuestion, FollowUpResult } from '../types';
import { judgeFollowUpAnswer } from '../services/agentRuntime';
import { parseFollowUpVoiceAnswer } from '../services/followUpAnswer';
import type { VoiceRecognitionState } from '../services/voiceInputLifecycle';
import XiaozhiMascot from './XiaozhiMascot';

interface FollowUpQuestionOverlayProps {
  question: FollowUpQuestion;
  stageRef: React.RefObject<HTMLElement>;
  controlRef: React.MutableRefObject<ControlRefs>;
  cameraActive: boolean;
  recognizedText: string;
  recognitionState: VoiceRecognitionState;
  questionReady: boolean;
  onAnswerInteractionReady?: (questionId: string) => void;
  onAnswered: (result: FollowUpResult) => void | Promise<void>;
  onExit: () => void;
}

const getOptionText = (option: string, index: 0 | 1) => {
  const label = index === 0 ? 'A' : 'B';
  return option.replace(new RegExp(`^\\s*${label}\\s*[.．、:：]\\s*`, 'i'), '').trim();
};

const FollowUpQuestionOverlay: React.FC<FollowUpQuestionOverlayProps> = ({
  question,
  stageRef,
  controlRef,
  cameraActive,
  recognizedText,
  recognitionState,
  questionReady,
  onAnswerInteractionReady,
  onAnswered,
  onExit,
}) => {
  const reduceMotion = useReducedMotion();
  const [displayedQuestion, setDisplayedQuestion] = useState('');
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [hoveredOption, setHoveredOption] = useState<0 | 1 | null>(null);
  const [hoverProgress, setHoverProgress] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<0 | 1 | null>(null);
  const [result, setResult] = useState<FollowUpResult | null>(null);
  const optionLeftRef = useRef<HTMLButtonElement>(null);
  const optionRightRef = useRef<HTMLButtonElement>(null);
  const pointerRef = useRef<HTMLDivElement>(null);
  const hoverStartRef = useRef(0);
  const hoverOptionRef = useRef<0 | 1 | null>(null);
  const pointerSmoothRef = useRef({ x: 0, y: 0, initialized: false });
  const answeredRef = useRef(false);
  const announcedReadyQuestionIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const onExitRef = useRef(onExit);

  useEffect(() => {
    // React StrictMode runs an extra setup/cleanup cycle in development.
    // Restore the flag during every setup so an answered question can still
    // close itself after the asynchronous feedback speech has finished.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  useEffect(() => {
    const characters = Array.from(question.question);
    setDisplayedQuestion('');
    setOptionsVisible(false);

    if (reduceMotion || characters.length === 0) {
      setDisplayedQuestion(question.question);
      setOptionsVisible(true);
      return;
    }

    let characterIndex = 0;
    let characterTimer = 0;
    let optionsTimer = 0;
    const characterDelay = characters.length > 42 ? 24 : 34;

    const revealNextCharacter = () => {
      characterIndex += 1;
      setDisplayedQuestion(characters.slice(0, characterIndex).join(''));

      if (characterIndex < characters.length) {
        characterTimer = window.setTimeout(revealNextCharacter, characterDelay);
      } else {
        optionsTimer = window.setTimeout(() => setOptionsVisible(true), 180);
      }
    };

    characterTimer = window.setTimeout(revealNextCharacter, 180);
    return () => {
      window.clearTimeout(characterTimer);
      window.clearTimeout(optionsTimer);
    };
  }, [question.id, question.question, reduceMotion]);

  const answerInteractionReady = optionsVisible && questionReady;

  const recognitionHint = (() => {
    if (!questionReady) {
      return { tone: 'text-ink/52', icon: <Loader2 className="h-4 w-4 animate-spin text-cyan" />, text: '小智正在朗读题目和选项，读完后会自动开启语音识别。' };
    }
    switch (recognitionState.phase) {
      case 'waiting':
        return { tone: 'text-amber-100/80', icon: <Loader2 className="h-4 w-4 animate-spin text-amber-200" />, text: recognitionState.message || '正在准备麦克风，请稍候。' };
      case 'connecting':
        return { tone: 'text-cyan', icon: <Loader2 className="h-4 w-4 animate-spin text-cyan" />, text: '正在连接语音识别……' };
      case 'listening':
        return { tone: 'text-emerald-100', icon: <Mic className="h-4 w-4 animate-pulse text-emerald-300" />, text: '正在聆听，请说“A”或“B”。' };
      case 'recognizing':
        return { tone: 'text-cyan', icon: <Mic className="h-4 w-4 animate-pulse text-cyan" />, text: recognitionState.text ? `正在识别：${recognitionState.text}` : '正在识别，请继续说完。' };
      case 'recognized':
        return { tone: 'text-cyan', icon: <Mic className="h-4 w-4 text-cyan" />, text: recognitionState.text ? `已识别：${recognitionState.text}` : '已识别，正在判断答案。' };
      case 'error':
        return { tone: 'text-rose-100', icon: <XCircle className="h-4 w-4 text-rose-300" />, text: `语音识别不可用：${recognitionState.message || '请检查麦克风后重试'}；仍可点击或使用手势作答。` };
      default:
        return { tone: 'text-ink/52', icon: <Mic className="h-4 w-4 text-ink/45" />, text: '语音识别尚未开启；你仍可点击选项，或开启摄像头后用手掌悬停作答。' };
    }
  })();

  useEffect(() => {
    if (!answerInteractionReady || announcedReadyQuestionIdRef.current === question.id) return;
    announcedReadyQuestionIdRef.current = question.id;
    onAnswerInteractionReady?.(question.id);
  }, [answerInteractionReady, onAnswerInteractionReady, question.id]);

  const confirmAnswer = useCallback(async (answer: 0 | 1) => {
    if (answeredRef.current || !answerInteractionReady) return;
    answeredRef.current = true;
    const nextResult = judgeFollowUpAnswer(question, answer);
    setSelectedAnswer(answer);
    setResult(nextResult);
    try {
      await onAnswered(nextResult);
    } finally {
      if (mountedRef.current) onExitRef.current();
    }
  }, [answerInteractionReady, onAnswered, question]);

  const checkHitOnOptions = useCallback((x: number, y: number): 0 | 1 | null => {
    const leftRect = optionLeftRef.current?.getBoundingClientRect();
    const rightRect = optionRightRef.current?.getBoundingClientRect();
    if (leftRect && x >= leftRect.left && x <= leftRect.right && y >= leftRect.top && y <= leftRect.bottom) return 0;
    if (rightRect && x >= rightRect.left && x <= rightRect.right && y >= rightRect.top && y <= rightRect.bottom) return 1;
    return null;
  }, []);

  useEffect(() => {
    if (!answerInteractionReady || result) return;
    const voiceAnswer = parseFollowUpVoiceAnswer(recognizedText, question.options);
    if (voiceAnswer !== null) void confirmAnswer(voiceAnswer);
  }, [answerInteractionReady, confirmAnswer, question.options, recognizedText, result]);

  useEffect(() => {
    if (!cameraActive || !answerInteractionReady || result) return;
    const HOVER_CONFIRM_MS = 1200;
    let animFrame = 0;

    const checkHover = () => {
      let hitOption: 0 | 1 | null = null;
      const handLm = controlRef.current.interactionHandLandmarks;
      const stageEl = stageRef.current;

      if (handLm && handLm.length > 17 && stageEl) {
        const palmPoints = [0, 5, 9, 13, 17];
        let centerX = 0;
        let centerY = 0;
        palmPoints.forEach((idx) => {
          centerX += handLm[idx].x;
          centerY += handLm[idx].y;
        });
        centerX /= palmPoints.length;
        centerY /= palmPoints.length;

        const stageRect = stageEl.getBoundingClientRect();
        const targetX = stageRect.left + (1 - centerX) * stageRect.width;
        const targetY = stageRect.top + centerY * stageRect.height;

        if (!pointerSmoothRef.current.initialized) {
          pointerSmoothRef.current.x = targetX;
          pointerSmoothRef.current.y = targetY;
          pointerSmoothRef.current.initialized = true;
        } else {
          pointerSmoothRef.current.x = pointerSmoothRef.current.x * 0.85 + targetX * 0.15;
          pointerSmoothRef.current.y = pointerSmoothRef.current.y * 0.85 + targetY * 0.15;
        }

        const screenX = pointerSmoothRef.current.x;
        const screenY = pointerSmoothRef.current.y;
        hitOption = checkHitOnOptions(screenX, screenY);

        if (pointerRef.current) {
          pointerRef.current.style.transform = `translate(${screenX}px, ${screenY}px)`;
          pointerRef.current.style.opacity = '1';
        }
      } else if (pointerRef.current) {
        pointerRef.current.style.opacity = '0';
      }

      if (hitOption !== null) {
        if (hoverOptionRef.current === hitOption) {
          const elapsed = performance.now() - hoverStartRef.current;
          const progress = Math.min(1, elapsed / HOVER_CONFIRM_MS);
          setHoverProgress(progress);
          setHoveredOption(hitOption);

          if (progress >= 1) {
            void confirmAnswer(hitOption);
            return;
          }
        } else {
          hoverOptionRef.current = hitOption;
          hoverStartRef.current = performance.now();
          setHoveredOption(hitOption);
          setHoverProgress(0);
        }
      } else if (hoverOptionRef.current !== null) {
        hoverOptionRef.current = null;
        setHoveredOption(null);
        setHoverProgress(0);
      }

      animFrame = requestAnimationFrame(checkHover);
    };

    animFrame = requestAnimationFrame(checkHover);
    return () => cancelAnimationFrame(animFrame);
  }, [answerInteractionReady, cameraActive, checkHitOnOptions, confirmAnswer, controlRef, result, stageRef]);

  return (
    <motion.div
      className="absolute inset-0 z-[75] flex items-center justify-center bg-cyan/45 px-6 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0.01 : 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {cameraActive && (
        <div
          ref={pointerRef}
          className="fixed left-0 top-0 z-[9999] h-8 w-8 pointer-events-none opacity-0 transition-opacity duration-200"
          style={{ willChange: 'transform', transform: 'translate(-100px, -100px)' }}
        >
          <div className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center">
            <div className="h-4 w-4 rounded-full bg-pink-300 shadow-[0_0_15px_rgba(244,114,182,0.85)]" />
            <div className="absolute h-8 w-8 animate-ping rounded-full border-2 border-pink-300/50" />
          </div>
        </div>
      )}

      <motion.div
        layout
        className="relative w-full max-w-3xl rounded-2xl border border-cyan/20 bg-cyan-50/94 p-6 text-ink shadow-2xl shadow-black/60 will-change-transform"
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.965 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.98 }}
        transition={reduceMotion
          ? { duration: 0.01 }
          : { type: 'spring', stiffness: 260, damping: 25, mass: 0.8 }}
      >
        <motion.button
          type="button"
          onClick={onExit}
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl border border-line/10 bg-white/5 text-ink/60 transition hover:bg-white/10 hover:text-ink"
          aria-label="关闭追问"
          title="关闭"
          initial={reduceMotion ? false : { opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: reduceMotion ? 0 : 0.18, duration: reduceMotion ? 0.01 : 0.22 }}
        >
          <X className="h-4 w-4" />
        </motion.button>

        <motion.div
          className="mb-5"
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduceMotion ? 0 : 0.08, duration: reduceMotion ? 0.01 : 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-pink-200/70">
            <XiaozhiMascot state="questioning" size={22} motion="subtle" />
            <span>小智追问</span>
          </div>
          <h2 className="mt-2 text-2xl font-black text-cyan">{question.subject}</h2>
          <p className="mt-3 min-h-7 text-lg font-bold leading-relaxed text-ink" aria-label={question.question}>
            <span aria-hidden="true">{displayedQuestion}</span>
            {!optionsVisible && (
              <motion.span
                aria-hidden="true"
                className="ml-1 inline-block h-[1.05em] w-[2px] translate-y-[0.15em] rounded-full bg-cyan-200"
                animate={{ opacity: [1, 0.25, 1] }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
          </p>
        </motion.div>

        <AnimatePresence initial={false}>
          {optionsVisible && (
            <motion.div
              key="answer-content"
              initial="hidden"
              animate="visible"
              exit="hidden"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.09 } },
              }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                {question.options.map((option, index) => {
                  const optIdx = index as 0 | 1;
                  const isHovered = hoveredOption === optIdx && !result;
                  const isSelected = selectedAnswer === optIdx;
                  const isCorrect = result && question.correctIndex === optIdx;
                  const isWrong = result && isSelected && !isCorrect;

                  return (
                    <motion.button
                      key={option}
                      ref={optIdx === 0 ? optionLeftRef : optionRightRef}
                      type="button"
                      disabled={Boolean(result) || !answerInteractionReady}
                      onClick={() => void confirmAnswer(optIdx)}
                      variants={{
                        hidden: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.975 },
                        visible: { opacity: 1, y: 0, scale: 1 },
                      }}
                      transition={{ duration: reduceMotion ? 0.01 : 0.38, ease: [0.22, 1, 0.36, 1] }}
                      className={`relative min-h-[118px] overflow-hidden rounded-2xl border p-5 text-left transition ${
                        isCorrect
                          ? 'border-emerald-300/60 bg-emerald-400/16'
                          : isWrong
                          ? 'border-rose-300/60 bg-rose-400/16'
                          : isHovered
                          ? 'border-pink-300/70 bg-pink-300/14'
                          : !answerInteractionReady
                          ? 'cursor-wait border-cyan/10 bg-cyan-950/18 opacity-65'
                          : 'border-cyan/18 bg-cyan-950/28 hover:border-cyan/38 hover:bg-cyan-900/30'
                      }`}
                    >
                      {isHovered && (
                        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
                          <div className="h-full bg-pink-300 transition-[width]" style={{ width: `${hoverProgress * 100}%` }} />
                        </div>
                      )}
                      <div className="flex items-start gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10 text-base font-black text-cyan">
                          {optIdx === 0 ? 'A' : 'B'}
                        </span>
                        <span className="pt-1 text-base font-bold leading-relaxed text-ink">
                          {getOptionText(option, optIdx)}
                        </span>
                        {isCorrect && <CheckCircle2 className="ml-auto h-5 w-5 shrink-0 text-emerald-300" />}
                        {isWrong && <XCircle className="ml-auto h-5 w-5 shrink-0 text-rose-300" />}
                      </div>
                    </motion.button>
                  );
                })}
              </div>

              <motion.div
                variants={{
                  hidden: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 },
                  visible: { opacity: 1, y: 0 },
                }}
                transition={{ duration: reduceMotion ? 0.01 : 0.3, ease: 'easeOut' }}
              >
                {result ? (
                  <div className={`mt-5 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold leading-relaxed ${
                    result.isCorrect
                      ? 'border-emerald-300/24 bg-emerald-300/10 text-emerald-50'
                      : 'border-pink-300/24 bg-pink-300/10 text-pink-50'
                  }`}>
                    <XiaozhiMascot state={result.isCorrect ? 'complete' : 'questioning'} size={30} motion="subtle" />
                    <div className="min-w-0">
                      {result.feedback}
                      <div className="mt-2 text-xs font-bold opacity-60">小智正在反馈，追问结束后将返回模型并朗读知识讲解</div>
                    </div>
                  </div>
                ) : (
                  <div className={`mt-5 flex items-start gap-2 rounded-2xl border border-line/8 bg-white/[0.04] px-4 py-3 text-xs font-semibold leading-relaxed ${recognitionHint.tone}`}>
                    <span className="mt-0.5 shrink-0">{recognitionHint.icon}</span>
                    <span>{recognitionHint.text} {questionReady && recognitionState.phase !== 'error' ? '也可以点击选项；开启摄像头后，用手掌悬停 1.2 秒确认。' : ''}</span>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
};

export default FollowUpQuestionOverlay;
