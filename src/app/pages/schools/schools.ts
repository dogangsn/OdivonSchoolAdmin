import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { ToastService } from '../../core/toast.service';
import { ago, downloadCsv, fmtDate, toCsv } from '../../core/metrics';
import { AppUser } from '../../models/user';
import { Classroom, schoolKey } from '../../models/activity';
import { Icon } from '../../shared/icon';
import { Avatar, Badge, Empty, Kpi, PageHeader } from '../../shared/ui';
import { HBars } from '../../shared/charts';

interface SchoolRow {
  key: string;
  name: string;
  teachers: AppUser[];
  verified: number;
  classes: Classroom[];
  students: number;
  lastSeen: number;
}

const norm = (s: string) =>
  s
    .toLocaleLowerCase('tr')
    .replace(/\s+/g, ' ')
    .replace(/[.,]/g, '')
    .trim();

@Component({
  selector: 'app-schools',
  imports: [RouterLink, Icon, Avatar, Badge, Empty, Kpi, PageHeader, HBars],
  templateUrl: './schools.html',
})
export class Schools {
  data = inject(DataService);
  private toast = inject(ToastService);
  readonly ago = ago;
  readonly fmtDate = fmtDate;

  tab = signal<'schools' | 'teachers' | 'classes'>('schools');
  q = signal('');
  teacherFilter = signal<'all' | 'pending' | 'verified'>('all');
  memberCounts = signal<Record<string, number | undefined>>({});
  countingMembers = signal(false);
  openSchool = signal<string | null>(null);
  openClass = signal<string | null>(null);
  classMembers = signal<{ uid: string; displayName: string; joinedAt: number }[]>([]);

  teachers = computed(() => this.data.users.data().filter((u) => u.role === 'teacher'));
  classes = computed(() => this.data.classes.data().filter((c) => !c.archived));
  userMap = computed(() => new Map(this.data.users.data().map((u) => [u.uid, u])));

  schools = computed<SchoolRow[]>(() => {
    const map = new Map<string, SchoolRow>();
    const byTeacher = new Map<string, Classroom[]>();
    for (const c of this.classes()) byTeacher.set(c.teacherId, [...(byTeacher.get(c.teacherId) ?? []), c]);
    const counts = this.memberCounts();
    for (const t of this.teachers()) {
      const name = (t.school || '').trim() || 'Okul belirtilmemiş';
      const key = schoolKey(t.school);
      const row = map.get(key) ?? { key, name, teachers: [], verified: 0, classes: [], students: 0, lastSeen: 0 };
      row.teachers.push(t);
      if (t.teacherVerified) row.verified++;
      const cls = byTeacher.get(t.uid) ?? [];
      row.classes.push(...cls);
      row.students += cls.reduce((s, c) => s + (counts[c.id] ?? 0), 0);
      row.lastSeen = Math.max(row.lastSeen, t.lastSeenAt ?? 0);
      map.set(key, row);
    }
    const q = norm(this.q());
    return [...map.values()]
      .filter((r) => !q || norm(r.name).includes(q) || r.teachers.some((t) => norm(t.displayName || '').includes(q)))
      .sort((a, b) => b.students - a.students || b.teachers.length - a.teachers.length);
  });

  teacherRows = computed(() => {
    const q = norm(this.q());
    const f = this.teacherFilter();
    const byTeacher = new Map<string, number>();
    for (const c of this.classes()) byTeacher.set(c.teacherId, (byTeacher.get(c.teacherId) ?? 0) + 1);
    return this.teachers()
      .filter((t) => (f === 'all' ? true : f === 'pending' ? !t.teacherVerified : !!t.teacherVerified))
      .filter((t) => !q || norm(`${t.displayName} ${t.email} ${t.school ?? ''} ${t.branch ?? ''}`).includes(q))
      .map((t) => ({ t, classCount: byTeacher.get(t.uid) ?? 0 }))
      .sort((a, b) => Number(!!a.t.teacherVerified) - Number(!!b.t.teacherVerified) || (b.t.createdAt ?? 0) - (a.t.createdAt ?? 0));
  });

  classRows = computed(() => {
    const q = norm(this.q());
    return this.classes().filter((c) => !q || norm(`${c.name} ${c.teacherName} ${c.joinCode}`).includes(q));
  });

  totalStudents = computed(() => Object.values(this.memberCounts()).reduce((s: number, n) => s + (n ?? 0), 0));
  pending = computed(() => this.teachers().filter((t) => !t.teacherVerified).length);
  namedSchools = computed(() => this.schools().filter((s) => s.key !== 'okul-belirtilmemis').length);
  gradeDist = computed(() => {
    const m = new Map<number, number>();
    for (const c of this.classes()) m.set(c.grade, (m.get(c.grade) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([g, n]) => ({ label: g + '. sınıf', value: n }));
  });
  branches = computed(() => {
    const m = new Map<string, number>();
    for (const t of this.teachers()) {
      const b = (t.branch || 'Belirtilmemiş').trim();
      m.set(b, (m.get(b) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value }));
  });

  constructor() {
    this.data.users.load();
    this.data.classes.load().then(() => this.countMembers());
  }

  async countMembers() {
    this.countingMembers.set(true);
    const queue = this.classes().slice();
    const out: Record<string, number | undefined> = { ...this.memberCounts() };
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        while (queue.length) {
          const c = queue.shift()!;
          try {
            out[c.id] = await this.data.memberCount(c.id);
          } catch {
            out[c.id] = 0;
          }
        }
      })
    );
    this.memberCounts.set(out);
    this.countingMembers.set(false);
  }

  async refresh() {
    await Promise.all([this.data.users.load(true), this.data.classes.load(true)]);
    await this.countMembers();
  }

  async toggleClass(c: Classroom) {
    if (this.openClass() === c.id) {
      this.openClass.set(null);
      return;
    }
    this.openClass.set(c.id);
    this.classMembers.set([]);
    try {
      this.classMembers.set(await this.data.members(c.id));
    } catch (e: any) {
      this.toast.error('Üyeler yüklenemedi: ' + (e?.message ?? ''));
    }
  }

  async verify(t: AppUser) {
    const next = !t.teacherVerified;
    try {
      await this.data.updateUser(t, { teacherVerified: next }, { type: 'verify', summary: next ? 'Öğretmen onaylandı' : 'Öğretmen onayı kaldırıldı' });
      this.toast.success(`${t.displayName || t.email}: ${next ? 'onaylandı' : 'onay kaldırıldı'}`);
    } catch (e: any) {
      this.toast.error('Kaydedilemedi: ' + (e?.message ?? ''));
    }
  }

  exportCsv() {
    const rows: (string | number)[][] = [['Okul', 'Öğretmen', 'Onaylı öğretmen', 'Sınıf', 'Öğrenci (sınıf üyesi)', 'Öğretmenler']];
    for (const s of this.schools())
      rows.push([s.name, s.teachers.length, s.verified, s.classes.length, s.students, s.teachers.map((t) => t.displayName || t.email).join(', ')]);
    downloadCsv(`odivon-okullar-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  }
}
