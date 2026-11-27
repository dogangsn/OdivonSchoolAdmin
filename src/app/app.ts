import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/theme.service';
import { ToastService } from './core/toast.service';
import { Icon } from './shared/icon';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Icon],
  template: `
    <router-outlet />
    <div class="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-[min(92vw,380px)]">
      @for (t of toast.toasts(); track t.id) {
        <div class="flex items-start gap-3 p-3.5 rounded-xl shadow-lg border text-sm font-semibold bg-white dark:bg-slate-900"
          [class]="t.type === 'success' ? 'border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300' : t.type === 'danger' ? 'border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300' : 'border-slate-200 dark:border-slate-700'">
          <app-icon [name]="t.type === 'success' ? 'check' : t.type === 'danger' ? 'warning' : 'sparkles'" />
          <span class="flex-1">{{ t.text }}</span>
          <button class="text-slate-400 hover:text-slate-600 cursor-pointer" (click)="toast.dismiss(t.id)"><app-icon name="x" size="w-4 h-4" /></button>
        </div>
      }
    </div>
  `,
})
export class App {
  toast = inject(ToastService);
  private theme = inject(ThemeService);
}
