import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  type: 'success' | 'danger' | 'info';
  text: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  toasts = signal<Toast[]>([]);
  private next = 1;

  show(type: Toast['type'], text: string) {
    const t = { id: this.next++, type, text };
    this.toasts.update((l) => [...l, t]);
    setTimeout(() => this.dismiss(t.id), 4500);
  }
  success(text: string) {
    this.show('success', text);
  }
  error(text: string) {
    this.show('danger', text);
  }
  dismiss(id: number) {
    this.toasts.update((l) => l.filter((t) => t.id !== id));
  }
}
