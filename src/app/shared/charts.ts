import { Component, computed, input } from '@angular/core';

export interface Point {
  label: string;
  value: number;
}

/** Vertical bar chart (one series) with hover values. */
@Component({
  selector: 'app-bar-chart',
  template: `
    <div class="relative w-full" [style.height.px]="height()">
      <svg class="w-full h-full overflow-visible" [attr.viewBox]="'0 0 ' + W + ' ' + height()" preserveAspectRatio="none">
        @for (g of grid(); track g.y) {
          <line x1="0" [attr.x2]="W" [attr.y1]="g.y" [attr.y2]="g.y" class="stroke-slate-200 dark:stroke-slate-800" stroke-dasharray="3 4" vector-effect="non-scaling-stroke" />
        }
        @for (b of bars(); track b.i) {
          <rect [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.w" [attr.height]="b.h" rx="3" [attr.fill]="color()" class="opacity-85 hover:opacity-100 transition-opacity">
            <title>{{ b.label }}: {{ b.value }}{{ unit() }}</title>
          </rect>
        }
      </svg>
      <div class="absolute -top-1 left-0 text-[10px] font-bold text-slate-400">{{ max() }}{{ unit() }}</div>
    </div>
    <div class="flex justify-between mt-2 text-[10px] font-semibold text-slate-400">
      @for (l of ticks(); track $index) {
        <span>{{ l }}</span>
      }
    </div>
  `,
})
export class BarChart {
  data = input.required<Point[]>();
  height = input(160);
  color = input('#6366f1');
  unit = input('');
  readonly W = 600;

  max = computed(() => Math.max(1, ...this.data().map((d) => d.value)));
  grid = computed(() => [0.25, 0.5, 0.75].map((f) => ({ y: this.height() * f })));
  bars = computed(() => {
    const d = this.data();
    const slot = this.W / Math.max(1, d.length);
    const w = Math.max(2, slot * 0.68);
    const h = this.height();
    const max = this.max();
    return d.map((p, i) => {
      const bh = p.value ? Math.max(3, (p.value / max) * (h - 6)) : 0;
      return { i, x: i * slot + (slot - w) / 2, w, y: h - bh, h: bh, label: p.label, value: Math.round(p.value * 10) / 10 };
    });
  });
  ticks = computed(() => {
    const d = this.data();
    if (d.length <= 1) return d.map((p) => p.label);
    const n = Math.min(6, d.length);
    return Array.from({ length: n }, (_, k) => d[Math.round((k * (d.length - 1)) / (n - 1))].label);
  });
}

/** Smooth area/line chart, optionally with a second dashed series. */
@Component({
  selector: 'app-line-chart',
  template: `
    <div class="relative w-full" [style.height.px]="height()">
      <svg class="w-full h-full overflow-visible" [attr.viewBox]="'0 0 ' + W + ' ' + height()" preserveAspectRatio="none">
        <defs>
          <linearGradient [attr.id]="gid" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" [attr.stop-color]="color()" stop-opacity="0.28" />
            <stop offset="100%" [attr.stop-color]="color()" stop-opacity="0" />
          </linearGradient>
        </defs>
        @for (g of grid(); track g) {
          <line x1="0" [attr.x2]="W" [attr.y1]="g" [attr.y2]="g" class="stroke-slate-200 dark:stroke-slate-800" stroke-dasharray="3 4" vector-effect="non-scaling-stroke" />
        }
        <path [attr.d]="area()" [attr.fill]="'url(#' + gid + ')'" />
        <path [attr.d]="line()" fill="none" [attr.stroke]="color()" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
        @if (line2()) {
          <path [attr.d]="line2()" fill="none" [attr.stroke]="color2()" stroke-width="2" stroke-dasharray="5 5" vector-effect="non-scaling-stroke" />
        }
        @for (p of hits(); track p.i) {
          <rect [attr.x]="p.x" y="0" [attr.width]="p.w" [attr.height]="height()" fill="transparent"><title>{{ p.title }}</title></rect>
        }
      </svg>
      <div class="absolute -top-1 left-0 text-[10px] font-bold text-slate-400">{{ max() }}{{ unit() }}</div>
    </div>
    <div class="flex justify-between mt-2 text-[10px] font-semibold text-slate-400">
      @for (l of ticks(); track $index) {
        <span>{{ l }}</span>
      }
    </div>
  `,
})
export class LineChart {
  data = input.required<Point[]>();
  data2 = input<Point[] | null>(null);
  height = input(180);
  color = input('#6366f1');
  color2 = input('#10b981');
  unit = input('');
  label1 = input('');
  label2 = input('');
  readonly W = 600;
  readonly gid = 'g' + Math.random().toString(36).slice(2, 8);

  max = computed(() => Math.max(1, ...this.data().map((d) => d.value), ...(this.data2() ?? []).map((d) => d.value)));
  grid = computed(() => [0.25, 0.5, 0.75].map((f) => this.height() * f));

  private pts(d: Point[]) {
    const h = this.height() - 4;
    const step = d.length > 1 ? this.W / (d.length - 1) : this.W;
    return d.map((p, i) => [i * step, h - (p.value / this.max()) * (h - 4) + 2] as const);
  }
  private path(d: Point[]) {
    const p = this.pts(d);
    if (!p.length) return '';
    let s = `M${p[0][0]},${p[0][1]}`;
    for (let i = 1; i < p.length; i++) {
      const [x0, y0] = p[i - 1];
      const [x1, y1] = p[i];
      const cx = (x0 + x1) / 2;
      s += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
    }
    return s;
  }
  line = computed(() => this.path(this.data()));
  line2 = computed(() => (this.data2() ? this.path(this.data2()!) : ''));
  area = computed(() => {
    const l = this.line();
    return l ? `${l} L${this.W},${this.height()} L0,${this.height()} Z` : '';
  });
  hits = computed(() => {
    const d = this.data();
    const d2 = this.data2();
    const w = this.W / Math.max(1, d.length);
    return d.map((p, i) => ({
      i,
      x: i * (this.W / Math.max(1, d.length - 1)) - w / 2,
      w,
      title: `${p.label}: ${this.label1() ? this.label1() + ' ' : ''}${p.value}${this.unit()}${d2?.[i] ? ` · ${this.label2()} ${d2[i].value}` : ''}`,
    }));
  });
  ticks = computed(() => {
    const d = this.data();
    if (d.length <= 1) return d.map((p) => p.label);
    const n = Math.min(6, d.length);
    return Array.from({ length: n }, (_, k) => d[Math.round((k * (d.length - 1)) / (n - 1))].label);
  });
}

export interface Segment {
  label: string;
  value: number;
  color: string;
}

/** Donut with a centre total and a legend. */
@Component({
  selector: 'app-donut',
  template: `
    <div class="flex items-center gap-6">
      <div class="relative shrink-0" [style.width.px]="size()" [style.height.px]="size()">
        <svg viewBox="0 0 42 42" class="w-full h-full -rotate-90">
          <circle cx="21" cy="21" r="15.9155" fill="none" class="stroke-slate-100 dark:stroke-slate-800" stroke-width="5" />
          @for (s of arcs(); track s.label) {
            <circle cx="21" cy="21" r="15.9155" fill="none" [attr.stroke]="s.color" stroke-width="5"
              [attr.stroke-dasharray]="s.pct + ' ' + (100 - s.pct)" [attr.stroke-dashoffset]="-s.offset"><title>{{ s.label }}: {{ s.value }}</title></circle>
          }
        </svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center">
          <div class="text-2xl font-black text-slate-900 dark:text-white leading-none">{{ total() }}</div>
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">{{ caption() }}</div>
        </div>
      </div>
      <ul class="space-y-2 text-xs min-w-0 flex-1">
        @for (s of arcs(); track s.label) {
          <li class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full shrink-0" [style.background]="s.color"></span>
            <span class="text-slate-600 dark:text-slate-300 font-semibold truncate">{{ s.label }}</span>
            <span class="ml-auto font-black text-slate-900 dark:text-white">{{ s.value }}</span>
            <span class="w-10 text-right text-slate-400 font-semibold">%{{ s.pctLabel }}</span>
          </li>
        }
      </ul>
    </div>
  `,
})
export class Donut {
  segments = input.required<Segment[]>();
  size = input(132);
  caption = input('Toplam');
  total = computed(() => this.segments().reduce((s, x) => s + x.value, 0));
  arcs = computed(() => {
    const t = this.total() || 1;
    let off = 0;
    return this.segments().map((s) => {
      const pct = (s.value / t) * 100;
      const a = { ...s, pct, offset: off, pctLabel: Math.round(pct) };
      off += pct;
      return a;
    });
  });
}

/** Horizontal ranked bars (HTML). */
@Component({
  selector: 'app-hbars',
  template: `
    <ul class="space-y-3">
      @for (r of rows(); track r.label) {
        <li>
          <div class="flex items-center justify-between text-xs mb-1">
            <span class="font-semibold text-slate-600 dark:text-slate-300 truncate pr-2">{{ r.label }}</span>
            <span class="font-black text-slate-900 dark:text-white">{{ r.value }}{{ unit() }}</span>
          </div>
          <div class="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div class="h-full rounded-full transition-all" [style.width.%]="r.pct" [style.background]="color()"></div>
          </div>
        </li>
      } @empty {
        <li class="text-xs text-slate-400 py-4 text-center">Veri yok</li>
      }
    </ul>
  `,
})
export class HBars {
  data = input.required<Point[]>();
  color = input('#6366f1');
  unit = input('');
  /** Bars relative to this (e.g. 100 for percentages); default = max. */
  scale = input<number | null>(null);
  rows = computed(() => {
    const d = this.data();
    const max = this.scale() ?? Math.max(1, ...d.map((x) => x.value));
    return d.map((x) => ({ ...x, pct: Math.min(100, (x.value / max) * 100) }));
  });
}
