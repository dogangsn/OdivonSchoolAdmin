import { AppUser, isStudent } from '../models/user';
import {
  DAY_MS,
  PAID_PLANS,
  daysLeft,
  effectivePlan,
  effectiveStatus,
  monthlyRevenue,
} from '../models/subscription';

/** Pure helpers behind the /yonetim numbers, kept apart so they are easy to test. */

export interface SaasMetrics {
  total: number;
  students: number;
  teachers: number;
  admins: number;
  newLast7: number;
  newLast30: number;
  /** Opened the app in the last 1 / 7 / 30 days (lastSeenAt). */
  activeToday: number;
  active7: number;
  active30: number;
  paying: number;
  trials: number;
  expired: number;
  suspended: number;
  /** Estimated monthly recurring revenue in TL. */
  mrr: number;
  /** Paying users / all students and teachers, percent. */
  conversion: number;
  byPlan: { free: number; pro: number; vip: number };
  trialsEndingSoon: AppUser[];
  /** active/trial in the document but the end date already passed. */
  lapsed: AppUser[];
  unverifiedTeachers: AppUser[];
}

export function saasMetrics(users: AppUser[], now = Date.now()): SaasMetrics {
  const m: SaasMetrics = {
    total: users.length,
    students: 0,
    teachers: 0,
    admins: 0,
    newLast7: 0,
    newLast30: 0,
    activeToday: 0,
    active7: 0,
    active30: 0,
    paying: 0,
    trials: 0,
    expired: 0,
    suspended: 0,
    mrr: 0,
    conversion: 0,
    byPlan: { free: 0, pro: 0, vip: 0 },
    trialsEndingSoon: [],
    lapsed: [],
    unverifiedTeachers: [],
  };

  for (const u of users) {
    if (u.role === 'admin') m.admins++;
    else if (u.role === 'teacher') m.teachers++;
    else if (isStudent(u)) m.students++;

    if (u.createdAt && now - u.createdAt <= 7 * DAY_MS) m.newLast7++;
    if (u.createdAt && now - u.createdAt <= 30 * DAY_MS) m.newLast30++;

    if (u.lastSeenAt) {
      const ago = now - u.lastSeenAt;
      if (ago <= DAY_MS) m.activeToday++;
      if (ago <= 7 * DAY_MS) m.active7++;
      if (ago <= 30 * DAY_MS) m.active30++;
    }

    if (u.suspended) m.suspended++;

    const status = effectiveStatus(u, now);
    const plan = effectivePlan(u, now);
    m.byPlan[plan]++;
    if (status === 'active' && PAID_PLANS.includes(plan)) m.paying++;
    if (status === 'trial') {
      m.trials++;
      const left = daysLeft(u, now);
      if (left !== null && left <= 3) m.trialsEndingSoon.push(u);
    }
    if (status === 'expired') m.expired++;
    if (status === 'expired' && (u.subscriptionStatus === 'active' || u.subscriptionStatus === 'trial')) {
      m.lapsed.push(u);
    }
    m.mrr += monthlyRevenue(u, now);

    if (u.role === 'teacher' && !u.teacherVerified) m.unverifiedTeachers.push(u);
  }

  const customers = m.students + m.teachers;
  m.conversion = customers ? Math.round((m.paying / customers) * 1000) / 10 : 0;
  m.mrr = Math.round(m.mrr);
  return m;
}

/** Local YYYY-MM-DD of an epoch ms. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Sign-ups per local day for the last `days` days, oldest first. */
export function signupsPerDay(
  users: Pick<AppUser, 'createdAt'>[],
  days: number,
  now = Date.now()
): { day: string; count: number }[] {
  const out: { day: string; count: number }[] = [];
  const index = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(now - i * DAY_MS);
    index.set(key, out.length);
    out.push({ day: key, count: 0 });
  }
  for (const u of users) {
    if (!u.createdAt) continue;
    const i = index.get(dayKey(u.createdAt));
    if (i !== undefined) out[i].count++;
  }
  return out;
}

/** Turns rows into a CSV string Excel opens correctly (UTF-8 BOM, ; separated). */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}

/** Counts of items per local day for the last `days` days, oldest first. */
export function perDay<T>(items: T[], at: (t: T) => number | undefined, days: number, now = Date.now(), weight?: (t: T) => number) {
  const out: { day: string; count: number }[] = [];
  const index = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(now - i * DAY_MS);
    index.set(key, out.length);
    out.push({ day: key, count: 0 });
  }
  for (const it of items) {
    const ms = at(it);
    if (!ms) continue;
    const i = index.get(dayKey(ms));
    if (i !== undefined) out[i].count += weight ? weight(it) : 1;
  }
  return out;
}

/** Groups items and counts them, biggest first. */
export function countBy<T>(items: T[], key: (t: T) => string | undefined | null): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it) || '—';
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count);
}

/** Percent change from `prev` to `cur`, rounded; null when there is no base. */
export function change(cur: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

/** Saves a CSV string as a file in the browser. */
export function downloadCsv(name: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const fmtDate = (ms: number | undefined | null) => (ms ? new Date(ms).toLocaleDateString('tr-TR') : '—');
export const fmtDateTime = (ms: number | undefined | null) =>
  ms ? new Date(ms).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

/** "3 dk önce", "2 sa önce", "5 gün önce". */
export function ago(ms: number | undefined | null, now = Date.now()): string {
  if (!ms) return '—';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return 'az önce';
  if (s < 3600) return `${Math.floor(s / 60)} dk önce`;
  if (s < 86400) return `${Math.floor(s / 3600)} sa önce`;
  if (s < 30 * 86400) return `${Math.floor(s / 86400)} gün önce`;
  return fmtDate(ms);
}

export const tl = (n: number) => '₺' + Math.round(n).toLocaleString('tr-TR');
