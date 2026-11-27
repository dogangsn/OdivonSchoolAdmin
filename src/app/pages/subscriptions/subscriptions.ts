import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { countBy, fmtDate, saasMetrics, tl } from '../../core/metrics';
import { DAY_MS, PLANS, daysLeft, effectivePlan, effectiveStatus, monthlyRevenue } from '../../models/subscription';
import { AppUser } from '../../models/user';
import { Icon } from '../../shared/icon';
import { Avatar, Badge, Empty, Kpi, PageHeader } from '../../shared/ui';
import { Donut, HBars } from '../../shared/charts';

@Component({
  selector: 'app-subscriptions',
  imports: [RouterLink, Icon, Avatar, Badge, Empty, Kpi, PageHeader, Donut, HBars],
  templateUrl: './subscriptions.html',
})
export class Subscriptions {
  data = inject(DataService);
  readonly plans = PLANS;
  readonly fmtDate = fmtDate;
  readonly tl = tl;
  readonly daysLeft = daysLeft;
  readonly effectivePlan = effectivePlan;
  readonly monthlyRevenue = monthlyRevenue;

  view = signal<'renewals' | 'active' | 'trial' | 'expired'>('renewals');
  m = computed(() => saasMetrics(this.data.users.data()));

  subscribers = computed(() => this.data.users.data().filter((u) => u.subscriptionStatus && u.subscriptionStatus !== 'none'));
  active = computed(() => this.subscribers().filter((u) => effectiveStatus(u) === 'active'));
  trial = computed(() => this.subscribers().filter((u) => effectiveStatus(u) === 'trial'));
  expired = computed(() => this.subscribers().filter((u) => effectiveStatus(u) === 'expired'));
  renewals = computed(() => {
    const now = Date.now();
    return this.subscribers()
      .filter((u) => u.subscriptionExpiresAt && u.subscriptionExpiresAt >= now - 7 * DAY_MS && u.subscriptionExpiresAt <= now + 30 * DAY_MS)
      .sort((a, b) => (a.subscriptionExpiresAt ?? 0) - (b.subscriptionExpiresAt ?? 0));
  });
  rows = computed<AppUser[]>(() => {
    const v = this.view();
    const list = v === 'renewals' ? this.renewals() : v === 'active' ? this.active() : v === 'trial' ? this.trial() : this.expired();
    return v === 'renewals' ? list : [...list].sort((a, b) => (a.subscriptionExpiresAt ?? 0) - (b.subscriptionExpiresAt ?? 0));
  });

  arr = computed(() => this.m().mrr * 12);
  arpu = computed(() => (this.m().paying ? Math.round(this.m().mrr / this.m().paying) : 0));
  /** Ended in the last 30 days / (active + those). */
  churn30 = computed(() => {
    const now = Date.now();
    const ended = this.expired().filter((u) => u.subscriptionExpiresAt && now - u.subscriptionExpiresAt <= 30 * DAY_MS).length;
    const base = this.active().length + ended;
    return base ? Math.round((ended / base) * 1000) / 10 : 0;
  });

  mrrByPlan = computed(() => {
    let pro = 0;
    let vip = 0;
    for (const u of this.active()) {
      const r = monthlyRevenue(u);
      if (effectivePlan(u) === 'vip') vip += r;
      else pro += r;
    }
    return [
      { label: 'Pro Öğrenci', value: Math.round(pro), color: '#6366f1' },
      { label: 'VIP Sınav Hazırlık', value: Math.round(vip), color: '#a855f7' },
    ];
  });
  periods = computed(() => [
    { label: 'Aylık', value: this.active().filter((u) => u.subscriptionPeriod !== 'yearly').length, color: '#0ea5e9' },
    { label: 'Yıllık', value: this.active().filter((u) => u.subscriptionPeriod === 'yearly').length, color: '#10b981' },
  ]);
  sources = computed(() =>
    countBy(this.active(), (u) => (u.subscriptionSource === 'paytr' ? 'PayTR' : u.subscriptionSource ? u.subscriptionSource : 'Elle (yönetici)')).map(
      (r) => ({ label: r.key, value: r.count })
    )
  );

  constructor() {
    this.data.users.load();
  }

  name(u: AppUser) {
    return u.displayName || u.email || u.uid;
  }
  tone(u: AppUser) {
    const s = effectiveStatus(u);
    return s === 'active' ? 'emerald' : s === 'trial' ? 'amber' : 'rose';
  }
}
