import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  dark = signal(false);

  constructor() {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('odv-admin-theme');
    } catch {}
    const dark = saved ? saved === 'dark' : window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    this.apply(!!dark);
  }

  toggle() {
    this.apply(!this.dark());
  }

  private apply(dark: boolean) {
    this.dark.set(dark);
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('odv-admin-theme', dark ? 'dark' : 'light');
    } catch {}
  }
}
