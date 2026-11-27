import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { ToastService } from '../../core/toast.service';
import { ago, downloadCsv, fmtDate, perDay, toCsv } from '../../core/metrics';
import { DAY_MS } from '../../models/subscription';
import { ASSIGNMENT_KIND_LABELS, Assignment, ClassProgress, Submission, schoolKey } from '../../models/activity';
import { Icon } from '../../shared/icon';
import { Avatar, Badge, Empty, Kpi } from '../../shared/ui';
import { BarChart, HBars } from '../../shared/charts';

@Component({
  selector: 'app-class-detail',
  imports: [RouterLink, Icon, Avatar, Badge, Empty, Kpi, BarChart, HBars],
  templateUrl: './class-detail.html',
})
export class ClassDetail {
  id = input.required<string>();
  data = inject(DataService);
  private toast = inject(ToastService);
  readonly ago = ago;
  readonly fmtDate = fmtDate;
  readonly kinds = ASSIGNMENT_KIND_LABELS;
  readonly schoolKey = schoolKey;
  readonly Math = Math;
  readonly now = Date.now();

  members = signal<{ uid: string; displayName: string; joinedAt: number }[]>([]);
  progress = signal<ClassProgress[]>([]);
  assignments = signal<Assignment[]>([]);
  subs = signal<Record<string, Submission[]>>({});
  loading = signal(true);
  tab = signal<'students' | 'assignments' | 'topics'>('students');
  openAssignment = signal<string | null>(null);

  cls = computed(() => this.data.classes.data().find((c) => c.id === this.id()) ?? null);
  teacher = computed(() => this.data.users.data().find((u) => u.uid === this.cls()?.teacherId));
  userMap = computed(() => new Map(this.data.users.data().map((u) => [u.uid, u])));
  progMap = computed(() => new Map(this.progress().map((p) => [p.uid, p])));

  rows = computed(() =>
    this.members()
      .map((m) => {
        const p = this.progMap().get(m.uid);
        const u = this.userMap().get(m.uid);
        const done = Object.values(this.subs()).filter((l) => l.some((s) => s.uid === m.uid)).length;
        return {
          uid: m.uid,
          name: u?.displayName || m.displayName,
          joinedAt: m.joinedAt,
          activities: p?.activities ?? 0,
          answered: p?.answered ?? 0,
          rate: p?.answered ? Math.round((p.correct / p.answered) * 100) : null,
          streak: p?.streakDays ?? 0,
          lastAt: p?.lastActiveAt ?? u?.lastSeenAt ?? 0,
          xp: u?.xp ?? 0,
          done,
        };
      })
      .sort((a, b) => b.activities - a.activities)
  );

  active7 = computed(() => this.rows().filter((r) => r.lastAt && Date.now() - r.lastAt <= 7 * DAY_MS).length);
  avgRate = computed(() => {
    const a = this.progress().reduce((s, p) => s + (p.answered || 0), 0);
    return a ? Math.round((this.progress().reduce((s, p) => s + (p.correct || 0), 0) / a) * 100) : 0;
  });
  completion = computed(() => {
    const n = this.members().length;
    const as = this.assignments().length;
    if (!n || !as) return null;
    const total = Object.values(this.subs()).reduce((s, l) => s + l.length, 0);
    return Math.round((total / (n * as)) * 100);
  });

  /** Topic totals across the class (from progress docs), weakest first. */
  topics = computed(() => {
    const m = new Map<string, { label: string; subject: string; c: number; t: number }>();
    for (const p of this.progress())
      for (const [k, t] of Object.entries(p.topics ?? {})) {
        const r = m.get(k) ?? { label: t.label, subject: t.subject, c: 0, t: 0 };
        r.c += t.correct;
        r.t += t.total;
        m.set(k, r);
      }
    return [...m.values()].filter((r) => r.t > 0).map((r) => ({ ...r, rate: Math.round((r.c / r.t) * 100) })).sort((a, b) => a.rate - b.rate);
  });
  weakTopics = computed(() => this.topics().slice(0, 8).map((t) => ({ label: `${t.subject} · ${t.label}`, value: t.rate })));

  memberIds = computed(() => new Set(this.members().map((m) => m.uid)));
  daily = computed(() => {
    const items = [
      ...this.data.attempts.data().filter((a) => this.memberIds().has(a.userId)).map((a) => a.startedAt),
      ...this.data.games.data().filter((g) => this.memberIds().has(g.userId)).map((g) => g.createdAt),
    ];
    return perDay(items, (x) => x, this.data.activityDays()).map((d) => ({ label: d.day.slice(8, 10) + '.' + d.day.slice(5, 7), value: d.count }));
  });

  constructor() {
    this.data.users.load();
    this.data.classes.load();
    this.data.attempts.load();
    this.data.games.load();
    effect(() => this.load(this.id()));
  }

  private async load(id: string) {
    this.loading.set(true);
    try {
      const [members, progress, assignments] = await Promise.all([
        this.data.members(id),
        this.data.classProgress(id).catch(() => []),
        this.data.assignments(id).catch(() => []),
      ]);
      this.members.set(members);
      this.progress.set(progress);
      this.assignments.set(assignments);
      const subs: Record<string, Submission[]> = {};
      await Promise.all(assignments.map(async (a) => (subs[a.id] = await this.data.submissions(id, a.id).catch(() => []))));
      this.subs.set(subs);
    } catch (e: any) {
      this.toast.error('Sınıf yüklenemedi: ' + (e?.message ?? ''));
    } finally {
      this.loading.set(false);
    }
  }

  avgScore(a: Assignment) {
    const l = this.subs()[a.id] ?? [];
    const t = l.reduce((s, x) => s + (x.total || 0), 0);
    return t ? Math.round((l.reduce((s, x) => s + (x.correct || 0), 0) / t) * 100) : null;
  }
  missing(a: Assignment) {
    const done = new Set((this.subs()[a.id] ?? []).map((s) => s.uid));
    return this.members().filter((m) => !done.has(m.uid));
  }

  rateCls(r: number | null) {
    return r === null ? 'text-slate-400' : r >= 70 ? 'text-emerald-600' : r >= 50 ? 'text-amber-600' : 'text-rose-600';
  }

  exportCsv() {
    const rows: (string | number)[][] = [['Öğrenci', 'Aktivite', 'Cevaplanan soru', 'Başarı %', 'Seri', 'XP', 'Tamamlanan ödev', 'Son aktivite', 'Katılım']];
    for (const r of this.rows()) rows.push([r.name, r.activities, r.answered, r.rate ?? '', r.streak, r.xp, `${r.done}/${this.assignments().length}`, r.lastAt ? fmtDate(r.lastAt) : '', fmtDate(r.joinedAt)]);
    downloadCsv(`sinif-${this.cls()?.name ?? this.id()}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  }
}
