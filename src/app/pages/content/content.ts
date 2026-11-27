import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { downloadCsv, toCsv } from '../../core/metrics';
import { Question } from '../../models/question';
import { EducationLevel, LEVEL_LABELS } from '../../models/test-category';
import { Icon } from '../../shared/icon';
import { Empty, Kpi, PageHeader } from '../../shared/ui';
import { HBars } from '../../shared/charts';

interface QStat {
  id: string;
  n: number;
  correct: number;
  rate: number;
  avgSec: number;
  picks: Record<string, number>;
  categoryId: string;
}

const MIN_ANSWERS = 5;

@Component({
  selector: 'app-content',
  imports: [RouterLink, Icon, Empty, Kpi, PageHeader, HBars],
  templateUrl: './content.html',
})
export class Content {
  data = inject(DataService);
  readonly levelLabels = LEVEL_LABELS;
  readonly levels: EducationLevel[] = ['ilkokul', 'ortaokul', 'lise', 'kpss'];
  readonly minAnswers = MIN_ANSWERS;
  readonly Math = Math;

  level = signal<'all' | EducationLevel>('all');
  sort = signal<'tests' | 'rate' | 'rateDesc' | 'time'>('tests');
  qView = signal<'hard' | 'easy' | 'slow'>('hard');
  questions = signal<Map<string, Question>>(new Map());
  loadingQ = signal(false);

  catMap = computed(() => new Map(this.data.categories.data().map((c) => [c.id, c])));
  attempts = computed(() => this.data.attempts.data().filter((a) => this.level() === 'all' || a.level === this.level()));

  answered = computed(() => this.attempts().reduce((s, a) => s + a.totalCount, 0));
  rate = computed(() => (this.answered() ? Math.round((this.attempts().reduce((s, a) => s + a.correctCount, 0) / this.answered()) * 100) : 0));
  avgSec = computed(() => {
    let t = 0;
    let n = 0;
    for (const a of this.attempts())
      for (const q of a.answers ?? []) {
        t += q.timeSpentSeconds || 0;
        n++;
      }
    return n ? Math.round(t / n) : 0;
  });
  blankRate = computed(() => {
    let b = 0;
    let n = 0;
    for (const a of this.attempts())
      for (const q of a.answers ?? []) {
        n++;
        if (!q.selectedOptionId) b++;
      }
    return n ? Math.round((b / n) * 100) : 0;
  });

  topics = computed(() => {
    const m = new Map<string, { id: string; tests: number; q: number; c: number; sec: number; users: Set<string> }>();
    for (const a of this.attempts()) {
      const r = m.get(a.categoryId) ?? { id: a.categoryId, tests: 0, q: 0, c: 0, sec: 0, users: new Set<string>() };
      r.tests++;
      r.q += a.totalCount;
      r.c += a.correctCount;
      r.sec += (a.answers ?? []).reduce((s, x) => s + (x.timeSpentSeconds || 0), 0);
      r.users.add(a.userId);
      m.set(a.categoryId, r);
    }
    const rows = [...m.values()].map((r) => ({
      ...r,
      cat: this.catMap().get(r.id),
      rate: r.q ? Math.round((r.c / r.q) * 100) : 0,
      avg: r.q ? Math.round(r.sec / r.q) : 0,
      students: r.users.size,
    }));
    const s = this.sort();
    return rows.sort((a, b) => (s === 'rate' ? a.rate - b.rate : s === 'rateDesc' ? b.rate - a.rate : s === 'time' ? b.avg - a.avg : b.tests - a.tests));
  });

  subjectTime = computed(() => {
    const m = new Map<string, { s: number; n: number }>();
    for (const a of this.attempts()) {
      const r = m.get(a.subject) ?? { s: 0, n: 0 };
      for (const q of a.answers ?? []) {
        r.s += q.timeSpentSeconds || 0;
        r.n++;
      }
      m.set(a.subject, r);
    }
    return [...m.entries()].map(([label, r]) => ({ label, value: r.n ? Math.round(r.s / r.n) : 0 })).sort((a, b) => b.value - a.value);
  });
  levelRate = computed(() => {
    const m = new Map<string, { c: number; t: number }>();
    for (const a of this.data.attempts.data()) {
      const r = m.get(a.level) ?? { c: 0, t: 0 };
      r.c += a.correctCount;
      r.t += a.totalCount;
      m.set(a.level, r);
    }
    return [...m.entries()].map(([k, r]) => ({ label: LEVEL_LABELS[k as EducationLevel] ?? k, value: r.t ? Math.round((r.c / r.t) * 100) : 0 }));
  });

  qstats = computed<QStat[]>(() => {
    const m = new Map<string, QStat & { sec: number }>();
    for (const a of this.attempts())
      for (const x of a.answers ?? []) {
        const r = m.get(x.questionId) ?? { id: x.questionId, n: 0, correct: 0, rate: 0, avgSec: 0, sec: 0, picks: {}, categoryId: a.categoryId };
        r.n++;
        if (x.isCorrect) r.correct++;
        r.sec += x.timeSpentSeconds || 0;
        const k = x.selectedOptionId || '—';
        r.picks[k] = (r.picks[k] ?? 0) + 1;
        m.set(x.questionId, r);
      }
    return [...m.values()].filter((r) => r.n >= MIN_ANSWERS).map((r) => ({ ...r, rate: Math.round((r.correct / r.n) * 100), avgSec: Math.round(r.sec / r.n) }));
  });
  qList = computed(() => {
    const v = this.qView();
    const l = [...this.qstats()];
    l.sort((a, b) => (v === 'hard' ? a.rate - b.rate : v === 'easy' ? b.rate - a.rate : b.avgSec - a.avgSec));
    return l.slice(0, 20);
  });

  constructor() {
    this.data.attempts.load();
    this.data.categories.load();
    effect(() => {
      const ids = this.qList().map((q) => q.id).filter((id) => !this.questions().has(id));
      if (ids.length) this.loadQuestions(ids);
    });
  }

  private pending = new Set<string>();
  private async loadQuestions(ids: string[]) {
    const todo = ids.filter((id) => !this.pending.has(id));
    if (!todo.length) return;
    todo.forEach((id) => this.pending.add(id));
    this.loadingQ.set(true);
    try {
      const list = await this.data.questionsByIds(todo);
      const m = new Map(this.questions());
      for (const q of list) m.set(q.id, q);
      this.questions.set(m);
    } catch (e) {
      console.warn(e);
    } finally {
      this.loadingQ.set(false);
    }
  }

  /** Most-picked wrong option of a question. */
  trap(s: QStat): { id: string; pct: number } | null {
    const q = this.questions().get(s.id);
    let best: { id: string; pct: number } | null = null;
    for (const [id, n] of Object.entries(s.picks)) {
      if (id === '—' || id === q?.correctOptionId) continue;
      const pct = Math.round((n / s.n) * 100);
      if (!best || pct > best.pct) best = { id, pct };
    }
    return best;
  }

  rateCls(r: number) {
    return r >= 70 ? 'text-emerald-600' : r >= 50 ? 'text-amber-600' : 'text-rose-600';
  }

  exportCsv() {
    const rows: (string | number)[][] = [['Kademe', 'Ders', 'Konu', 'Test', 'Öğrenci', 'Soru', 'Başarı %', 'Ort. süre (sn)', 'ID']];
    for (const t of this.topics())
      rows.push([t.cat ? LEVEL_LABELS[t.cat.level] : '', t.cat?.subject ?? '', t.cat?.topic ?? t.id, t.tests, t.students, t.q, t.rate, t.avg, t.id]);
    downloadCsv(`icerik-performansi-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  }
}
