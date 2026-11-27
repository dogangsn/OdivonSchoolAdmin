import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { ago, countBy, downloadCsv, fmtDateTime, perDay, tl, toCsv } from '../../core/metrics';
import { DAY_MS, PLANS } from '../../models/subscription';
import { PAYMENT_STATUS_LABELS, Payment } from '../../models/activity';
import { Icon } from '../../shared/icon';
import { Badge, Empty, Kpi, PageHeader } from '../../shared/ui';
import { BarChart, Donut } from '../../shared/charts';

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

@Component({
  selector: 'app-payments',
  imports: [RouterLink, Icon, Badge, Empty, Kpi, PageHeader, BarChart, Donut],
  templateUrl: './payments.html',
})
export class Payments {
  data = inject(DataService);
  readonly plans = PLANS;
  readonly labels = PAYMENT_STATUS_LABELS;
  readonly tl = tl;
  readonly fmtDateTime = fmtDateTime;
  readonly ago = ago;

  q = signal('');
  status = signal<'all' | Payment['status']>('all');
  includeTest = signal(false);
  range = signal<'daily' | 'monthly'>('daily');

  base = computed(() => this.data.payments.data().filter((p) => this.includeTest() || !p.testMode));
  success = computed(() => this.base().filter((p) => p.status === 'success'));
  amount = (p: Payment) => p.totalAmount ?? p.amount;

  total = computed(() => this.success().reduce((s, p) => s + this.amount(p), 0));
  month = computed(() => {
    const d = new Date();
    const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    return this.success().filter((p) => (p.paidAt ?? p.createdAt) >= start).reduce((s, p) => s + this.amount(p), 0);
  });
  successRate = computed(() => {
    const done = this.base().filter((p) => p.status !== 'pending');
    return done.length ? Math.round((this.success().length / done.length) * 100) : 0;
  });
  avgOrder = computed(() => (this.success().length ? this.total() / this.success().length : 0));

  daily = computed(() =>
    perDay(this.success(), (p) => p.paidAt ?? p.createdAt, 30, Date.now(), this.amount).map((d) => ({
      label: d.day.slice(8, 10) + '.' + d.day.slice(5, 7),
      value: d.count,
    }))
  );
  monthly = computed(() => {
    const now = new Date();
    const out: { label: string; value: number; key: string }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS[d.getMonth()] + " '" + String(d.getFullYear()).slice(2), value: 0 });
    }
    const idx = new Map(out.map((o, i) => [o.key, i]));
    for (const p of this.success()) {
      const d = new Date(p.paidAt ?? p.createdAt);
      const i = idx.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (i !== undefined) out[i].value += this.amount(p);
    }
    return out;
  });

  byPlan = computed(() => [
    { label: 'Pro aylık', value: this.success().filter((p) => p.plan === 'pro' && p.period === 'monthly').length, color: '#818cf8' },
    { label: 'Pro yıllık', value: this.success().filter((p) => p.plan === 'pro' && p.period === 'yearly').length, color: '#4f46e5' },
    { label: 'VIP aylık', value: this.success().filter((p) => p.plan === 'vip' && p.period === 'monthly').length, color: '#c084fc' },
    { label: 'VIP yıllık', value: this.success().filter((p) => p.plan === 'vip' && p.period === 'yearly').length, color: '#9333ea' },
  ]);
  byStatus = computed(() => {
    const colors: Record<string, string> = { success: '#10b981', pending: '#f59e0b', failed: '#f43f5e', failed_final: '#e11d48', amount_mismatch: '#64748b' };
    return countBy(this.base(), (p) => p.status).map((r) => ({ label: this.labels[r.key as Payment['status']] ?? r.key, value: r.count, color: colors[r.key] ?? '#94a3b8' }));
  });

  rows = computed(() => {
    const q = this.q().trim().toLocaleLowerCase('tr');
    return this.base().filter(
      (p) => (this.status() === 'all' || p.status === this.status()) && (!q || `${p.email} ${p.id} ${p.uid}`.toLocaleLowerCase('tr').includes(q))
    );
  });

  pendingOld = computed(() => this.base().filter((p) => p.status === 'pending' && Date.now() - p.createdAt > DAY_MS).length);

  constructor() {
    this.data.payments.load();
  }

  tone(s: string) {
    return s === 'success' ? 'emerald' : s === 'pending' ? 'amber' : 'rose';
  }

  exportCsv() {
    const rows: (string | number | undefined)[][] = [['Sipariş', 'Tarih', 'Ödeme tarihi', 'E-posta', 'UID', 'Plan', 'Dönem', 'Tutar', 'Durum', 'Test', 'Ödeme tipi', 'Hata']];
    for (const p of this.rows())
      rows.push([
        p.id,
        fmtDateTime(p.createdAt),
        p.paidAt ? fmtDateTime(p.paidAt) : '',
        p.email,
        p.uid,
        PLANS[p.plan]?.label,
        p.period === 'yearly' ? 'Yıllık' : 'Aylık',
        this.amount(p),
        this.labels[p.status],
        p.testMode ? 'Evet' : '',
        p.paymentType ?? '',
        p.failedReason ?? '',
      ]);
    downloadCsv(`odivon-odemeler-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  }
}
