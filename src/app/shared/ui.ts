import { Component, computed, input } from '@angular/core';
import { Icon } from './icon';

type Tone = 'indigo' | 'emerald' | 'amber' | 'rose' | 'sky' | 'purple' | 'slate';

const TONES: Record<Tone, string> = {
  indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-300',
  purple: 'bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-300',
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

const BADGES: Record<Tone, string> = {
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-900',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900',
  amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900',
  rose: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-900',
  sky: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-900',
  purple: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-900',
  slate: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};

/** Executive KPI card. */
@Component({
  selector: 'app-kpi',
  imports: [Icon],
  template: `
    <div class="card p-5 sm:p-6 h-full transition-all hover:shadow-md hover:-translate-y-0.5">
      <div class="flex items-center justify-between gap-3">
        <span class="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{{ label() }}</span>
        <div class="w-10 h-10 rounded-xl flex items-center justify-center" [class]="toneCls()">
          <app-icon [name]="icon()" />
        </div>
      </div>
      <div class="mt-3 flex items-end gap-2">
        <div class="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-none">{{ value() }}</div>
        @if (delta() !== null) {
          <span class="mb-0.5 inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full"
            [class]="delta()! >= 0 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'">
            <app-icon [name]="delta()! >= 0 ? 'arrowUp' : 'arrowDown'" size="w-3 h-3" />%{{ abs(delta()!) }}
          </span>
        }
      </div>
      @if (hint()) {
        <div class="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1.5">{{ hint() }}</div>
      }
      <ng-content />
    </div>
  `,
})
export class Kpi {
  label = input.required<string>();
  value = input.required<string | number>();
  icon = input('chart');
  tone = input<Tone>('indigo');
  hint = input('');
  delta = input<number | null>(null);
  toneCls = computed(() => TONES[this.tone()]);
  abs = Math.abs;
}

@Component({
  selector: 'app-badge',
  template: `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold whitespace-nowrap" [class]="cls()"><ng-content /></span>`,
})
export class Badge {
  tone = input<Tone>('slate');
  cls = computed(() => BADGES[this.tone()]);
}

@Component({
  selector: 'app-avatar',
  template: `<div class="rounded-full flex items-center justify-center font-black text-white shrink-0 shadow-sm"
    [style.width.px]="size()" [style.height.px]="size()" [style.font-size.px]="size() * 0.38" [style.background]="bg()">{{ initials() }}</div>`,
})
export class Avatar {
  name = input('');
  size = input(36);
  initials = computed(() => {
    const parts = (this.name() || '?').trim().split(/[\s@._]+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toLocaleUpperCase('tr');
  });
  bg = computed(() => {
    let h = 0;
    for (const ch of this.name() || '?') h = (h * 31 + ch.charCodeAt(0)) % 360;
    return `linear-gradient(135deg, hsl(${h} 70% 58%), hsl(${(h + 40) % 360} 70% 48%))`;
  });
}

/** Page header: title, subtitle and an actions slot. */
@Component({
  selector: 'app-page-header',
  template: `
    <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
      <div>
        <h1 class="text-2xl sm:text-[28px] font-black text-slate-900 dark:text-white tracking-tight">{{ title() }}</h1>
        @if (subtitle()) {
          <p class="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">{{ subtitle() }}</p>
        }
      </div>
      <div class="flex flex-wrap items-center gap-2"><ng-content /></div>
    </div>
  `,
})
export class PageHeader {
  title = input.required<string>();
  subtitle = input('');
}

@Component({
  selector: 'app-empty',
  imports: [Icon],
  template: `
    <div class="flex flex-col items-center justify-center text-center py-12 px-6">
      <div class="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-3">
        <app-icon [name]="icon()" size="w-6 h-6" />
      </div>
      <div class="text-sm font-bold text-slate-700 dark:text-slate-200">{{ title() }}</div>
      @if (text()) {
        <div class="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">{{ text() }}</div>
      }
    </div>
  `,
})
export class Empty {
  icon = input('doc');
  title = input.required<string>();
  text = input('');
}
