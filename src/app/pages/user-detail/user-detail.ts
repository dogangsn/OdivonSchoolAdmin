import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import { AdminNote, DataService, UserPatch } from '../../core/data.service';
import { ToastService } from '../../core/toast.service';
import { ago, countBy, dayKey, fmtDate, fmtDateTime, perDay, tl } from '../../core/metrics';
import {
  BillingPeriod,
  DAY_MS,
  PLANS,
  PlanId,
  STATUS_LABELS,
  SubscriptionEvent,
  daysLeft,
  effectivePlan,
  effectiveStatus,
  monthlyRevenue,
} from '../../models/subscription';
import { AppUser, UserRole, isStudentAccountEmail, roleLabel } from '../../models/user';
import { LEVEL_LABELS } from '../../models/test-category';
import { TestAttempt } from '../../models/test-attempt';
import { GAME_LABELS, GameResult, PAYMENT_STATUS_LABELS, Payment, schoolKey } from '../../models/activity';
import { Icon } from '../../shared/icon';
import { Avatar, Badge, Empty, Kpi } from '../../shared/ui';
import { BarChart, HBars } from '../../shared/charts';
import { environment } from '../../../environments/environment';

function endOfDay(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59).getTime();
}
function addMonths(ms: number, months: number): number {
  const d = new Date(ms);
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}

@Component({
  selector: 'app-user-detail',
  imports: [FormsModule, RouterLink, Icon, Avatar, Badge, Empty, Kpi, BarChart, HBars],
  templateUrl: './user-detail.html',
})
export class UserDetail {
  uid = input.required<string>();
  data = inject(DataService);
  private toast = inject(ToastService);
  private auth = inject(Auth);

  readonly plans = PLANS;
  readonly statusLabels = STATUS_LABELS;
  readonly levelLabels = LEVEL_LABELS;
  readonly gameLabels = GAME_LABELS;
  readonly payLabels = PAYMENT_STATUS_LABELS;
  readonly roleLabel = roleLabel;
  readonly ago = ago;
  readonly fmtDate = fmtDate;
  readonly fmtDateTime = fmtDateTime;
  readonly tl = tl;
  readonly isStudentAccountEmail = isStudentAccountEmail;
  readonly appUrl = environment.appUrl;
  readonly schoolKey = schoolKey;

  user = signal<AppUser | null>(null);
  loading = signal(true);
  notFound = signal(false);
  attempts = signal<TestAttempt[]>([]);
  games = signal<GameResult[]>([]);
  payments = signal<Payment[]>([]);
  events = signal<SubscriptionEvent[]>([]);
  note = signal<AdminNote | null>(null);
  noteDraft = signal('');
  busy = signal(false);
  tab = signal<'overview' | 'tests' | 'games' | 'payments' | 'history'>('overview');

  isSelf = computed(() => this.auth.currentUser?.uid === this.uid());
  status = computed(() => effectiveStatus(this.user()));
  plan = computed(() => effectivePlan(this.user()));
  left = computed(() => daysLeft(this.user()));
  mrr = computed(() => monthlyRevenue(this.user()));

  // Forms
  formPlan = signal<Exclude<PlanId, 'free'>>('pro');
  formPeriod = signal<BillingPeriod>('monthly');
  formEnd = signal(dayKey(addMonths(Date.now(), 1)));
  trialDays = signal(7);
  formRole = signal<UserRole>('student');
  suspendReason = signal('');

  successRate = computed(() => {
    const a = this.attempts();
    const t = a.reduce((s, x) => s + x.totalCount, 0);
    return t ? Math.round((a.reduce((s, x) => s + x.correctCount, 0) / t) * 100) : 0;
  });
  questionsSolved = computed(() => this.attempts().reduce((s, x) => s + x.totalCount, 0));
  studyMinutes = computed(() => {
    const t = this.attempts().reduce((s, a) => s + a.answers?.reduce((x, q) => x + (q.timeSpentSeconds || 0), 0), 0);
    const g = this.games().reduce((s, x) => s + (x.durationMs || 0) / 1000, 0);
    return Math.round((t + g) / 60);
  });
  activeDays30 = computed(() => {
    const since = Date.now() - 30 * DAY_MS;
    const days = new Set<string>();
    for (const a of this.attempts()) if (a.startedAt >= since) days.add(dayKey(a.startedAt));
    for (const g of this.games()) if (g.createdAt >= since) days.add(dayKey(g.createdAt));
    return days.size;
  });
  activity = computed(() => {
    const items = [...this.attempts().map((a) => a.startedAt), ...this.games().map((g) => g.createdAt)];
    return perDay(items, (x) => x, 30).map((d) => ({ label: d.day.slice(8, 10) + '.' + d.day.slice(5, 7), value: d.count }));
  });
  bySubject = computed(() => {
    const m = new Map<string, { c: number; t: number }>();
    for (const a of this.attempts()) {
      const r = m.get(a.subject) ?? { c: 0, t: 0 };
      r.c += a.correctCount;
      r.t += a.totalCount;
      m.set(a.subject, r);
    }
    return [...m.entries()]
      .map(([label, r]) => ({ label, value: r.t ? Math.round((r.c / r.t) * 100) : 0 }))
      .sort((a, b) => b.value - a.value);
  });
  byGame = computed(() => countBy(this.games(), (g) => GAME_LABELS[g.gameType] ?? g.gameType).map((r) => ({ label: r.key, value: r.count })));
  /** Classes the teacher runs, or the student belongs to. */
  classes = computed(() => {
    const u = this.user();
    if (!u) return [];
    const all = this.data.classes.data();
    if (u.role === 'teacher') return all.filter((c) => c.teacherId === u.uid);
    const ids = new Set(u.classIds ?? []);
    return all.filter((c) => ids.has(c.id));
  });

  paidTotal = computed(() => this.payments().filter((p) => p.status === 'success').reduce((s, p) => s + (p.totalAmount ?? p.amount), 0));

  constructor() {
    this.data.classes.load();
    effect(() => {
      const id = this.uid();
      this.load(id);
    });
  }

  private async load(uid: string) {
    this.loading.set(true);
    try {
      const u = await this.data.user(uid);
      this.user.set(u);
      this.notFound.set(!u);
      if (u) this.fillForms(u);
    } catch (e: any) {
      this.toast.error('Kullanıcı yüklenemedi: ' + (e?.message ?? ''));
    } finally {
      this.loading.set(false);
    }
    const safe = <T>(p: Promise<T>, fb: T) => p.catch((e) => (console.warn(e), fb));
    const [attempts, games, payments, events, note] = await Promise.all([
      safe(this.data.attemptsForUser(uid), []),
      safe(this.data.gamesForUser(uid), []),
      safe(this.data.paymentsForUser(uid), []),
      safe(this.data.eventsForUser(uid), []),
      safe(this.data.noteFor(uid), null),
    ]);
    this.attempts.set(attempts);
    this.games.set(games);
    this.payments.set(payments);
    this.events.set(events);
    this.note.set(note);
    this.noteDraft.set(note?.text ?? '');
  }

  private fillForms(u: AppUser) {
    const p = effectivePlan(u);
    this.formPlan.set(p === 'vip' ? 'vip' : 'pro');
    this.formPeriod.set(u.subscriptionPeriod ?? 'monthly');
    if (u.subscriptionExpiresAt && u.subscriptionExpiresAt > Date.now()) this.formEnd.set(dayKey(u.subscriptionExpiresAt));
    this.formRole.set(u.role === 'user' ? 'student' : u.role);
  }

  setPeriod(p: BillingPeriod) {
    this.formPeriod.set(p);
    this.formEnd.set(dayKey(addMonths(Date.now(), p === 'yearly' ? 12 : 1)));
  }

  private async run(patch: UserPatch, type: SubscriptionEvent['type'], summary: string) {
    const u = this.user();
    if (!u) return;
    this.busy.set(true);
    try {
      await this.data.updateUser(u, patch, { type, summary });
      const next: any = { ...u };
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) delete next[k];
        else next[k] = v;
      }
      this.user.set(next);
      this.fillForms(next);
      this.events.set(await this.data.eventsForUser(u.uid));
      this.toast.success('Kaydedildi: ' + summary);
    } catch (e: any) {
      this.toast.error('Kaydedilemedi: ' + (e?.message ?? 'bilinmeyen hata'));
    } finally {
      this.busy.set(false);
    }
  }

  saveSubscription() {
    const u = this.user();
    if (!u) return;
    const end = endOfDay(this.formEnd());
    if (!Number.isFinite(end) || end <= Date.now()) {
      this.toast.error('Bitiş tarihi bugünden sonra olmalı.');
      return;
    }
    const plan = this.formPlan();
    const period = this.formPeriod();
    const startedAt = this.status() === 'active' && u.subscriptionStartedAt ? u.subscriptionStartedAt : Date.now();
    this.run(
      {
        subscriptionStatus: 'active',
        subscriptionPlan: plan,
        subscriptionPeriod: period,
        subscriptionStartedAt: startedAt,
        subscriptionExpiresAt: end,
        subscriptionSource: 'manual',
      },
      'plan',
      `${PLANS[plan].label} (${period === 'yearly' ? 'yıllık' : 'aylık'}) aktif, bitiş ${fmtDate(end)}`
    );
  }

  startTrial() {
    const days = Math.round(this.trialDays());
    if (!(days >= 1 && days <= 90)) {
      this.toast.error('Deneme süresi 1 ile 90 gün arasında olmalı.');
      return;
    }
    const plan = this.formPlan();
    const end = endOfDay(dayKey(Date.now() + days * DAY_MS));
    this.run(
      { subscriptionStatus: 'trial', subscriptionPlan: plan, subscriptionStartedAt: Date.now(), subscriptionExpiresAt: end, subscriptionSource: 'manual' },
      'trial',
      `${days} günlük ${PLANS[plan].label} denemesi, bitiş ${fmtDate(end)}`
    );
  }

  extend(days: number) {
    const u = this.user();
    if (!u) return;
    const from = Math.max(Date.now(), u.subscriptionExpiresAt ?? 0);
    const end = endOfDay(dayKey(from + days * DAY_MS));
    const status = this.status() === 'trial' ? 'trial' : 'active';
    const patch: UserPatch = { subscriptionExpiresAt: end, subscriptionStatus: status };
    if (!u.subscriptionPlan || u.subscriptionPlan === 'free') patch.subscriptionPlan = this.formPlan();
    if (status === 'active' && this.status() !== 'active') patch.subscriptionStartedAt = Date.now();
    this.run(patch, 'extend', `${days} gün uzatıldı, yeni bitiş ${fmtDate(end)}`);
  }

  endNow() {
    if (!confirm('Abonelik şimdi sonlandırılsın mı? Kullanıcı ücretsiz plana düşer.')) return;
    this.run({ subscriptionStatus: 'expired', subscriptionExpiresAt: Date.now() }, 'cancel', 'Abonelik sonlandırıldı');
  }

  resetToFree() {
    if (!confirm('Abonelik bilgileri silinip kullanıcı ücretsiz plana alınsın mı?')) return;
    this.run(
      {
        subscriptionStatus: 'none',
        subscriptionPlan: null,
        subscriptionPeriod: null,
        subscriptionStartedAt: null,
        subscriptionExpiresAt: null,
        subscriptionSource: null,
      },
      'cancel',
      'Ücretsiz plana alındı'
    );
  }

  saveRole() {
    const u = this.user();
    const role = this.formRole();
    if (!u || this.isSelf() || role === u.role || (u.role === 'user' && role === 'student')) return;
    if (role === 'admin' && !confirm(`${u.email} yönetici yapılsın mı? Panelin tamamına erişebilir.`)) return;
    this.run({ role }, 'role', `Rol: ${roleLabel(u.role)} → ${roleLabel(role)}`);
  }

  toggleTeacherVerified() {
    const u = this.user();
    if (!u) return;
    const next = !u.teacherVerified;
    this.run({ teacherVerified: next }, 'verify', next ? 'Öğretmen onaylandı' : 'Öğretmen onayı kaldırıldı');
  }

  suspend() {
    const u = this.user();
    if (!u || this.isSelf()) return;
    const reason = this.suspendReason().trim().slice(0, 200);
    if (!confirm(`${u.displayName || u.email} hesabı askıya alınsın mı?`)) return;
    this.run({ suspended: true, suspendedReason: reason || null }, 'suspend', reason ? `Hesap askıya alındı: ${reason}` : 'Hesap askıya alındı');
  }

  unsuspend() {
    this.run({ suspended: null, suspendedReason: null }, 'unsuspend', 'Askı kaldırıldı');
  }

  async saveNote() {
    this.busy.set(true);
    try {
      await this.data.saveNote(this.uid(), this.noteDraft().trim());
      this.note.set(await this.data.noteFor(this.uid()));
      this.toast.success('Not kaydedildi.');
    } catch (e: any) {
      this.toast.error('Not kaydedilemedi: ' + (e?.message ?? ''));
    } finally {
      this.busy.set(false);
    }
  }

  statusTone() {
    if (this.user()?.suspended) return 'rose' as const;
    const s = this.status();
    return s === 'active' ? 'emerald' : s === 'trial' ? 'amber' : s === 'expired' ? 'rose' : 'slate';
  }
  payTone(s: string) {
    return s === 'success' ? 'emerald' : s === 'pending' ? 'amber' : 'rose';
  }
  rateTone(r: number) {
    return r >= 70 ? 'text-emerald-600' : r >= 50 ? 'text-amber-600' : 'text-rose-600';
  }
  eventIcon(type: SubscriptionEvent['type']) {
    return ({ plan: '💳', trial: '⏳', extend: '➕', cancel: '⛔', suspend: '⏸️', unsuspend: '▶️', role: '🛡️', verify: '✅' } as const)[type] ?? '•';
  }
  copy(text: string) {
    navigator.clipboard?.writeText(text).then(() => this.toast.success('Kopyalandı'));
  }
}
