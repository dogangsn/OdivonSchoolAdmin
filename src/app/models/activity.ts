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
