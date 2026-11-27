import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { ago, countBy, downloadCsv, fmtDate, perDay, toCsv } from '../../core/metrics';
import { DAY_MS, PLANS, effectivePlan } from '../../models/subscription';
import { AppUser } from '../../models/user';
import { GAME_LABELS, schoolKey } from '../../models/activity';
import { Icon } from '../../shared/icon';
import { Avatar, Badge, Empty, Kpi } from '../../shared/ui';
import { HBars, LineChart } from '../../shared/charts';

interface StudentRow {
  uid: string;
  name: string;
  user?: AppUser;
  classes: string[];
  tests: number;
  games: number;
  q: number;
  c: number;
  rate: number | null;
  lastAt: number;
}

@Component({
  selector: 'app-school-detail',
  imports: [RouterLink, Icon, Avatar, Badge, Empty, Kpi, LineChart, HBars],
  templateUrl: './school-detail.html',
})
export class SchoolDetail {
  key = input.required<string>();
  data = inject(DataService);
  readonly ago = ago;
  readonly fmtDate = fmtDate;
  readonly plans = PLANS;
  readonly effectivePlan = effectivePlan;

  members = signal<Record<string, { uid: string; displayName: string; joinedAt: number }[]>>({});
  loadingMembers = signal(false);
  tab = signal<'students' | 'teachers' | 'classes'>('students');
  sort = signal<'activity' | 'rate' | 'name' | 'last'>('activity');

  teachers = computed(() => this.data.users.data().filter((u) => u.role === 'teacher' && schoolKey(u.school) === this.key()));
  name = computed(() => this.teachers().find((t) => t.school)?.school?.trim() || 'Okul belirtilmemiş');
  classes = computed(() => {
    const ids = new Set(this.teachers().map((t) => t.uid));
    return this.data.classes.data().filter((c) => ids.has(c.teacherId) && !c.archived);
  });
  userMap = computed(() => new Map(this.data.users.data().map((u) => [u.uid, u])));

  /** uid → class names */
  studentClasses = computed(() => {
    const m = new Map<string, string[]>();
    const byId = new Map(this.classes().map((c) => [c.id, c]));
    for (const [cid, list] of Object.entries(this.members())) {
      const c = byId.get(cid);
      if (!c) continue;
      for (const s of list) m.set(s.uid, [...(m.get(s.uid) ?? []), c.name]);
    }
    return m;
  });
  studentIds = computed(() => new Set(this.studentClasses().keys()));

  attempts = computed(() => this.data.attempts.data().filter((a) => this.studentIds().has(a.userId)));
  games = computed(() => this.data.games.data().filter((g) => this.studentIds().has(g.userId)));

  students = computed<StudentRow[]>(() => {
    const rows = new Map<string, StudentRow>();
    const names = new Map<string, string>();
    for (const list of Object.values(this.members())) for (const s of list) names.set(s.uid, s.displayName);
    for (const [uid, classes] of this.studentClasses()) {
      const user = this.userMap().get(uid);
      rows.set(uid, { uid, name: user?.displayName || names.get(uid) || uid.slice(0, 8), user, classes, tests: 0, games: 0, q: 0, c: 0, rate: null, lastAt: user?.lastSeenAt ?? 0 });
    }
    for (const a of this.attempts()) {
      const r = rows.get(a.userId)!;
      r.tests++;
      r.q += a.totalCount;
      r.c += a.correctCount;
      r.lastAt = Math.max(r.lastAt, a.startedAt);
    }
    for (const g of this.games()) {
      const r = rows.get(g.userId)!;
      r.games++;
      r.q += g.total;
      r.c += g.correct;
      r.lastAt = Math.max(r.lastAt, g.createdAt);
    }
    const list = [...rows.values()].map((r) => ({ ...r, rate: r.q ? Math.round((r.c / r.q) * 100) : null }));
    const s = this.sort();
    return list.sort((a, b) =>
      s === 'name' ? a.name.localeCompare(b.name, 'tr') : s === 'rate' ? (b.rate ?? -1) - (a.rate ?? -1) : s === 'last' ? b.lastAt - a.lastAt : b.tests + b.games - (a.tests + a.games)
    );
  });

  active7 = computed(() => this.students().filter((s) => s.lastAt && Date.now() - s.lastAt <= 7 * DAY_MS).length);
  activeShare = computed(() => (this.students().length ? Math.round((this.active7() / this.students().length) * 100) : 0));
  successRate = computed(() => {
    const q = this.students().reduce((s, r) => s + r.q, 0);
    return q ? Math.round((this.students().reduce((s, r) => s + r.c, 0) / q) * 100) : 0;
  });
  paying = computed(() => this.students().filter((s) => s.user && effectivePlan(s.user) !== 'free').length);
  inactive = computed(() => this.students().filter((s) => !s.lastAt || Date.now() - s.lastAt > 14 * DAY_MS));

  short = (k: string) => k.slice(8, 10) + '.' + k.slice(5, 7);
  dailyTests = computed(() => perDay(this.attempts(), (a) => a.startedAt, this.data.activityDays()).map((d) => ({ label: this.short(d.day), value: d.count })));
  dailyGames = computed(() => perDay(this.games(), (g) => g.createdAt, this.data.activityDays()).map((d) => ({ label: this.short(d.day), value: d.count })));
  subjects = computed(() => {
    const m = new Map<string, { c: number; t: number }>();
    for (const a of this.attempts()) {
      const r = m.get(a.subject) ?? { c: 0, t: 0 };
      r.c += a.correctCount;
      r.t += a.totalCount;
      m.set(a.subject, r);
    }
    return [...m.entries()].map(([label, r]) => ({ label, value: r.t ? Math.round((r.c / r.t) * 100) : 0 })).sort((a, b) => b.value - a.value);
  });
  gameTypes = computed(() => countBy(this.games(), (g) => GAME_LABELS[g.gameType] ?? g.gameType).map((r) => ({ label: r.key, value: r.count })));
  classStats = computed(() =>
    this.classes().map((c) => {
      const list = this.members()[c.id] ?? [];
      const ids = new Set(list.map((m) => m.uid));
      const rows = this.students().filter((s) => ids.has(s.uid));
      const q = rows.reduce((s, r) => s + r.q, 0);
      return {
        c,
        size: list.length,
        active: rows.filter((r) => r.lastAt && Date.now() - r.lastAt <= 7 * DAY_MS).length,
        acts: rows.reduce((s, r) => s + r.tests + r.games, 0),
        rate: q ? Math.round((rows.reduce((s, r) => s + r.c, 0) / q) * 100) : null,
      };
    })
  );
  classBars = computed(() => this.classStats().map((s) => ({ label: s.c.name + ' · ' + s.c.teacherName, value: s.acts })).sort((a, b) => b.value - a.value));

  constructor() {
    this.data.users.load();
    this.data.attempts.load();
    this.data.games.load();
    this.data.classes.load();
    effect(() => {
      const cls = this.classes();
      if (cls.length) this.loadMembers(cls.map((c) => c.id));
    });
  }

  private loaded = new Set<string>();
  private async loadMembers(ids: string[]) {
    const todo = ids.filter((id) => !this.loaded.has(id));
    if (!todo.length) return;
    todo.forEach((id) => this.loaded.add(id));
    this.loadingMembers.set(true);
    const out = { ...this.members() };
    await Promise.all(
      todo.map(async (id) => {
        try {
          out[id] = await this.data.members(id);
        } catch {
          out[id] = [];
        }
      })
    );
    this.members.set(out);
    this.loadingMembers.set(false);
  }

  exportCsv() {
    const rows: (string | number)[][] = [['Öğrenci', 'Sınıf', 'Test', 'Oyun', 'Soru', 'Başarı %', 'Plan', 'Son aktivite', 'UID']];
    for (const s of this.students())
      rows.push([s.name, s.classes.join(', '), s.tests, s.games, s.q, s.rate ?? '', s.user ? PLANS[effectivePlan(s.user)].label : '', s.lastAt ? fmtDate(s.lastAt) : '', s.uid]);
    downloadCsv(`okul-${this.key()}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  }

  rateCls(r: number | null) {
    return r === null ? 'text-slate-400' : r >= 70 ? 'text-emerald-600' : r >= 50 ? 'text-amber-600' : 'text-rose-600';
  }
}
