
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ControlRefs } from '../types';
import { createQuizSession, getQuizResult, QuizSession, QuizQuestion } from '../services/quizData';
import { X, Trophy, Star, Clock, CheckCircle2, XCircle, Zap } from 'lucide-react';

interface QuizOverlayProps {
  stageRef: React.RefObject<HTMLElement>;
  controlRef: React.MutableRefObject<ControlRefs>;
  cameraActive: boolean;
  onExit: () => void;
  subjectFilter?: string;
}

type QuizPhase = 'intro' | 'reading' | 'answering' | 'result' | 'summary';

// ─── TTS helper ──────────────────────────────────────────
const speakQuiz = (text: string): Promise<void> => {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) { resolve(); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.95;
    utterance.pitch = 1.05;
    utterance.volume = 1.0;
    const zhVoice = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('zh'));
    if (zhVoice) utterance.voice = zhVoice;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
};

const cancelSpeech = () => {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
};

// ─── Component ───────────────────────────────────────────
const QuizOverlay: React.FC<QuizOverlayProps> = ({ stageRef, controlRef, cameraActive, onExit, subjectFilter }) => {
  const [phase, setPhase] = useState<QuizPhase>('intro');
  const [session, setSession] = useState<QuizSession>(() => createQuizSession(5, subjectFilter));
  const [countdown, setCountdown] = useState(3);
  const [hoveredOption, setHoveredOption] = useState<0 | 1 | null>(null);
  const [hoverProgress, setHoverProgress] = useState(0); // 0 to 1
  const [selectedAnswer, setSelectedAnswer] = useState<0 | 1 | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);

  const optionLeftRef = useRef<HTMLDivElement>(null);
  const optionRightRef = useRef<HTMLDivElement>(null);
  const restartBtnRef = useRef<HTMLButtonElement>(null);
  const exitBtnRef = useRef<HTMLButtonElement>(null);
  const restartProgressRef = useRef<HTMLDivElement>(null);
  const exitProgressRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<HTMLDivElement>(null);
  const pointerSmoothRef = useRef({ x: 0, y: 0, initialized: false });
  const hoverStartRef = useRef<number>(0);
  const hoverOptionRef = useRef<0 | 1 | null>(null);
  const phaseRef = useRef(phase);
  const sessionRef = useRef(session);
  const mountedRef = useRef(true);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { return () => { mountedRef.current = false; cancelSpeech(); }; }, []);

  const currentQuestion: QuizQuestion | null =
    session.currentIndex < session.questions.length
      ? session.questions[session.currentIndex]
      : null;

  const quizResult = phase === 'summary' ? getQuizResult(session) : null;

  // ─── Phase: INTRO ──────────────────────────────────────
  useEffect(() => {
    if (phase !== 'intro') return;
    let cancelled = false;
    (async () => {
      // Don't await speech so countdown starts immediately
      speakQuiz('答题模式已开启，准备好了吗？');
      
      // countdown 3, 2, 1
      for (let i = 3; i >= 1; i--) {
        if (cancelled) return;
        setCountdown(i);
        await new Promise(r => setTimeout(r, 1000));
      }
      if (cancelled) return;
      setPhase('reading');
    })();
    return () => { cancelled = true; };
  }, [phase]);

  // ─── Phase: READING (TTS only, no typewriter) ─────────────────
  useEffect(() => {
    if (phase !== 'reading' || !currentQuestion) return;
    let cancelled = false;
    setSelectedAnswer(null);
    setIsCorrect(null);
    setHoveredOption(null);
    setHoverProgress(0);
    setShowExplanation(false);
    hoverOptionRef.current = null;

    const qText = currentQuestion.question;

    // Speak the question
    speakQuiz(`第 ${sessionRef.current.currentIndex + 1} 题。${qText}`);
    
    // Immediately advance to answering phase
    setPhase('answering');

    return () => { 
      cancelled = true; 
    };
  }, [phase, currentQuestion]);

  // ─── Phase: ANSWERING — hand hover detection ───────────
  useEffect(() => {
    if (phase !== 'answering') return;
    const HOVER_CONFIRM_MS = 1200;
    let animFrame: number;

    const checkHover = () => {
      if (phaseRef.current !== 'answering') return;

      let hitOption: 0 | 1 | null = null;

      // 1. Check hand landmark (use palm centroid instead of index tip for stability)
      if (cameraActive) {
        const handLm = controlRef.current.interactionHandLandmarks;
        if (handLm && handLm.length > 17) {
          // Calculate palm centroid using wrist and MCP joints
          let centerX = 0;
          let centerY = 0;
          const palmPoints = [0, 5, 9, 13, 17];
          palmPoints.forEach(idx => {
            centerX += handLm[idx].x;
            centerY += handLm[idx].y;
          });
          centerX /= palmPoints.length;
          centerY /= palmPoints.length;

          const stageEl = stageRef.current;
          if (stageEl) {
            const stageRect = stageEl.getBoundingClientRect();
            let targetX = stageRect.left + (1 - centerX) * stageRect.width;
            let targetY = stageRect.top + centerY * stageRect.height;
            
            if (!pointerSmoothRef.current.initialized) {
              pointerSmoothRef.current.x = targetX;
              pointerSmoothRef.current.y = targetY;
              pointerSmoothRef.current.initialized = true;
            } else {
              // High smoothing factor (0.85) for silky and stable movement
              pointerSmoothRef.current.x = pointerSmoothRef.current.x * 0.85 + targetX * 0.15;
              pointerSmoothRef.current.y = pointerSmoothRef.current.y * 0.85 + targetY * 0.15;
            }

            const screenX = pointerSmoothRef.current.x;
            const screenY = pointerSmoothRef.current.y;
            
            hitOption = checkHitOnOptions(screenX, screenY);
            
            // Update virtual pointer position
            if (pointerRef.current) {
              pointerRef.current.style.transform = `translate(${screenX}px, ${screenY}px)`;
              pointerRef.current.style.opacity = '1';
            }
          }
        } else {
          if (pointerRef.current) pointerRef.current.style.opacity = '0';
        }
      }

      // Update hover state
      if (hitOption !== null) {
        if (hoverOptionRef.current === hitOption) {
          // Same option — accumulate hover time
          const elapsed = performance.now() - hoverStartRef.current;
          const progress = Math.min(1, elapsed / HOVER_CONFIRM_MS);
          setHoverProgress(progress);
          setHoveredOption(hitOption);

          if (progress >= 1) {
            // Confirmed!
            confirmAnswer(hitOption);
            return;
          }
        } else {
          // Switched to a different option
          hoverOptionRef.current = hitOption;
          hoverStartRef.current = performance.now();
          setHoveredOption(hitOption);
          setHoverProgress(0);
        }
      } else {
        // No option hovered
        if (hoverOptionRef.current !== null) {
          hoverOptionRef.current = null;
          setHoveredOption(null);
          setHoverProgress(0);
        }
      }

      animFrame = requestAnimationFrame(checkHover);
    };

    animFrame = requestAnimationFrame(checkHover);
    return () => cancelAnimationFrame(animFrame);
  }, [phase, cameraActive]);

  // ─── Phase: SUMMARY — hand hover detection ───────────
  useEffect(() => {
    if (phase !== 'summary') return;
    const HOVER_CONFIRM_MS = 2000;
    let animFrame: number;
    let restartHoverStart = 0;
    let exitHoverStart = 0;

    const checkHover = () => {
      if (phaseRef.current !== 'summary') return;

      if (cameraActive) {
        const handLm = controlRef.current.interactionHandLandmarks;
        if (handLm && handLm.length > 17) {
          let centerX = 0;
          let centerY = 0;
          const palmPoints = [0, 5, 9, 13, 17];
          palmPoints.forEach(idx => {
            centerX += handLm[idx].x;
            centerY += handLm[idx].y;
          });
          centerX /= palmPoints.length;
          centerY /= palmPoints.length;

          const stageEl = stageRef.current;
          if (stageEl) {
            const stageRect = stageEl.getBoundingClientRect();
            let targetX = stageRect.left + (1 - centerX) * stageRect.width;
            let targetY = stageRect.top + centerY * stageRect.height;
            
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
            
            if (pointerRef.current) {
              pointerRef.current.style.transform = `translate(${screenX}px, ${screenY}px)`;
              pointerRef.current.style.opacity = '1';
            }

            const margin = 10;
            let hitRestart = false;
            let hitExit = false;

            if (restartBtnRef.current) {
              const rect = restartBtnRef.current.getBoundingClientRect();
              if (screenX >= rect.left - margin && screenX <= rect.right + margin &&
                  screenY >= rect.top - margin && screenY <= rect.bottom + margin) {
                hitRestart = true;
              }
            }

            if (exitBtnRef.current) {
              const rect = exitBtnRef.current.getBoundingClientRect();
              if (screenX >= rect.left - margin && screenX <= rect.right + margin &&
                  screenY >= rect.top - margin && screenY <= rect.bottom + margin) {
                hitExit = true;
              }
            }

            const now = Date.now();

            if (hitRestart) {
              if (restartHoverStart === 0) restartHoverStart = now;
              exitHoverStart = 0;
              if (exitProgressRef.current) exitProgressRef.current.style.width = '0%';
              const progress = Math.min((now - restartHoverStart) / HOVER_CONFIRM_MS, 1);
              if (restartProgressRef.current) restartProgressRef.current.style.width = `${progress * 100}%`;
              if (progress >= 1) {
                // handleRestart will be called when click confirms, but it's defined later.
                // We can't directly call it here because it's captured in the closure. 
                // So we'll click the button ref instead.
                restartBtnRef.current?.click();
                restartHoverStart = 0;
                if (restartProgressRef.current) restartProgressRef.current.style.width = '0%';
              }
            } else if (hitExit) {
              if (exitHoverStart === 0) exitHoverStart = now;
              restartHoverStart = 0;
              if (restartProgressRef.current) restartProgressRef.current.style.width = '0%';
              const progress = Math.min((now - exitHoverStart) / HOVER_CONFIRM_MS, 1);
              if (exitProgressRef.current) exitProgressRef.current.style.width = `${progress * 100}%`;
              if (progress >= 1) {
                exitBtnRef.current?.click();
                exitHoverStart = 0;
                if (exitProgressRef.current) exitProgressRef.current.style.width = '0%';
              }
            } else {
              restartHoverStart = 0;
              exitHoverStart = 0;
              if (restartProgressRef.current) restartProgressRef.current.style.width = '0%';
              if (exitProgressRef.current) exitProgressRef.current.style.width = '0%';
            }
          }
        } else {
          if (pointerRef.current) pointerRef.current.style.opacity = '0';
          restartHoverStart = 0;
          exitHoverStart = 0;
          if (restartProgressRef.current) restartProgressRef.current.style.width = '0%';
          if (exitProgressRef.current) exitProgressRef.current.style.width = '0%';
        }
      }

      animFrame = requestAnimationFrame(checkHover);
    };

    animFrame = requestAnimationFrame(checkHover);
    return () => cancelAnimationFrame(animFrame);
  }, [phase, cameraActive]);

  const checkHitOnOptions = (screenX: number, screenY: number): 0 | 1 | null => {
    const margin = 10;
    for (const [idx, ref] of [[0, optionLeftRef], [1, optionRightRef]] as const) {
      const el = ref.current;
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (
        screenX >= rect.left - margin &&
        screenX <= rect.right + margin &&
        screenY >= rect.top - margin &&
        screenY <= rect.bottom + margin
      ) {
        return idx;
      }
    }
    return null;
  };

  // ─── Answer confirmation ───────────────────────────────
  const confirmAnswer = useCallback((optionIndex: 0 | 1) => {
    if (phaseRef.current !== 'answering' || !currentQuestion) return;
    
    phaseRef.current = 'result'; // Synchronously block duplicate calls
    setPhase('result');
    setSelectedAnswer(optionIndex);
    
    const correct = optionIndex === currentQuestion.correctIndex;
    setIsCorrect(correct);
    setHoveredOption(null);
    setHoverProgress(0);
    hoverOptionRef.current = null;

    // Record answer
    setSession(prev => {
      const newAnswers = [...prev.answers];
      newAnswers[prev.currentIndex] = optionIndex;
      return { ...prev, answers: newAnswers };
    });
  }, [currentQuestion]);

  // ─── Phase: RESULT ───────────────────────────────────────
  useEffect(() => {
    if (phase !== 'result' || !currentQuestion || selectedAnswer === null) return;
    let cancelled = false;

    const correct = selectedAnswer === currentQuestion.correctIndex;
    
    const advanceNext = () => {
      if (cancelled) return;
      const nextIndex = sessionRef.current.currentIndex + 1;
      if (nextIndex >= sessionRef.current.questions.length) {
        setPhase('summary');
      } else {
        setSession(prev => ({ ...prev, currentIndex: nextIndex }));
        setPhase('reading');
      }
    };

    if (correct) {
      speakQuiz('回答正确！');
      const timer = setTimeout(advanceNext, 2000);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    } else {
      (async () => {
        // Fallback timeouts in case speechSynthesis hangs
        const safeSpeak = (text: string, maxWait: number) => Promise.race([
          speakQuiz(text),
          new Promise<void>(r => setTimeout(r, maxWait))
        ]);

        await safeSpeak(`很遗憾，正确答案是：${currentQuestion.options[currentQuestion.correctIndex]}`, 4000);
        if (cancelled) return;
        
        setShowExplanation(true);
        await safeSpeak(currentQuestion.explanation, 10000);
        if (cancelled) return;
        
        setTimeout(advanceNext, 2000);
      })();
      
      return () => {
        cancelled = true;
      };
    }
  }, [phase, currentQuestion, selectedAnswer]);

  // ─── Speak summary on enter ────────────────────────────
  useEffect(() => {
    if (phase !== 'summary') return;
    const result = getQuizResult(sessionRef.current);
    speakQuiz(`答题结束！你共答对 ${result.correctCount} 题，正确率 ${result.accuracy}%，总用时 ${result.totalTime} 秒。`);
  }, [phase]);

  // ─── Click fallback for non-camera mode ────────────────
  const handleOptionClick = (index: 0 | 1) => {
    if (phase !== 'answering') return;
    confirmAnswer(index);
  };

  // ─── Exit handler ──────────────────────────────────────
  const handleExit = () => {
    cancelSpeech();
    onExit();
  };

  const handleRestart = () => {
    cancelSpeech();
    setSession(createQuizSession(5, subjectFilter));
    setPhase('intro');
    setCountdown(3);
  };

  // ─── Subject emoji helper ─────────────────────────────
  const subjectEmoji = (subject: string) => {
    switch (subject) {
      case '心脏模型': return '🫀';
      case 'HIV 病毒模型': return '🦠';
      case '金刚石模型': return '💎';
      case '金刚石晶胞': return '🧊';
      case '1,4-二氯甲基苯': return '⚗️';
      case 'NaCl 离子晶体': return '🧂';
      case 'SiO₂ 二氧化硅': return '🪨';
      case '硝基苯': return '🧪';
      case '地球内部结构': return '🌍';
      case '地形地貌': return '⛰️';
      default: return '📚';
    }
  };

  // ─── Render ────────────────────────────────────────────
  return (
    <div className="quiz-overlay">
      {/* Virtual Hand Pointer */}
      {cameraActive && (
        <div 
          ref={pointerRef} 
          className="fixed top-0 left-0 w-8 h-8 pointer-events-none z-[9999] opacity-0 transition-opacity duration-200 ease-out"
          style={{ willChange: 'transform', transform: 'translate(-100px, -100px)' }}
        >
          <div className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
            <div className="w-4 h-4 bg-cyan-400 rounded-full shadow-[0_0_15px_rgba(34,211,238,0.8)] animate-pulse" />
            <div className="absolute w-8 h-8 rounded-full border-2 border-cyan-400/50 animate-ping" />
          </div>
        </div>
      )}

      {/* Exit button */}
      <button
        className="quiz-exit-btn"
        onClick={handleExit}
        title="退出答题模式"
      >
        <X size={20} />
      </button>

      {/* ─── INTRO PHASE ─── */}
      {phase === 'intro' && (
        <div className="quiz-center-container quiz-fade-in">
          <div className="quiz-intro-card">
            <div className="quiz-intro-icon">
              <Zap size={48} className="text-yellow-400" />
            </div>
            <h1 className="quiz-intro-title">答题挑战</h1>
            <p className="quiz-intro-subtitle">共 {session.questions.length} 题 · 手势选择答案</p>
            <div className="quiz-countdown-ring">
              <span className="quiz-countdown-number">{countdown}</span>
            </div>
          </div>
        </div>
      )}

      {/* ─── READING / ANSWERING / RESULT ─── */}
      {(phase === 'reading' || phase === 'answering' || phase === 'result') && currentQuestion && (
        <div className="quiz-game-container quiz-fade-in">
          {/* Progress bar */}
          <div className="quiz-progress-bar">
            {session.questions.map((_, i) => (
              <div
                key={i}
                className={`quiz-progress-dot ${
                  i < session.currentIndex ? 'is-done' :
                  i === session.currentIndex ? 'is-current' : ''
                } ${
                  session.answers[i] !== null
                    ? session.answers[i] === session.questions[i].correctIndex ? 'is-correct' : 'is-wrong'
                    : ''
                }`}
              />
            ))}
          </div>

          {/* Subject badge + question number */}
          <div className="quiz-question-header">
            <span className="quiz-subject-badge">
              {subjectEmoji(currentQuestion.subject)} {currentQuestion.subject}
            </span>
            <span className="quiz-question-number">
              {session.currentIndex + 1} / {session.questions.length}
            </span>
          </div>

          {/* Question card */}
          <div className="quiz-question-card">
            <p className="quiz-question-text">
              {currentQuestion.question}
            </p>
          </div>

          {/* Options (always rendered to reserve exact layout space) */}
          <div 
            className="quiz-options-row" 
          >
              {currentQuestion.options.map((option, idx) => {
                const optIdx = idx as 0 | 1;
                const isHovered = hoveredOption === optIdx && phase === 'answering';
                const isSelected = selectedAnswer === optIdx;
                const isCorrectOption = currentQuestion.correctIndex === optIdx;
                const showCorrectMark = phase === 'result' && isCorrectOption;
                const showWrongMark = phase === 'result' && isSelected && !isCorrectOption;

                return (
                  <div
                    key={idx}
                    ref={idx === 0 ? optionLeftRef : optionRightRef}
                    className={`quiz-option-card ${
                      phase === 'answering' ? 'quiz-card-enter' : ''
                    } ${isHovered ? 'is-hovered' : ''} ${
                      showCorrectMark ? 'is-correct' : ''
                    } ${showWrongMark ? 'is-wrong' : ''}`}
                    onClick={() => handleOptionClick(optIdx)}
                  >
                    {/* Hover ring progress */}
                    {isHovered && (
                      <svg className="quiz-hover-ring" viewBox="0 0 100 100">
                        <circle
                          cx="50" cy="50" r="45"
                          className="quiz-hover-ring-track"
                        />
                        <circle
                          cx="50" cy="50" r="45"
                          className="quiz-hover-ring-fill"
                          strokeDasharray="283"
                          strokeDashoffset={283 - hoverProgress * 283}
                        />
                      </svg>
                    )}

                    <div className="quiz-option-label">{String.fromCharCode(65 + idx)}</div>
                    <div className="quiz-option-text">{option}</div>
                  </div>
                );
              })}
            </div>

          {/* Explanation */}
          {phase === 'result' && showExplanation && currentQuestion.explanation && (
            <div className="quiz-explanation quiz-fade-in">
              <p>{currentQuestion.explanation}</p>
            </div>
          )}

          {/* Gesture hint */}
          {phase === 'answering' && cameraActive && (
            <div className="quiz-gesture-hint quiz-fade-in">
              <span>✋ 用手掌指向答案并悬停 1.2 秒确认选择</span>
            </div>
          )}
          {phase === 'answering' && !cameraActive && (
            <div className="quiz-gesture-hint quiz-fade-in">
              <span>💡 请开启摄像头使用手势答题，或直接点击选项</span>
            </div>
          )}
        </div>
      )}

      {/* ─── SUMMARY PHASE ─── */}
      {phase === 'summary' && quizResult && (
        <div className="quiz-center-container quiz-fade-in">
          <div className="quiz-summary-card">
            <div className="quiz-summary-trophy">
              <Trophy size={56} className="text-yellow-400" />
            </div>
            <h2 className="quiz-summary-title">答题结束</h2>
            <div className="quiz-summary-stars">
              {[0, 1, 2].map(i => (
                <Star
                  key={i}
                  size={32}
                  className={i < quizResult.stars ? 'text-yellow-400 fill-yellow-400' : 'text-slate-600'}
                />
              ))}
            </div>
            <div className="quiz-summary-stats">
              <div className="quiz-stat">
                <CheckCircle2 size={20} className="text-emerald-400" />
                <span>{quizResult.correctCount} / {quizResult.totalQuestions} 正确</span>
              </div>
              <div className="quiz-stat">
                <Zap size={20} className="text-cyan-400" />
                <span>正确率 {quizResult.accuracy}%</span>
              </div>
              <div className="quiz-stat">
                <Clock size={20} className="text-purple-400" />
                <span>用时 {quizResult.totalTime} 秒</span>
              </div>
            </div>

            {/* Answer detail list */}
            <div className="quiz-summary-detail">
              {session.questions.map((q, i) => {
                const userAns = session.answers[i];
                const correct = userAns === q.correctIndex;
                return (
                  <div key={q.id} className={`quiz-detail-row ${correct ? 'is-correct' : 'is-wrong'}`}>
                    <span className="quiz-detail-idx">{i + 1}</span>
                    <span className="quiz-detail-q">{q.question.length > 20 ? q.question.slice(0, 20) + '…' : q.question}</span>
                    <span className="quiz-detail-icon">
                      {correct
                        ? <CheckCircle2 size={16} className="text-emerald-400" />
                        : <XCircle size={16} className="text-red-400" />
                      }
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="quiz-summary-actions">
              <button 
                ref={restartBtnRef}
                className="quiz-btn-restart relative overflow-hidden" 
                onClick={handleRestart}
              >
                <div 
                  ref={restartProgressRef}
                  className="absolute left-0 top-0 bottom-0 bg-white/20"
                  style={{ width: '0%' }}
                />
                <span className="relative z-10">再来一轮</span>
              </button>
              <button 
                ref={exitBtnRef}
                className="quiz-btn-exit relative overflow-hidden" 
                onClick={handleExit}
              >
                <div 
                  ref={exitProgressRef}
                  className="absolute left-0 top-0 bottom-0 bg-white/20"
                  style={{ width: '0%' }}
                />
                <span className="relative z-10">退出答题</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuizOverlay;
