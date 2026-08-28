// 错题本前端 API 封装

export type QuizCategory = '化学' | '生物' | '地理' | '少儿兴趣' | '其他';

export interface WrongQuestionEntry {
  id: number;
  questionId: string;
  subject: string;
  category: QuizCategory | string;
  question: string;
  options: string[];
  userAnswerIndex: number;
  correctIndex: number;
  explanation: string;
  wrongCount: number;
  mastered: boolean;
  firstWrongAt: string;
  lastWrongAt: string;
}

export interface WrongQuestionPayload {
  questionId: string;
  subject: string;
  category: QuizCategory | string;
  question: string;
  options: string[];
  userAnswerIndex: number;
  correctIndex: number;
  explanation: string;
}

export interface WrongBookSnapshot {
  entries: WrongQuestionEntry[];
  grouped: Record<string, WrongQuestionEntry[]>;
  total: number;
  includeMastered: boolean;
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { message?: string })?.message || '请求失败');
  }
  return data as T;
}

export async function fetchWrongBook(options: { includeMastered?: boolean } = {}): Promise<WrongBookSnapshot> {
  const query = options.includeMastered ? '?includeMastered=true' : '';
  const response = await fetch(`/api/quiz/wrong-questions${query}`, {
    method: 'GET',
    credentials: 'include',
  });
  return readJson<WrongBookSnapshot>(response);
}

export async function submitWrongQuestions(items: WrongQuestionPayload[]): Promise<{ saved: WrongQuestionEntry[]; total: number }> {
  const response = await fetch('/api/quiz/wrong-questions', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  return readJson(response);
}

export async function markWrongQuestionMastered(id: number, mastered: boolean): Promise<WrongQuestionEntry> {
  const response = await fetch(`/api/quiz/wrong-questions/${id}/mastered`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mastered }),
  });
  const data = await readJson<{ entry: WrongQuestionEntry }>(response);
  return data.entry;
}

export async function deleteWrongQuestion(id: number): Promise<void> {
  const response = await fetch(`/api/quiz/wrong-questions/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok && response.status !== 204) await readJson(response);
}

export async function clearWrongBook(): Promise<void> {
  const response = await fetch('/api/quiz/wrong-questions', {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok && response.status !== 204) await readJson(response);
}
