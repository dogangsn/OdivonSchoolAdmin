import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { DataService } from '../../core/data.service';
import { ago, downloadCsv, fmtDate, toCsv } from '../../core/metrics';
import { DAY_MS, PLANS, STATUS_LABELS, effectivePlan, effectiveStatus, daysLeft } from '../../models/subscription';
import { AppUser, isStudent, isStudentAccountEmail, roleLabel } from '../../models/user';
import { LEVEL_LABELS } from '../../models/test-category';
import { Icon } from '../../shared/icon';
import { Avatar, Badge, Empty, PageHeader } from '../../shared/ui';

type SortKey = 'createdAt' | 'lastSeenAt' | 'name' | 'xp' | 'expires';

@Component({
  selector: 'app-users',
  imports: [RouterLink, Icon, Avatar, Badge, Empty, PageHeader],
  templateUrl: './users.html',
})
export class Users {
  data = inject(DataService);
  private route = inject(ActivatedRoute);
  readonly ago = ago;
  readonly fmtDate = fmtDate;
  readonly roleLabel = roleLabel;
  readonly plans = PLANS;
  readonly statusLabels = STATUS_LABELS;
  readonly levelLabels = LEVEL_LABELS;
  readonly effectivePlan = effectivePlan;
  readonly effectiveStatus = effectiveStatus;
  readonly daysLeft = daysLeft;
  readonly isStudentAccountEmail = isStudentAccountEmail;
  readonly Math = Math;
  now = signal(Date.now());

  q = signal('');
  role = signal<'all' | 'student' | 'teacher' | 'admin'>('all');
  status = signal<'all' | 'active' | 'trial' | 'expired' | 'none' | 'suspended'>('all');
  plan = signal<'all' | 'free' | 'pro' | 'vip'>('all');
  level = signal<string>('all');
  activity = signal<'all' | '1' | '7' | '30' | 'never'>('all');
  sort = signal<SortKey>('createdAt');
  dir = signal<1 | -1>(-1);
  page = signal(0);
  readonly pageSize = 25;

  constructor() {
    this.data.users.load();
    const p = this.route.snapshot.queryParamMap;
    if (p.get('rol')) this.role.set(p.get('rol') as any);
    if (p.get('durum')) this.status.set(p.get('durum') as any);
  }

  filtered = computed(() => {
    const now = Date.now();
    const q = this.q().trim().toLocaleLowerCase('tr');
    const list = this.data.users.data().filter((u) => {
      if (q && !`${u.displayName ?? ''} ${u.email ?? ''} ${u.school ?? ''} ${u.username ?? ''} ${u.uid}`.toLocaleLowerCase('tr').includes(q)) return false;
      const r = this.role();
      if (r === 'student' && !isStudent(u)) return false;
      if ((r === 'teacher' || r === 'admin') && u.role !== r) return false;
      const s = this.status();
      if (s === 'suspended' ? !u.suspended : s !== 'all' && effectiveStatus(u, now) !== s) return false;
      if (this.plan() !== 'all' && effectivePlan(u, now) !== this.plan()) return false;
      if (this.level() !== 'all' && u.gradeLevel !== this.level()) return false;
      const a = this.activity();
      if (a === 'never' && u.lastSeenAt) return false;
      if (a !== 'all' && a !== 'never' && (!u.lastSeenAt || now - u.lastSeenAt > Number(a) * DAY_MS)) return false;
      return true;
    });
    const k = this.sort();
    const d = this.dir();
    const val = (u: AppUser): number | string =>
      k === 'name' ? (u.displayName || u.email || '').toLocaleLowerCase('tr') : k === 'expires' ? (u.subscriptionExpiresAt ?? 0) : ((u as any)[k] ?? 0);
    return list.sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * d;
    });
  });

  pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  rows = computed(() => this.filtered().slice(this.page() * this.pageSize, (this.page() + 1) * this.pageSize));

  set<T>(sig: { set: (v: T) => void }, v: T) {
    sig.set(v);
    this.page.set(0);
  }

  sortBy(k: SortKey) {
    if (this.sort() === k) this.dir.set(this.dir() === 1 ? -1 : 1);
    else {
      this.sort.set(k);
      this.dir.set(k === 'name' ? 1 : -1);
    }
  }

  clear() {
    this.q.set('');
    this.role.set('all');
    this.status.set('all');
    this.plan.set('all');
    this.level.set('all');
    this.activity.set('all');
    this.page.set(0);
  }

  statusTone(u: AppUser) {
    if (u.suspended) return 'rose' as const;
    const s = effectiveStatus(u);
    return s === 'active' ? 'emerald' : s === 'trial' ? 'amber' : s === 'expired' ? 'rose' : 'slate';
  }

  exportCsv() {
    const rows: (string | number | null | undefined)[][] = [
      ['Ad', 'E-posta', 'Rol', 'Kademe', 'Sınıf', 'Okul', 'Plan', 'Durum', 'Dönem', 'Bitiş', 'Kaynak', 'Kayıt', 'Son görülme', 'XP', 'Seri', 'Askıda', 'UID'],
    ];
    for (const u of this.filtered()) {
      rows.push([
        u.displayName,
        u.email,
        roleLabel(u.role),
        u.gradeLevel ? LEVEL_LABELS[u.gradeLevel] : '',
        u.grade ?? '',
        u.school ?? '',
        PLANS[effectivePlan(u)].label,
        STATUS_LABELS[effectiveStatus(u)],
        u.subscriptionPeriod === 'yearly' ? 'Yıllık' : u.subscriptionPeriod === 'monthly' ? 'Aylık' : '',
        u.subscriptionExpiresAt ? fmtDate(u.subscriptionExpiresAt) : '',
        u.subscriptionSource ?? '',
        fmtDate(u.createdAt),
        u.lastSeenAt ? fmtDate(u.lastSeenAt) : '',
        u.xp ?? 0,
        u.streakDays ?? 0,
        u.suspended ? 'Evet' : '',
        u.uid,
      ]);
    }
    downloadCsv(`odivon-kullanicilar-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  }
}
