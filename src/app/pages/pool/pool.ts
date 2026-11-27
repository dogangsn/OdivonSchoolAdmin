import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CategoryPoolStat, DataService } from '../../core/data.service';
import { ToastService } from '../../core/toast.service';
import { ago, downloadCsv, toCsv } from '../../core/metrics';
import { Question } from '../../models/question';
import { EducationLevel, LEVEL_LABELS, TestCategory } from '../../models/test-category';
import { Icon } from '../../shared/icon';
import { Badge, Empty, Kpi, PageHeader } from '../../shared/ui';

/** A test asks for 10 questions; fewer than this and every test repeats. */
export const TARGET = 10;

interface Row {
  cat: TestCategory;
  approved: number;
  draft: number;
}

@Component({
  selector: 'app-pool',
  imports: [RouterLink, Icon, Badge, Empty, Kpi, PageHeader],
  templateUrl: './pool.html',
})
export class Pool {
  data = inject(DataService);
  private toast = inject(ToastService);
  readonly levelLabels = LEVEL_LABELS;
  readonly levels: EducationLevel[] = ['ilkokul', 'ortaokul', 'lise', 'kpss'];
  readonly target = TARGET;
  readonly ago = ago;
  readonly Math = Math;

  totals = signal<{ approved: number; draft: number; rejected: number; teacherDrafts: number } | null>(null);
  counting = signal(false);
  level = signal<'all' | EducationLevel>('all');
  subject = signal('all');
  only = signal<'all' | 'short' | 'empty' | 'drafts'>('all');
  q = signal('');

  open = signal<TestCategory | null>(null);
  questions = signal<Question[]>([]);
  qLoading = signal(false);
  qFilter = signal<'all' | 'approved' | 'draft' | 'rejected'>('all');

  stats = computed(() => new Map((this.data.poolStatsCache()?.stats ?? []).map((s) => [s.categoryId, s])));
  rows = computed<Row[]>(() =>
    this.data.categories.data().map((cat) => {
      const s = this.stats().get(cat.id);
      return { cat, approved: s?.approved ?? 0, draft: s?.draft ?? 0 };
    })
  );
  subjects = computed(() => {
    const l = this.level();
    return [...new Set(this.data.categories.data().filter((c) => l === 'all' || c.level === l).map((c) => c.subject))].sort((a, b) => a.localeCompare(b, 'tr'));
  });
  filtered = computed(() => {
    const q = this.q().trim().toLocaleLowerCase('tr');
    return this.rows().filter((r) => {
      if (this.level() !== 'all' && r.cat.level !== this.level()) return false;
      if (this.subject() !== 'all' && r.cat.subject !== this.subject()) return false;
      if (this.only() === 'short' && r.approved >= TARGET) return false;
      if (this.only() === 'empty' && r.approved > 0) return false;
      if (this.only() === 'drafts' && r.draft === 0) return false;
      if (q && !`${r.cat.topic} ${r.cat.subject} ${r.cat.id}`.toLocaleLowerCase('tr').includes(q)) return false;
      return true;
    });
  });

  coverage = computed(() =>
    this.levels.map((l) => {
      const rows = this.rows().filter((r) => r.cat.level === l);
      const ready = rows.filter((r) => r.approved >= TARGET).length;
      return { level: l, total: rows.length, ready, pct: rows.length ? Math.round((ready / rows.length) * 100) : 0, approved: rows.reduce((s, r) => s + r.approved, 0) };
    })
  );
  readyCount = computed(() => this.rows().filter((r) => r.approved >= TARGET).length);
  emptyCount = computed(() => this.rows().filter((r) => r.approved === 0).length);

  visibleQuestions = computed(() => this.questions().filter((q) => this.qFilter() === 'all' || q.reviewStatus === this.qFilter()));

  constructor() {
    this.data.categories.load();
    this.loadTotals();
  }

  async loadTotals() {
    try {
      this.totals.set(await this.data.poolTotals());
    } catch (e: any) {
      this.toast.error('Havuz sayılamadı: ' + (e?.message ?? ''));
    }
  }

  async count() {
    this.counting.set(true);
    try {
      const cats = await this.data.categories.load();
      await Promise.all([this.data.poolStats(cats), this.loadTotals()]);
    } catch (e: any) {
      this.toast.error('Sayım başarısız: ' + (e?.message ?? ''));
    } finally {
      this.counting.set(false);
    }
  }

  async openCat(cat: TestCategory) {
    this.open.set(cat);
    this.qLoading.set(true);
    this.questions.set([]);
    try {
      this.questions.set(await this.data.questionsInCategory(cat.id));
    } catch (e: any) {
      this.toast.error('Sorular yüklenemedi: ' + (e?.message ?? ''));
    } finally {
      this.qLoading.set(false);
    }
  }

  private bump(categoryId: string, from: Question['reviewStatus'], to: Question['reviewStatus'] | null) {
    const cache = this.data.poolStatsCache();
    if (!cache) return;
    const stats = cache.stats.map((s): CategoryPoolStat => {
      if (s.categoryId !== categoryId) return s;
      const n = { ...s };
      if (from === 'approved') n.approved--;
      if (from === 'draft') n.draft--;
      if (to === 'approved') n.approved++;
      if (to === 'draft') n.draft++;
      return n;
    });
    this.data.poolStatsCache.set({ ...cache, stats });
  }

  async setStatus(q: Question, status: Question['reviewStatus']) {
    try {
      if (status === 'approved') await this.data.approve([q]);
      else await this.data.setQuestionStatus(q.id, status);
      this.bump(q.categoryId, q.reviewStatus, status);
      this.questions.update((l) => l.map((x) => (x.id === q.id ? { ...x, reviewStatus: status } : x)));
    } catch (e: any) {
      this.toast.error('Güncellenemedi: ' + (e?.message ?? ''));
    }
  }

  async remove(q: Question) {
    if (!confirm('Soru kalıcı olarak silinsin mi?')) return;
    try {
      await this.data.deleteQuestion(q.id);
      this.bump(q.categoryId, q.reviewStatus, null);
      this.questions.update((l) => l.filter((x) => x.id !== q.id));
    } catch (e: any) {
      this.toast.error('Silinemedi: ' + (e?.message ?? ''));
    }
  }

  tone(s: Question['reviewStatus']) {
    return s === 'approved' ? 'emerald' : s === 'draft' ? 'amber' : 'rose';
  }
  statusLabel(s: Question['reviewStatus']) {
    return s === 'approved' ? 'Onaylı' : s === 'draft' ? 'Taslak' : 'Reddedildi';
  }

  exportCsv() {
    const rows: (string | number)[][] = [['Kademe', 'Ders', 'Konu', 'Sınıflar', 'Onaylı', 'Taslak', 'Hedef', 'Eksik', 'ID']];
    for (const r of this.filtered())
      rows.push([LEVEL_LABELS[r.cat.level], r.cat.subject, r.cat.topic, (r.cat.grades ?? []).join(','), r.approved, r.draft, TARGET, Math.max(0, TARGET - r.approved), r.cat.id]);
    downloadCsv(`odivon-soru-havuzu-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  }
}
