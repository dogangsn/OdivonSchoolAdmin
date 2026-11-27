import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { ago, countBy, downloadCsv, fmtDateTime, toCsv } from '../../core/metrics';
import { SubscriptionEvent } from '../../models/subscription';
import { Icon } from '../../shared/icon';
import { Badge, Empty, PageHeader } from '../../shared/ui';

const TYPE_LABELS: Record<SubscriptionEvent['type'], string> = {
  plan: 'Plan',
  trial: 'Deneme',
  extend: 'Uzatma',
  cancel: 'İptal',
  suspend: 'Askı',
  unsuspend: 'Askı kaldırma',
  role: 'Rol',
  verify: 'Öğretmen onayı',
};

@Component({
  selector: 'app-audit',
  imports: [RouterLink, Icon, Badge, Empty, PageHeader],
  template: `
    <app-page-header title="İşlem Kayıtları" subtitle="Panelden ve ödeme sisteminden yapılan tüm abonelik/hesap değişiklikleri (son 500)">
      <button class="btn-ghost" (click)="data.events.load(true)" [disabled]="data.events.loading()">
        <app-icon name="refresh" size="w-4 h-4" [class.animate-spin]="data.events.loading()" /> Yenile
      </button>
      <button class="btn-primary" (click)="exportCsv()"><app-icon name="download" size="w-4 h-4" /> CSV indir</button>
    </app-page-header>

    <div class="flex flex-wrap gap-2 mb-5">
      <button class="btn-sm" [class]="type() === 'all' ? 'btn-primary' : 'btn-ghost'" (click)="type.set('all')">Tümü ({{ data.events.data().length }})</button>
      @for (t of types(); track t.key) {
        <button class="btn-sm" [class]="type() === t.key ? 'btn-primary' : 'btn-ghost'" (click)="type.set($any(t.key))">{{ label(t.key) }} ({{ t.count }})</button>
      }
    </div>

    <div class="card overflow-hidden">
      <div class="p-4 border-b border-slate-100 dark:border-slate-800">
        <div class="relative">
          <app-icon name="search" size="w-4 h-4" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input class="input !pl-10" placeholder="E-posta, açıklama ya da işlemi yapan" [value]="q()" (input)="q.set($any($event.target).value)" />
        </div>
      </div>
      <div class="overflow-x-auto custom-scroll">
        <table class="data">
          <thead><tr><th>Zaman</th><th>Tür</th><th>Kullanıcı</th><th>Açıklama</th><th>Yapan</th></tr></thead>
          <tbody>
            @for (e of rows(); track e.id) {
              <tr>
                <td class="text-xs whitespace-nowrap">{{ fmtDateTime(e.at) }}<div class="text-[11px] text-slate-400">{{ ago(e.at) }}</div></td>
                <td><app-badge [tone]="tone(e.type)">{{ label(e.type) }}</app-badge></td>
                <td><a [routerLink]="['/kullanicilar', e.uid]" class="text-xs font-bold text-slate-900 dark:text-white hover:text-indigo-600">{{ e.email || e.uid }}</a></td>
                <td class="text-xs text-slate-600 dark:text-slate-300">{{ e.summary }}</td>
                <td class="text-xs whitespace-nowrap">{{ e.byName }}</td>
              </tr>
            } @empty {
              <tr><td colspan="5"><app-empty icon="history" title="Kayıt yok" /></td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class Audit {
  data = inject(DataService);
  readonly ago = ago;
  readonly fmtDateTime = fmtDateTime;
  type = signal<'all' | SubscriptionEvent['type']>('all');
  q = signal('');

  types = computed(() => countBy(this.data.events.data(), (e) => e.type));
  rows = computed(() => {
    const q = this.q().trim().toLocaleLowerCase('tr');
    return this.data.events
      .data()
      .filter((e) => (this.type() === 'all' || e.type === this.type()) && (!q || `${e.email} ${e.summary} ${e.byName}`.toLocaleLowerCase('tr').includes(q)));
  });

  constructor() {
    this.data.events.load();
  }

  label(k: string): string {
    return (TYPE_LABELS as Record<string, string>)[k] ?? k;
  }

  tone(t: SubscriptionEvent['type']) {
    return ({ plan: 'emerald', trial: 'amber', extend: 'indigo', cancel: 'rose', suspend: 'rose', unsuspend: 'emerald', role: 'purple', verify: 'sky' } as const)[t] ?? 'slate';
  }

  exportCsv() {
    const rows: string[][] = [['Zaman', 'Tür', 'E-posta', 'UID', 'Açıklama', 'Yapan']];
    for (const e of this.rows()) rows.push([fmtDateTime(e.at), TYPE_LABELS[e.type] ?? e.type, e.email, e.uid, e.summary, e.byName]);
    downloadCsv(`odivon-islem-kayitlari-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  }
}
