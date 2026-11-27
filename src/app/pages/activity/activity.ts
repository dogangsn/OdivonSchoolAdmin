import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { ago, countBy, dayKey, perDay } from '../../core/metrics';
import { DAY_MS } from '../../models/subscription';
import { AppUser, isStudent } from '../../models/user';
import { GAME_LABELS } from '../../models/activity';
import { LEVEL_LABELS } from '../../models/test-category';
import { Icon } from '../../shared/icon';
import { Avatar, Empty, Kpi, PageHeader } from '../../shared/ui';
import { BarChart, HBars, LineChart } from '../../shared/charts';

const DAYS_TR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

@Component({
  selector: 'app-activity',
  imports: [RouterLink, Icon, Avatar, Empty, Kpi, PageHeader, BarChart, LineChart, HBars],
  templateUrl: './activity.html',
})
export class Activity {
  data = inject(DataService);
  readonly ago = ago;
  readonly daysTr = DAYS_TR;
  readonly hours = Array.from({ length: 24 }, (_, i) => i);

  days = computed(() => this.data.activityDays());
  loading = computed(() => this.data.attempts.loading() || this.data.games.loading());
  attempts = computed(() => this.data.attempts.data());
  games = computed(() => this.data.games.data());

  userMap = computed(() => new Map(this.data.users.data().map((u) => [u.uid, u])));

  /** Every (user, time) event of tests and games. */
  private events = computed(() => [
    ...this.attempts().map((a) => ({ uid: a.userId, at: a.startedAt })),
    ...this.games().map((g) => ({ uid: g.userId, at: g.createdAt })),
  ]);

  activeLearners = computed(() => new Set(this.events().map((e) => e.uid)).size);
  dau = computed(() => {
    const since = Date.now() - DAY_MS;
    return new Set(this.events().filter((e) => e.at >= since).map((e) => e.uid)).size;
  });
  wau = computed(() => {
    const since = Date.now() - 7 * DAY_MS;
    return new Set(this.events().filter((e) => e.at >= since).map((e) => e.uid)).size;
  });
  /** DAU / MAU style stickiness, from lastSeenAt. */
  stickiness = computed(() => {
    const now = Date.now();
    const users = this.data.users.data();
    const d = users.filter((u) => u.lastSeenAt && now - u.lastSeenAt <= DAY_MS).length;
    const m = users.filter((u) => u.lastSeenAt && now - u.lastSeenAt <= 30 * DAY_MS).length;
    return m ? Math.round((d / m) * 100) : 0;
  });
  questions = computed(() => this.attempts().reduce((s, a) => s + a.totalCount, 0));
  avgSuccess = computed(() => {
    const t = this.questions();
    return t ? Math.round((this.attempts().reduce((s, a) => s + a.correctCount, 0) / t) * 100) : 0;
  });
  studyHours = computed(() => {
    const t = this.attempts().reduce((s, a) => s + (a.answers ?? []).reduce((x, q) => x + (q.timeSpentSeconds || 0), 0), 0);
    const g = this.games().reduce((s, x) => s + (x.durationMs || 0) / 1000, 0);
    return Math.round((t + g) / 3600);
  });
  assignmentsDone = computed(() => this.games().filter((g) => g.assignmentId).length);

  short = (k: string) => k.slice(8, 10) + '.' + k.slice(5, 7);
  daily = computed(() => perDay(this.attempts(), (a) => a.startedAt, this.days()).map((d) => ({ label: this.short(d.day), value: d.count })));
  dailyGames = computed(() => perDay(this.games(), (g) => g.createdAt, this.days()).map((d) => ({ label: this.short(d.day), value: d.count })));
  dailyLearners = computed(() => {
    const out = perDay([] as number[], (x) => x, this.days()).map((d) => ({ key: d.day, set: new Set<string>() }));
    const idx = new Map(out.map((o, i) => [o.key, i]));
    for (const e of this.events()) {
      const i = idx.get(dayKey(e.at));
      if (i !== undefined) out[i].set.add(e.uid);
    }
    return out.map((o) => ({ label: this.short(o.key), value: o.set.size }));
  });

  subjectSuccess = computed(() => {
    const m = new Map<string, { c: number; t: number }>();
    for (const a of this.attempts()) {
      const r = m.get(a.subject) ?? { c: 0, t: 0 };
      r.c += a.correctCount;
      r.t += a.totalCount;
      m.set(a.subject, r);
    }
    return [...m.entries()]
      .map(([label, r]) => ({ label, value: r.t ? Math.round((r.c / r.t) * 100) : 0, n: r.t }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 10);
  });
  levelTests = computed(() => countBy(this.attempts(), (a) => LEVEL_LABELS[a.level as 'lise'] ?? a.level).map((r) => ({ label: r.key, value: r.count })));
  gameTypes = computed(() => countBy(this.games(), (g) => GAME_LABELS[g.gameType] ?? g.gameType).map((r) => ({ label: r.key, value: r.count })));

  /** 7 × 24 heatmap of activity by weekday and hour. */
  heat = computed(() => {
    const grid = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
    for (const e of this.events()) {
      const d = new Date(e.at);
      grid[(d.getDay() + 6) % 7][d.getHours()]++;
    }
    const max = Math.max(1, ...grid.flat());
    return { grid, max };
  });
  heatColor(v: number) {
    if (!v) return 'transparent';
    const a = 0.12 + (v / this.heat().max) * 0.88;
    return `rgba(99, 102, 241, ${a.toFixed(2)})`;
  }
  peakHour = computed(() => {
    const byHour = Array(24).fill(0);
    for (const row of this.heat().grid) row.forEach((v, h) => (byHour[h] += v));
    const max = Math.max(...byHour);
    return max ? byHour.indexOf(max) : null;
  });

  leaders = computed(() => {
    const m = new Map<string, { tests: number; games: number; q: number; c: number }>();
    for (const a of this.attempts()) {
      const r = m.get(a.userId) ?? { tests: 0, games: 0, q: 0, c: 0 };
      r.tests++;
      r.q += a.totalCount;
      r.c += a.correctCount;
      m.set(a.userId, r);
    }
    for (const g of this.games()) {
      const r = m.get(g.userId) ?? { tests: 0, games: 0, q: 0, c: 0 };
      r.games++;
      m.set(g.userId, r);
    }
    return [...m.entries()]
      .map(([uid, r]) => ({ uid, user: this.userMap().get(uid), ...r, rate: r.q ? Math.round((r.c / r.q) * 100) : null }))
      .sort((a, b) => b.tests + b.games - (a.tests + a.games))
      .slice(0, 12);
  });

  /** Students who were active before but not in the last 14 days. */
  atRisk = computed(() => {
    const now = Date.now();
    return this.data.users
      .data()
      .filter((u) => isStudent(u) && u.lastSeenAt && now - u.lastSeenAt > 14 * DAY_MS && now - u.lastSeenAt <= 60 * DAY_MS)
      .sort((a, b) => (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0))
      .slice(0, 10);
  });

  constructor() {
    this.data.users.load();
    this.data.attempts.load();
    this.data.games.load();
  }

  setDays(d: number) {
    this.data.setActivityDays(d);
  }

  name(u: AppUser | undefined, uid: string) {
    return u?.displayName || u?.email || uid.slice(0, 8);
  }
}
