import { Component, computed, inject, signal } from '@angular/core';
import { DataService } from '../../core/data.service';
import { DAY_MS, PAID_PLANS, effectivePlan, effectiveStatus } from '../../models/subscription';
import { isStudent } from '../../models/user';
import { Kpi, PageHeader } from '../../shared/ui';
import { BarChart } from '../../shared/charts';

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const WEEK = 7 * DAY_MS;

/** Monday 00:00 of the week `ms` falls in. */
function weekStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

@Component({
  selector: 'app-growth',
  imports: [Kpi, PageHeader, BarChart],
  templateUrl: './growth.html',
})
export class Growth {
  data = inject(DataService);
  range = signal<30 | 90 | 0>(90);
  audience = signal<'all' | 'student' | 'teacher'>('all');
  readonly weeks = 8;
  readonly Math = Math;
  readonly offsets = Array.from({ length: 8 }, (_, i) => i);

  users = computed(() => {
    const since = this.range() ? Date.now() - this.range() * DAY_MS : 0;
    const a = this.audience();
    return this.data.users
      .data()
      .filter((u) => u.role !== 'admin' && (u.createdAt ?? 0) >= since)
      .filter((u) => (a === 'all' ? true : a === 'student' ? isStudent(u) : u.role === 'teacher'));
  });

  /** Users with at least one test or game in the loaded activity window. */
  activeIds = computed(() => {
    const s = new Set<string>();
    for (const a of this.data.attempts.data()) s.add(a.userId);
    for (const g of this.data.games.data()) s.add(g.userId);
    return s;
  });

  funnel = computed(() => {
    const u = this.users();
    const returned = u.filter((x) => x.lastSeenAt && x.createdAt && x.lastSeenAt - x.createdAt > DAY_MS);
    const engaged = u.filter((x) => (x.xp ?? 0) > 0 || !!x.lastPlayedDate || this.activeIds().has(x.uid));
    const tried = u.filter((x) => !!x.subscriptionStartedAt || (x.subscriptionStatus && x.subscriptionStatus !== 'none'));
    const paying = u.filter((x) => effectiveStatus(x) === 'active' && PAID_PLANS.includes(effectivePlan(x)));
    const total = u.length || 1;
    return [
      { label: 'Kayıt oldu', n: u.length, color: '#6366f1' },
      { label: 'Ertesi gün(ler) geri döndü', n: returned.length, color: '#8b5cf6' },
      { label: 'Test ya da oyun yaptı', n: engaged.length, color: '#0ea5e9' },
      { label: 'Deneme / abonelik başlattı', n: tried.length, color: '#f59e0b' },
      { label: 'Şu an ödeme yapıyor', n: paying.length, color: '#10b981' },
    ].map((s, i, arr) => ({ ...s, pct: Math.round((s.n / total) * 100), step: i ? (arr[i - 1].n ? Math.round((s.n / arr[i - 1].n) * 100) : 0) : 100 }));
  });

  daysToPay = computed(() => {
    const l = this.users()
      .filter((x) => x.subscriptionStartedAt && x.createdAt && x.subscriptionStartedAt >= x.createdAt)
      .map((x) => (x.subscriptionStartedAt! - x.createdAt) / DAY_MS)
      .sort((a, b) => a - b);
    return l.length ? Math.round(l[Math.floor(l.length / 2)]) : null;
  });

  monthly = computed(() => {
    const now = new Date();
    const out: { label: string; value: number; key: string }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS[d.getMonth()] + " '" + String(d.getFullYear()).slice(2), value: 0 });
    }
    const idx = new Map(out.map((o, i) => [o.key, i]));
    const a = this.audience();
    for (const u of this.data.users.data()) {
      if (u.role === 'admin' || !u.createdAt) continue;
      if (a === 'student' && !isStudent(u)) continue;
      if (a === 'teacher' && u.role !== 'teacher') continue;
      const d = new Date(u.createdAt);
      const i = idx.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (i !== undefined) out[i].value++;
    }
    return out;
  });

  /**
   * Weekly cohorts: users grouped by sign-up week; each cell is the share of
   * the cohort that finished a test or game in that week after signing up.
   */
  cohorts = computed(() => {
    const thisWeek = weekStart(Date.now());
    const events = new Map<string, Set<number>>();
    const add = (uid: string, at: number) => {
      const w = weekStart(at);
      (events.get(uid) ?? events.set(uid, new Set()).get(uid)!).add(w);
    };
    for (const a of this.data.attempts.data()) add(a.userId, a.startedAt);
    for (const g of this.data.games.data()) add(g.userId, g.createdAt);
    const aud = this.audience();
    const rows = [];
    for (let i = this.weeks - 1; i >= 0; i--) {
      const start = thisWeek - i * WEEK;
      const members = this.data.users
        .data()
        .filter((u) => u.role !== 'admin' && u.createdAt && weekStart(u.createdAt) === start)
        .filter((u) => (aud === 'all' ? true : aud === 'student' ? isStudent(u) : u.role === 'teacher'));
      const cells = this.offsets.map((k) => {
        const w = start + k * WEEK;
        if (w > thisWeek) return null;
        const n = members.filter((u) => events.get(u.uid)?.has(w)).length;
        return members.length ? Math.round((n / members.length) * 100) : 0;
      });
      const d = new Date(start);
      rows.push({ label: `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`, size: members.length, cells });
    }
    return rows;
  });

  week1 = computed(() => {
    const r = this.cohorts().filter((c) => c.size && c.cells[1] !== null);
    const total = r.reduce((s, c) => s + c.size, 0);
    return total ? Math.round(r.reduce((s, c) => s + (c.cells[1]! * c.size) / 100, 0) / total * 100) : null;
  });

  constructor() {
    this.data.users.load();
    // Cohorts need ~2 months of activity.
    if (this.data.activityDays() < 60) this.data.setActivityDays(90);
    else {
      this.data.attempts.load();
      this.data.games.load();
    }
  }

  cellBg(v: number | null) {
    if (v === null) return 'transparent';
    return `rgba(99, 102, 241, ${(0.08 + (v / 100) * 0.92).toFixed(2)})`;
  }
}
