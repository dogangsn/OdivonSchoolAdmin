import { Routes } from '@angular/router';
import { adminGuard, loginGuard } from './core/admin.guard';

export const routes: Routes = [
  { path: 'giris', canActivate: [loginGuard], loadComponent: () => import('./pages/login/login').then((m) => m.Login) },
  {
    path: '',
    canActivate: [adminGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', title: 'Genel Bakış', loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.Dashboard) },
      { path: 'kullanicilar', title: 'Kullanıcılar', loadComponent: () => import('./pages/users/users').then((m) => m.Users) },
      { path: 'kullanicilar/:uid', title: 'Kullanıcı', loadComponent: () => import('./pages/user-detail/user-detail').then((m) => m.UserDetail) },
      { path: 'abonelikler', title: 'Abonelikler', loadComponent: () => import('./pages/subscriptions/subscriptions').then((m) => m.Subscriptions) },
      { path: 'odemeler', title: 'Ödemeler', loadComponent: () => import('./pages/payments/payments').then((m) => m.Payments) },
      { path: 'aktivite', title: 'Aktivite', loadComponent: () => import('./pages/activity/activity').then((m) => m.Activity) },
      { path: 'okullar/:key', title: 'Okul', loadComponent: () => import('./pages/school-detail/school-detail').then((m) => m.SchoolDetail) },
      { path: 'siniflar/:id', title: 'Sınıf', loadComponent: () => import('./pages/class-detail/class-detail').then((m) => m.ClassDetail) },
      { path: 'icerik', title: 'İçerik Performansı', loadComponent: () => import('./pages/content/content').then((m) => m.Content) },
      { path: 'buyume', title: 'Büyüme Analizi', loadComponent: () => import('./pages/growth/growth').then((m) => m.Growth) },
      { path: 'okullar', title: 'Okullar ve Sınıflar', loadComponent: () => import('./pages/schools/schools').then((m) => m.Schools) },
      { path: 'soru-havuzu', title: 'Soru Havuzu', loadComponent: () => import('./pages/pool/pool').then((m) => m.Pool) },
      { path: 'onay', title: 'Soru Onayı', loadComponent: () => import('./pages/review/review').then((m) => m.Review) },
      { path: 'kayitlar', title: 'İşlem Kayıtları', loadComponent: () => import('./pages/audit/audit').then((m) => m.Audit) },
    ],
  },
  { path: '**', redirectTo: '' },
];
