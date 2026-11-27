import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { ago, change, countBy, fmtDate, perDay, saasMetrics, tl } from '../../core/metrics';
import { DAY_MS, PLANS, daysLeft } from '../../models/subscription';
import { AppUser, isStudent, roleLabel } from '../../models/user';
import { LEVEL_LABELS } from '../../models/test-category';
import { PAYMENT_STATUS_LABELS } from '../../models/activity';
import { Icon } from '../../shared/icon';
import { Avatar, Badge, Empty, Kpi, PageHeader } from '../../shared/ui';
import { BarChart, Donut, HBars, LineChart } from '../../shared/charts';

const short = (key: string) => key.slice(8, 10) + '.' + key.slice(5, 7);

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, Icon, Kpi, Badge, Avatar, Empty, PageHeader, BarChart, LineChart, Donut, HBars],
  templateUrl: './dashboard.html',
})
export class Dashboard {
  data = inject(DataService);
  readonly ago = ago;
  readonly fmtDate = fmtDate;
  readonly tl = tl;
  readonly plans = PLANS;
  readonly payLabels = PAYMENT_STATUS_LABELS;
  readonly roleLabel = roleLabel;
  readonly daysLeft = daysLeft;

  now = Date.now();
  loading = computed(() => this.data.users.loading() && !this.data.users.at());

  m = computed(() => saasMetrics(this.data.users.data(), this.now));

  newPrev30 = computed(
    () => this.data.users.data().filter((u) => u.createdAt && this.now - u.createdAt > 30 * DAY_MS && this.now - u.createdAt <= 60 * DAY_MS).length
  );
  newDelta = computed(() => change(this.m().newLast30, this.newPrev30()));

  successPayments = computed(() => this.data.payments.data().filter((p) => p.status === 'success' && !p.testMode));
  revenue30 = computed(() =>
    this.successPayments()
      .filter((p) => (p.paidAt ?? p.createdAt) >= this.now - 30 * DAY_MS)
      .reduce((s, p) => s + (p.totalAmount ?? p.amount), 0)
  );
  revenuePrev30 = computed(() =>
    this.successPayments()
      .filter((p) => {
        const t = p.paidAt ?? p.createdAt;
        return t < this.now - 30 * DAY_MS && t >= this.now - 60 * DAY_MS;
      })
      .reduce((s, p) => s + (p.totalAmount ?? p.amount), 0)
  );
  revenueDelta = computed(() => change(this.revenue30(), this.revenuePrev30()));

  signups = computed(() =>
    perDay(this.data.users.data(), (u) => u.createdAt, 30, this.now).map((d) => ({ label: short(d.day), value: d.count }))
  );
  activeDaily = computed(() =>
    perDay(this.data.users.data(), (u) => u.lastSeenAt, 30, this.now).map((d) => ({ label: short(d.day), value: d.count }))
  );
  revenueDaily = computed(() =>
    perDay(this.successPayments(), (p) => p.paidAt ?? p.createdAt, 30, this.now, (p) => p.totalAmount ?? p.amount).map((d) => ({
      label: short(d.day),
      value: d.count,
    }))
  );

  tests = computed(() => perDay(this.data.attempts.data(), (a) => a.startedAt, 30, this.now).map((d) => ({ label: short(d.day), value: d.count })));
  games = computed(() => perDay(this.data.games.data(), (g) => g.createdAt, 30, this.now).map((d) => ({ label: short(d.day), value: d.count })));
  totalTests = computed(() => this.data.attempts.data().length);
  totalGames = computed(() => this.data.games.data().length);
  avgSuccess = computed(() => {
    const a = this.data.attempts.data();
    const total = a.reduce((s, x) => s + x.totalCount, 0);
    return total ? Math.round((a.reduce((s, x) => s + x.correctCount, 0) / total) * 100) : 0;
  });

  planSegments = computed(() => [
    { label: 'Ücretsiz', value: this.m().byPlan.free, color: '#94a3b8' },
    { label: 'Pro Öğrenci', value: this.m().byPlan.pro, color: '#6366f1' },
    { label: 'VIP Sınav Hazırlık', value: this.m().byPlan.vip, color: '#a855f7' },
  ]);
  roleSegments = computed(() => [
    { label: 'Öğrenci', value: this.m().students, color: '#0ea5e9' },
    { label: 'Öğretmen', value: this.m().teachers, color: '#10b981' },
    { label: 'Yönetici', value: this.m().admins, color: '#f59e0b' },
  ]);

  levels = computed(() =>
    countBy(this.data.users.data().filter(isStudent), (u) => (u.gradeLevel ? LEVEL_LABELS[u.gradeLevel] : 'Belirtilmemiş')).map((r) => ({
      label: r.key,
      value: r.count,
    }))
  );
  grades = computed(() => {
    const rows = countBy(
      this.data.users.data().filter((u) => isStudent(u) && u.grade),
      (u) => String(u.grade)
    ).sort((a, b) => Number(a.key) - Number(b.key));
    return rows.map((r) => ({ label: r.key + '. sınıf', value: r.count }));
  });
  topSubjects = computed(() =>
    countBy(this.data.attempts.data(), (a) => a.subject)
      .slice(0, 6)
      .map((r) => ({ label: r.key, value: r.count }))
  );

  recentUsers = computed(() =>
    [...this.data.users.data()].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, 6)
  );
  recentPayments = computed(() => this.data.payments.data().slice(0, 6));
  recentEvents = computed(() => this.data.events.data().slice(0, 8));

  alerts = computed(() => {
    const m = this.m();
    return [
      { key: 'trial', title: 'Denemesi bitmek üzere', hint: '3 gün veya daha az', tone: 'amber' as const, users: m.trialsEndingSoon },
      { key: 'lapsed', title: 'Süresi geçmiş abonelik', hint: 'Yenileme bekleniyor', tone: 'rose' as const, users: m.lapsed },
      { key: 'teacher', title: 'Onay bekleyen öğretmen', hint: 'Doğrulanmamış', tone: 'sky' as const, users: m.unverifiedTeachers },
    ];
  });

  constructor() {
    this.data.users.load();
    this.data.payments.load();
    this.data.events.load();
    this.data.attempts.load();
    this.data.games.load();
  }

  refresh() {
    this.now = Date.now();
    this.data.users.load(true);
    this.data.payments.load(true);
    this.data.events.load(true);
    this.data.attempts.load(true);
    this.data.games.load(true);
  }

  name(u: AppUser) {
    return u.displayName || u.email || u.uid;
  }

  eventTone(type: string): 'emerald' | 'amber' | 'indigo' | 'rose' | 'purple' | 'sky' | 'slate' {
    return ({ plan: 'emerald', trial: 'amber', extend: 'indigo', cancel: 'rose', suspend: 'rose', unsuspend: 'emerald', role: 'purple', verify: 'sky' } as const)[
      type as 'plan'
    ] ?? 'slate';
  }
  payTone(s: string) {
    return s === 'success' ? 'emerald' : s === 'pending' ? 'amber' : 'rose';
  }
}
