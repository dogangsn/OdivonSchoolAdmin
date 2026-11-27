import { Injectable, inject, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  deleteDoc,
  deleteField,
  documentId,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { AppUser } from '../models/user';
import { SubscriptionEvent } from '../models/subscription';
import { TestCategory } from '../models/test-category';
import { TestAttempt } from '../models/test-attempt';
import { Question } from '../models/question';
import { Assignment, ClassProgress, Classroom, GameResult, Payment, Submission } from '../models/activity';
import { DAY_MS } from '../models/subscription';

export interface AdminNote {
  text: string;
  updatedAt: number;
  byName: string;
}

export type UserPatch = { [K in keyof AppUser]?: AppUser[K] | null };

export interface CategoryPoolStat {
  categoryId: string;
  approved: number;
  draft: number;
}

/** One cached collection: data + when it was loaded + loading flag. */
class Cache<T> {
  data;
  at = signal<number | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  private pending: Promise<T> | null = null;

  constructor(empty: T, private loader: () => Promise<T>) {
    this.data = signal<T>(empty);
  }

  /** Loads once; `force` reloads. */
  load(force = false): Promise<T> {
    if (!force && this.at() !== null) return Promise.resolve(this.data());
    if (this.pending) return this.pending;
    this.loading.set(true);
    this.error.set(null);
    this.pending = this.loader()
      .then((d) => {
        this.data.set(d);
        this.at.set(Date.now());
        return d;
      })
      .catch((err) => {
        console.error(err);
        this.error.set(err?.message ?? 'Yüklenemedi');
        return this.data();
      })
      .finally(() => {
        this.loading.set(false);
        this.pending = null;
      });
    return this.pending;
  }
}

/**
 * Every Firestore read/write of the panel. It talks to the same Firebase
 * project as the main app (odivonschool); firestore.rules only let users with
 * role 'admin' read these collections.
 */
@Injectable({ providedIn: 'root' })
export class DataService {
  private fs = inject(Firestore);
  private auth = inject(Auth);

  /** How far back activity (tests, games) is loaded, in days. */
  activityDays = signal(30);

  users = new Cache<AppUser[]>([], async () => {
    const snap = await getDocs(collection(this.fs, 'users'));
    return snap.docs.map((d) => ({ ...(d.data() as AppUser), uid: d.id }));
  });

  categories = new Cache<TestCategory[]>([], async () => {
    const snap = await getDocs(collection(this.fs, 'categories'));
    return snap.docs
      .map((d) => ({ ...(d.data() as TestCategory), id: d.id }))
      .sort((a, b) => a.level.localeCompare(b.level) || a.subject.localeCompare(b.subject, 'tr') || (a.order ?? 0) - (b.order ?? 0));
  });

  payments = new Cache<Payment[]>([], async () => {
    const snap = await getDocs(query(collection(this.fs, 'payments'), orderBy('createdAt', 'desc'), limit(1000)));
    return snap.docs.map((d) => ({ ...(d.data() as Payment), id: d.id }));
  });

  events = new Cache<SubscriptionEvent[]>([], async () => {
    const snap = await getDocs(query(collection(this.fs, 'subscriptionEvents'), orderBy('at', 'desc'), limit(500)));
    return snap.docs.map((d) => ({ ...(d.data() as SubscriptionEvent), id: d.id }));
  });

  attempts = new Cache<TestAttempt[]>([], async () => {
    const since = Date.now() - this.activityDays() * DAY_MS;
    const snap = await getDocs(
      query(collection(this.fs, 'testAttempts'), where('startedAt', '>=', since), orderBy('startedAt', 'desc'), limit(5000))
    );
    return snap.docs.map((d) => ({ ...(d.data() as TestAttempt), id: d.id }));
  });

  games = new Cache<GameResult[]>([], async () => {
    const since = Date.now() - this.activityDays() * DAY_MS;
    const snap = await getDocs(
      query(collection(this.fs, 'gameResults'), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(5000))
    );
    return snap.docs.map((d) => ({ ...(d.data() as GameResult), id: d.id }));
  });

  classes = new Cache<Classroom[]>([], async () => {
    const snap = await getDocs(collection(this.fs, 'classes'));
    return snap.docs.map((d) => ({ ...(d.data() as Classroom), id: d.id })).sort((a, b) => b.createdAt - a.createdAt);
  });

  setActivityDays(days: number) {
    this.activityDays.set(days);
    return Promise.all([this.attempts.load(true), this.games.load(true)]);
  }

  // ---- One user ----

  async user(uid: string): Promise<AppUser | null> {
    const snap = await getDoc(doc(this.fs, `users/${uid}`));
    return snap.exists() ? { ...(snap.data() as AppUser), uid } : null;
  }

  async eventsForUser(uid: string): Promise<SubscriptionEvent[]> {
    const snap = await getDocs(query(collection(this.fs, 'subscriptionEvents'), where('uid', '==', uid)));
    return snap.docs.map((d) => ({ ...(d.data() as SubscriptionEvent), id: d.id })).sort((a, b) => b.at - a.at);
  }

  async attemptsForUser(uid: string): Promise<TestAttempt[]> {
    const snap = await getDocs(query(collection(this.fs, 'testAttempts'), where('userId', '==', uid)));
    return snap.docs.map((d) => ({ ...(d.data() as TestAttempt), id: d.id })).sort((a, b) => b.startedAt - a.startedAt);
  }

  async gamesForUser(uid: string): Promise<GameResult[]> {
    const snap = await getDocs(query(collection(this.fs, 'gameResults'), where('userId', '==', uid)));
    return snap.docs.map((d) => ({ ...(d.data() as GameResult), id: d.id })).sort((a, b) => b.createdAt - a.createdAt);
  }

  async paymentsForUser(uid: string): Promise<Payment[]> {
    const snap = await getDocs(query(collection(this.fs, 'payments'), where('uid', '==', uid)));
    return snap.docs.map((d) => ({ ...(d.data() as Payment), id: d.id })).sort((a, b) => b.createdAt - a.createdAt);
  }

  async noteFor(uid: string): Promise<AdminNote | null> {
    const snap = await getDoc(doc(this.fs, `adminNotes/${uid}`));
    return snap.exists() ? (snap.data() as AdminNote) : null;
  }

  async saveNote(uid: string, text: string): Promise<void> {
    await setDoc(doc(this.fs, `adminNotes/${uid}`), {
      text: text.slice(0, 4000),
      updatedAt: Date.now(),
      byName: this.myName(),
    });
  }

  /** Updates a user and writes one subscriptionEvents line in the same batch. */
  async updateUser(
    user: Pick<AppUser, 'uid' | 'email'>,
    patch: UserPatch,
    event: { type: SubscriptionEvent['type']; summary: string }
  ): Promise<void> {
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) data[key] = value === null ? deleteField() : value;
    const batch = writeBatch(this.fs);
    batch.update(doc(this.fs, `users/${user.uid}`), data);
    const ev = {
      uid: user.uid,
      email: user.email ?? '',
      type: event.type,
      summary: event.summary.slice(0, 300),
      byUid: this.auth.currentUser?.uid ?? '',
      byName: this.myName(),
      at: Date.now(),
    };
    const evRef = doc(collection(this.fs, 'subscriptionEvents'));
    batch.set(evRef, ev);
    await batch.commit();

    // Keep the cached lists in step without reloading everything.
    this.users.data.update((list) =>
      list.map((u) => {
        if (u.uid !== user.uid) return u;
        const next: any = { ...u };
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) delete next[k];
          else next[k] = v;
        }
        return next;
      })
    );
    this.events.data.update((l) => [{ ...ev, id: evRef.id } as SubscriptionEvent, ...l]);
  }

  /** Members of one class (count aggregation, 1 read). */
  async memberCount(classId: string): Promise<number> {
    return (await getCountFromServer(collection(this.fs, `classes/${classId}/members`))).data().count;
  }

  async members(classId: string): Promise<{ uid: string; displayName: string; joinedAt: number }[]> {
    const snap = await getDocs(collection(this.fs, `classes/${classId}/members`));
    return snap.docs.map((d) => d.data() as any).sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? '', 'tr'));
  }

  async classProgress(classId: string): Promise<ClassProgress[]> {
    const snap = await getDocs(collection(this.fs, `classes/${classId}/progress`));
    return snap.docs.map((d) => ({ ...(d.data() as ClassProgress), uid: d.id }));
  }

  async assignments(classId: string): Promise<Assignment[]> {
    const snap = await getDocs(collection(this.fs, `classes/${classId}/assignments`));
    return snap.docs.map((d) => ({ ...(d.data() as Assignment), id: d.id })).sort((a, b) => b.createdAt - a.createdAt);
  }

  async submissions(classId: string, assignmentId: string): Promise<Submission[]> {
    const snap = await getDocs(collection(this.fs, `classes/${classId}/assignments/${assignmentId}/submissions`));
    return snap.docs.map((d) => ({ ...(d.data() as Submission), uid: d.id }));
  }

  /** Questions by id (Firestore `in` takes 30 at a time). */
  async questionsByIds(ids: string[]): Promise<Question[]> {
    const out: Question[] = [];
    for (let i = 0; i < ids.length; i += 30) {
      const chunk = ids.slice(i, i + 30);
      const snap = await getDocs(query(collection(this.fs, 'questions'), where(documentId(), 'in', chunk)));
      out.push(...snap.docs.map((d) => ({ ...(d.data() as Question), id: d.id })));
    }
    return out;
  }

  // ---- Question pool ----

  poolStatsCache = signal<{ at: number; stats: CategoryPoolStat[] } | null>(null);

  async poolTotals(): Promise<{ approved: number; draft: number; rejected: number; teacherDrafts: number }> {
    const ref = collection(this.fs, 'questions');
    const c = async (...filters: [string, string][]) =>
      (await getCountFromServer(query(ref, ...filters.map(([f, v]) => where(f, '==', v))))).data().count;
    const [approved, draft, rejected, teacherDrafts] = await Promise.all([
      c(['reviewStatus', 'approved']),
      c(['reviewStatus', 'draft']),
      c(['reviewStatus', 'rejected']),
      c(['reviewStatus', 'draft'], ['source', 'teacher']),
    ]);
    return { approved, draft, rejected, teacherDrafts };
  }

  async poolStats(categories: TestCategory[]): Promise<CategoryPoolStat[]> {
    const ref = collection(this.fs, 'questions');
    const count = async (categoryId: string, status: string) =>
      (await getCountFromServer(query(ref, where('categoryId', '==', categoryId), where('reviewStatus', '==', status)))).data()
        .count;
    const results: CategoryPoolStat[] = [];
    const queue = categories.slice();
    const workers = Array.from({ length: 8 }, async () => {
      while (queue.length) {
        const c = queue.shift()!;
        const [approved, draft] = await Promise.all([count(c.id, 'approved'), count(c.id, 'draft')]);
        results.push({ categoryId: c.id, approved, draft });
      }
    });
    await Promise.all(workers);
    this.poolStatsCache.set({ at: Date.now(), stats: results });
    return results;
  }

  async drafts(opts: { categoryId?: string; source?: string; max?: number } = {}): Promise<Question[]> {
    const filters = [where('reviewStatus', '==', 'draft')];
    if (opts.categoryId) filters.push(where('categoryId', '==', opts.categoryId));
    if (opts.source) filters.push(where('source', '==', opts.source));
    const snap = await getDocs(query(collection(this.fs, 'questions'), ...filters, limit(opts.max ?? 200)));
    return snap.docs.map((d) => ({ ...(d.data() as Question), id: d.id })).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }

  async questionsInCategory(categoryId: string): Promise<Question[]> {
    const snap = await getDocs(query(collection(this.fs, 'questions'), where('categoryId', '==', categoryId)));
    return snap.docs.map((d) => ({ ...(d.data() as Question), id: d.id })).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }

  setQuestionStatus(id: string, reviewStatus: Question['reviewStatus']) {
    return updateDoc(doc(this.fs, `questions/${id}`), { reviewStatus });
  }

  updateQuestion(id: string, updates: Partial<Question>) {
    return updateDoc(doc(this.fs, `questions/${id}`), updates as any);
  }

  /**
   * Approves questions and writes one "Havuza yeni soru eklendi" notice per
   * konu (poolUpdates), the same way the main app's approval screen does.
   */
  async approve(questions: Question[]): Promise<void> {
    if (!questions.length) return;
    const cats = new Map(this.categories.data().map((c) => [c.id, c]));
    const counts = new Map<string, number>();
    const now = Date.now();
    for (let i = 0; i < questions.length; i += 400) {
      const batch = writeBatch(this.fs);
      for (const q of questions.slice(i, i + 400)) {
        batch.update(doc(this.fs, `questions/${q.id}`), { reviewStatus: 'approved' });
        counts.set(q.categoryId, (counts.get(q.categoryId) ?? 0) + 1);
      }
      await batch.commit();
    }
    const batch = writeBatch(this.fs);
    for (const [categoryId, count] of counts) {
      const cat = cats.get(categoryId);
      if (!cat) continue;
      batch.set(doc(collection(this.fs, 'poolUpdates')), {
        level: cat.level,
        grades: cat.grades ?? [],
        categoryId,
        subject: cat.subject,
        topic: cat.topic,
        count,
        createdAt: now,
      });
    }
    await batch.commit().catch((e) => console.warn('poolUpdates', e));
  }

  deleteQuestion(id: string) {
    return deleteDoc(doc(this.fs, `questions/${id}`));
  }

  private myName() {
    const me = this.auth.currentUser;
    return me?.displayName || me?.email || 'Yönetici';
  }
}
