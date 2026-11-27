import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DataService } from '../../core/data.service';
import { AiService, GEMINI_MODEL } from '../../core/ai.service';
import { ToastService } from '../../core/toast.service';
import { ago } from '../../core/metrics';
import { Question } from '../../models/question';
import { EducationLevel, LEVEL_LABELS } from '../../models/test-category';
import { Icon } from '../../shared/icon';
import { Badge, Empty, PageHeader } from '../../shared/ui';

@Component({
  selector: 'app-review',
  imports: [FormsModule, Icon, Badge, Empty, PageHeader],
  templateUrl: './review.html',
})
export class Review {
  data = inject(DataService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  readonly ago = ago;
  readonly levelLabels = LEVEL_LABELS;

  categoryId = signal(this.route.snapshot.queryParamMap.get('kategori') ?? '');
  source = signal(this.route.snapshot.queryParamMap.get('kaynak') ?? '');
  drafts = signal<Question[]>([]);
  loading = signal(false);
  selected = signal<Set<string>>(new Set());
  busy = signal(false);
  editing = signal<string | null>(null);
  draft = signal<{ prompt: string; explanation: string; correctOptionId: string; difficulty: number; options: string[] } | null>(null);

  ai = inject(AiService);
  readonly model = GEMINI_MODEL;
  readonly levels: EducationLevel[] = ['ilkokul', 'ortaokul', 'lise', 'kpss'];

  // Yapay zekâ ile üretim
  genOpen = signal(true);
  genCategoryId = signal('');
  genCount = signal(5);
  genDifficulty = signal(2);
  genSubTopic = signal('');
  generating = signal(false);
  keyDrawer = signal(false);
  keyInput = signal('');
  keyTesting = signal(false);
  keyMsg = signal<{ ok: boolean; message: string } | null>(null);

  catsByLevel = computed(() => this.levels.map((l) => ({ level: l, cats: this.data.categories.data().filter((c) => c.level === l) })));
  genCategory = computed(() => this.catMap().get(this.genCategoryId()) ?? null);

  catMap = computed(() => new Map(this.data.categories.data().map((c) => [c.id, c])));
  allSelected = computed(() => this.drafts().length > 0 && this.selected().size === this.drafts().length);

  constructor() {
    this.data.categories.load();
    this.load();
  }

  async load() {
    this.loading.set(true);
    this.selected.set(new Set());
    try {
      this.drafts.set(await this.data.drafts({ categoryId: this.categoryId() || undefined, source: this.source() || undefined, max: 100 }));
    } catch (e: any) {
      this.toast.error('Taslaklar yüklenemedi: ' + (e?.message ?? ''));
    } finally {
      this.loading.set(false);
    }
  }

  toggle(id: string) {
    const s = new Set(this.selected());
    s.has(id) ? s.delete(id) : s.add(id);
    this.selected.set(s);
  }
  toggleAll() {
    this.selected.set(this.allSelected() ? new Set() : new Set(this.drafts().map((q) => q.id)));
  }

  private drop(ids: string[]) {
    const set = new Set(ids);
    this.drafts.update((l) => l.filter((q) => !set.has(q.id)));
    this.selected.set(new Set([...this.selected()].filter((id) => !set.has(id))));
    this.data.poolStatsCache.set(null);
  }

  async approve(qs: Question[]) {
    if (!qs.length) return;
    this.busy.set(true);
    try {
      await this.data.approve(qs);
      this.drop(qs.map((q) => q.id));
      this.toast.success(`${qs.length} soru onaylandı`);
    } catch (e: any) {
      this.toast.error('Onaylanamadı: ' + (e?.message ?? ''));
    } finally {
      this.busy.set(false);
    }
  }

  async reject(qs: Question[]) {
    if (!qs.length) return;
    this.busy.set(true);
    try {
      await Promise.all(qs.map((q) => this.data.setQuestionStatus(q.id, 'rejected')));
      this.drop(qs.map((q) => q.id));
      this.toast.success(`${qs.length} soru reddedildi`);
    } catch (e: any) {
      this.toast.error('Reddedilemedi: ' + (e?.message ?? ''));
    } finally {
      this.busy.set(false);
    }
  }

  openKey() {
    this.keyInput.set(this.ai.apiKey());
    this.keyMsg.set(null);
    this.keyDrawer.set(true);
  }

  async saveKey() {
    this.keyTesting.set(true);
    const r = await this.ai.testApiKey(this.keyInput());
    this.keyMsg.set(r);
    if (r.ok) {
      this.ai.setApiKey(this.keyInput());
      setTimeout(() => this.keyDrawer.set(false), 900);
    }
    this.keyTesting.set(false);
  }

  clearKey() {
    this.ai.setApiKey('');
    this.keyInput.set('');
    this.keyMsg.set(null);
  }

  async generate() {
    const cat = this.genCategory();
    if (!cat) {
      this.toast.error('Önce bir konu seçin.');
      return;
    }
    if (!this.ai.apiKey()) {
      this.openKey();
      return;
    }
    this.generating.set(true);
    try {
      const qs = await this.ai.generate(cat, this.genCount(), this.genDifficulty(), this.genSubTopic().trim() || undefined);
      this.toast.success(`${qs.length} soru üretildi ve onay listesine eklendi.`);
      if (!this.categoryId() || this.categoryId() === cat.id) this.drafts.update((l) => [...qs, ...l]);
      this.data.poolStatsCache.set(null);
    } catch (e: any) {
      this.toast.error(e?.message ?? 'Soru üretilemedi.');
    } finally {
      this.generating.set(false);
    }
  }

  /** Every draft in the pool (all pages and konular). */
  async approveAll() {
    this.busy.set(true);
    try {
      const all = await this.data.drafts({ max: 5000 });
      if (!all.length) return;
      if (!confirm(`Onay bekleyen ${all.length} sorunun tamamı onaylanıp öğrencilere açılsın mı?`)) return;
      await this.data.approve(all);
      this.drafts.set([]);
      this.selected.set(new Set());
      this.data.poolStatsCache.set(null);
      this.toast.success(`${all.length} soru onaylandı`);
    } catch (e: any) {
      this.toast.error('Toplu onay başarısız: ' + (e?.message ?? ''));
    } finally {
      this.busy.set(false);
    }
  }

  async remove(q: Question) {
    if (!confirm('Soru kalıcı olarak silinsin mi?')) return;
    try {
      await this.data.deleteQuestion(q.id);
      this.drop([q.id]);
    } catch (e: any) {
      this.toast.error('Silinemedi: ' + (e?.message ?? ''));
    }
  }

  selectedQuestions() {
    const s = this.selected();
    return this.drafts().filter((q) => s.has(q.id));
  }

  edit(q: Question) {
    this.editing.set(q.id);
    this.draft.set({
      prompt: q.prompt,
      explanation: q.explanation,
      correctOptionId: q.correctOptionId,
      difficulty: q.difficulty,
      options: q.options.map((o) => o.text),
    });
  }

  async saveEdit(q: Question) {
    const d = this.draft();
    if (!d) return;
    const updates: Partial<Question> = {
      prompt: d.prompt.trim(),
      explanation: d.explanation.trim(),
      correctOptionId: d.correctOptionId,
      difficulty: Number(d.difficulty) as Question['difficulty'],
      options: q.options.map((o, i) => ({ ...o, text: (d.options[i] ?? o.text).trim() })),
    };
    try {
      await this.data.updateQuestion(q.id, updates);
      this.drafts.update((l) => l.map((x) => (x.id === q.id ? { ...x, ...updates } : x)));
      this.editing.set(null);
      this.toast.success('Soru güncellendi');
    } catch (e: any) {
      this.toast.error('Kaydedilemedi: ' + (e?.message ?? ''));
    }
  }

  setOption(i: number, v: string) {
    const d = this.draft();
    if (!d) return;
    const options = [...d.options];
    options[i] = v;
    this.draft.set({ ...d, options });
  }

  patch(p: Partial<NonNullable<ReturnType<typeof this.draft>>>) {
    const d = this.draft();
    if (d) this.draft.set({ ...d, ...p });
  }
}
