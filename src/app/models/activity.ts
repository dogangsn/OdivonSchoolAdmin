/** gameResults/{id}: one finished game (written by the student app). */
export interface GameResult {
  id: string;
  userId: string;
  gameType: string;
  gameKey: string;
  title: string;
  subject: string;
  grade: number | null;
  categoryId?: string;
  score: number;
  stars: number;
  correct: number;
  total: number;
  durationMs: number;
  createdAt: number;
  classId?: string;
  assignmentId?: string;
}

/** payments/{merchantOid}: PayTR order written by Cloud Functions. */
export interface Payment {
  id: string;
  uid: string;
  email: string;
  plan: 'pro' | 'vip';
  period: 'monthly' | 'yearly';
  amount: number;
  currency: string;
  provider: string;
  status: 'pending' | 'success' | 'failed' | 'failed_final' | 'amount_mismatch';
  testMode?: boolean;
  createdAt: number;
  paidAt?: number;
  totalAmount?: number;
  paymentType?: string;
  failedReason?: string;
  expiresAt?: number;
  updatedAt?: number;
}

export const PAYMENT_STATUS_LABELS: Record<Payment['status'], string> = {
  pending: 'Bekliyor',
  success: 'Başarılı',
  failed: 'Başlatılamadı',
  failed_final: 'Başarısız',
  amount_mismatch: 'Tutar uyuşmadı',
};

/** classes/{id}: a teacher's class. */
export interface Classroom {
  id: string;
  teacherId: string;
  teacherName: string;
  name: string;
  grade: number;
  joinCode: string;
  createdAt: number;
  archived?: boolean;
}

export const GAME_LABELS: Record<string, string | undefined> = {
  speed: 'Hız Turu',
  quiz: 'Bilgi Yarışması',
  match: 'Eşleştir',
  truefalse: 'Doğru / Yanlış',
  sort: 'Sınıflandır',
  clock: 'Saat',
  numberline: 'Sayı Doğrusu',
  fraction: 'Kesirler',
  reading: 'Sesli Okuma',
  attention: 'Dikkat',
};

/** classes/{id}/progress/{uid}: running totals kept by the student's app. */
export interface ClassProgress {
  uid: string;
  displayName: string;
  lastActiveAt: number;
  streakDays: number;
  activities: number;
  answered: number;
  correct: number;
  topics: Record<string, { label: string; subject: string; correct: number; total: number; lastAt: number }>;
}

/** classes/{id}/assignments/{aid}: a teacher's ödev. */
export interface Assignment {
  id: string;
  classId: string;
  teacherId: string;
  kind: 'custom-quiz' | 'custom-match' | 'pool-quiz' | 'speed' | 'exam';
  title: string;
  subject: string;
  dueAt: number | null;
  createdAt: number;
  questionCount?: number;
}

export const ASSIGNMENT_KIND_LABELS: Record<Assignment['kind'], string> = {
  'custom-quiz': 'Öğretmen testi',
  'custom-match': 'Eşleştirme',
  'pool-quiz': 'Havuzdan test',
  speed: 'Hız Turu',
  exam: 'Sınav',
};

/** classes/{id}/assignments/{aid}/submissions/{uid} */
export interface Submission {
  uid: string;
  displayName: string;
  score: number;
  stars: number;
  correct: number;
  total: number;
  bestScore: number;
  attempts: number;
  firstCompletedAt: number;
}

/** Same key the Okullar page groups teachers by. */
export function schoolKey(name: string | undefined | null): string {
  return (name || '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').replace(/[.,]/g, '').trim() || 'okul-belirtilmemis';
}
