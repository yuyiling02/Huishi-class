import { parseFollowUpVoiceAnswer } from './followUpAnswer.ts';

export type FinalUtteranceContext = {
  answerOnly?: boolean;
  answerOptions?: string[];
};

export type VoiceActivationRequest = {
  id: number;
  scope: 'continuous' | 'follow_up';
  questionId?: string;
};

/** Public recognition state for UI surfaces that need to explain microphone availability. */
export type VoiceRecognitionPhase = 'idle' | 'waiting' | 'connecting' | 'listening' | 'recognizing' | 'recognized' | 'error';

export type VoiceRecognitionState = {
  phase: VoiceRecognitionPhase;
  text?: string;
  message?: string;
};

export type VoiceActivationState = {
  answerOnly: boolean;
  activeAnswerQuestionId?: string;
  disabled: boolean;
  listeningAllowed: boolean;
  speechActive: boolean;
};

/** Decide whether an auto-listen request is ready, stale, or must wait for TTS to release the microphone. */
export const getVoiceActivationDisposition = (
  request: VoiceActivationRequest,
  state: VoiceActivationState,
): 'start' | 'wait' | 'drop' => {
  const isFollowUpRequest = request.scope === 'follow_up';
  if (isFollowUpRequest && (!state.answerOnly || request.questionId !== state.activeAnswerQuestionId)) return 'drop';
  if (state.disabled || !state.listeningAllowed || state.speechActive) return isFollowUpRequest ? 'wait' : 'drop';
  return 'start';
};

/**
 * A final utterance is handed off to the next interaction step. Release ASR
 * first so assistant playback, feedback, and nearby conversation cannot be
 * captured as a new user utterance.
 */
export const shouldCloseVoiceInputAfterFinalUtterance = (
  text: string,
  context: FinalUtteranceContext = {},
) => {
  if (!text.trim()) return false;
  if (!context.answerOnly) return true;
  return parseFollowUpVoiceAnswer(text, context.answerOptions) !== null;
};

/**
 * A normal final voice request starts a fresh teaching interaction even if ASR
 * did not emit an interim result (and therefore no barge-in callback ran).
 * Follow-up answers stay inside their existing question flow.
 */
export const shouldInterruptTeachingPresentationForFinalUtterance = (
  text: string,
  context: FinalUtteranceContext = {},
) => Boolean(text.trim()) && !context.answerOnly;

/** Lock recognition only while an Agent is planning. During executing/explaining, isXiaozhiSpeaking handles TTS overlap. */
export const isVoiceInputLockedByAssistantState = (state: string) =>
  state === 'planning';

/** Closing the knowledge panel ends its presentation state without disturbing unrelated work. */
export const getAssistantStateAfterKnowledgeClose = <State extends string>(state: State): State | 'idle' =>
  state === 'explaining' || state === 'complete' ? 'idle' : state;

/**
 * A knowledge TTS session can be closed before its first audio callback. In
 * that case its voice turn still needs to complete so continuous listening can
 * resume after the global output-tail lock becomes idle.
 */
export const shouldFinishVoiceTurnAfterKnowledgeClose = (
  hasKnowledgeSession: boolean,
  speechActive: boolean,
  voiceTurnAlreadyCompleted: boolean,
) => hasKnowledgeSession && speechActive && !voiceTurnAlreadyCompleted;
