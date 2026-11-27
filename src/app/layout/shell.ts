import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { DataService } from '../core/data.service';
import { ThemeService } from '../core/theme.service';
import { Icon } from '../shared/icon';
import { Avatar } from '../shared/ui';
import { environment } from '../../environments/environment';
import { AppUser } from '../models/user';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  exact?: boolean;
  badge?: () => number;
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, Avatar],
  templateUrl: './shell.html',
})
export class Shell {
  auth = inject(AuthService);
  data = inject(DataService);
  theme = inject(ThemeService);
  private router = inject(Router);
  appUrl = environment.appUrl;

  mobileOpen = signal(false);
  search = signal('');
  searchOpen = signal(false);

  private url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => (e as NavigationEnd).urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );

  unverifiedTeachers = computed(() => this.data.users.data().filter((u) => u.role === 'teacher' && !u.teacherVerified).length);

  groups: { title: string; items: NavItem[] }[] = [
    {
      title: 'Genel',
      items: [
        { path: '/', label: 'Genel Bakış', icon: 'home', exact: true },
        { path: '/aktivite', label: 'Aktivite ve Kullanım', icon: 'pulse' },
      ],
    },
    {
      title: 'Müşteriler',
      items: [
        { path: '/kullanicilar', label: 'Kullanıcılar', icon: 'users' },
        { path: '/okullar', label: 'Okullar ve Sınıflar', icon: 'school', badge: () => this.unverifiedTeachers() },
        { path: '/abonelikler', label: 'Abonelikler', icon: 'card' },
        { path: '/odemeler', label: 'Ödemeler', icon: 'receipt' },
      ],
    },
    {
      title: 'İçerik',
      items: [
        { path: '/soru-havuzu', label: 'Soru Havuzu', icon: 'book' },
        { path: '/onay', label: 'Soru Onayı', icon: 'check' },
      ],
    },
    {
      title: 'Sistem',
      items: [{ path: '/kayitlar', label: 'İşlem Kayıtları', icon: 'history' }],
    },
  ];

  pageTitle = computed(() => {
    const u = this.url().split('?')[0];
    for (const g of this.groups) for (const i of g.items) if (i.exact ? u === i.path : u.startsWith(i.path) && i.path !== '/') return i.label;
    return u === '/' ? 'Genel Bakış' : 'Yönetim';
  });

  results = computed<AppUser[]>(() => {
    const q = this.search().trim().toLocaleLowerCase('tr');
    if (q.length < 2) return [];
    return this.data.users
      .data()
      .filter((u) => `${u.displayName ?? ''} ${u.email ?? ''} ${u.school ?? ''} ${u.username ?? ''}`.toLocaleLowerCase('tr').includes(q))
      .slice(0, 8);
  });

  constructor() {
    // Users feed the sidebar badge and global search.
    this.data.users.load();
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => this.mobileOpen.set(false));
  }

  open(u: AppUser) {
    this.search.set('');
    this.searchOpen.set(false);
    this.router.navigate(['/kullanicilar', u.uid]);
  }

  async logout() {
    await this.auth.signOut();
    this.router.navigate(['/giris']);
  }
}
