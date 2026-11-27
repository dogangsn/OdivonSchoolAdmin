import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-login',
  imports: [FormsModule, Icon],
  template: `
    <div class="min-h-screen grid lg:grid-cols-2">
      <div class="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-indigo-600 via-purple-600 to-fuchsia-600 text-white relative overflow-hidden">
        <div class="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-white/10 blur-2xl"></div>
        <div class="absolute -left-20 bottom-0 w-80 h-80 rounded-full bg-indigo-900/30 blur-2xl"></div>
        <div class="flex items-center gap-3 relative">
          <img src="odivon-logo.svg" class="w-11 h-11 rounded-xl bg-white/90 p-1" alt="" />
          <div>
            <div class="font-black text-lg">Odivon School</div>
            <div class="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">Admin Console</div>
          </div>
        </div>
        <div class="relative">
          <h2 class="text-4xl font-black leading-tight tracking-tight">Okullarınızı, abonelerinizi<br />ve içeriği tek yerden yönetin.</h2>
          <ul class="mt-8 space-y-3 text-sm font-semibold text-white/85">
            <li class="flex items-center gap-3"><app-icon name="chart" /> Gelir, dönüşüm ve kullanım metrikleri</li>
            <li class="flex items-center gap-3"><app-icon name="school" /> Okul, öğretmen ve sınıf takibi</li>
            <li class="flex items-center gap-3"><app-icon name="receipt" /> PayTR ödemeleri ve abonelik geçmişi</li>
            <li class="flex items-center gap-3"><app-icon name="book" /> Soru havuzu ve onay akışı</li>
          </ul>
        </div>
        <div class="text-xs text-white/60 relative">Yalnızca yönetici hesapları giriş yapabilir.</div>
      </div>

      <div class="flex items-center justify-center p-6">
        <form class="w-full max-w-sm" (ngSubmit)="submit()">
          <div class="lg:hidden flex items-center gap-3 mb-8">
            <img src="odivon-logo.svg" class="w-10 h-10 rounded-xl" alt="" />
            <div class="font-black text-slate-900 dark:text-white">Odivon School Admin</div>
          </div>
          <h1 class="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Yönetici girişi</h1>
          <p class="text-sm text-slate-500 mt-1 mb-8">Odivon School yönetici hesabınızla giriş yapın.</p>

          @if (error()) {
            <div class="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold dark:bg-rose-950/50 dark:border-rose-900 dark:text-rose-300">{{ error() }}</div>
          }

          <label class="label" for="email">E-posta</label>
          <input id="email" class="input mb-4" type="email" name="email" autocomplete="username" [(ngModel)]="email" required />
          <label class="label" for="pw">Şifre</label>
          <input id="pw" class="input mb-6" type="password" name="password" autocomplete="current-password" [(ngModel)]="password" required />
          <button class="btn-primary w-full !py-3 !text-sm" [disabled]="busy()">
            {{ busy() ? 'Giriş yapılıyor…' : 'Giriş yap' }}
          </button>
        </form>
      </div>
    </div>
  `,
})
export class Login {
  private auth = inject(AuthService);
  private router = inject(Router);
  email = '';
  password = '';
  busy = signal(false);
  error = signal('');

  async submit() {
    if (!this.email || !this.password) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const state = await this.auth.signIn(this.email.trim(), this.password);
      if (state === 'admin') {
        this.router.navigate(['/']);
      } else {
        await this.auth.signOut();
        this.error.set('Bu hesabın yönetici yetkisi yok.');
      }
    } catch (e: any) {
      const code = e?.code ?? '';
      this.error.set(
        code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')
          ? 'E-posta veya şifre hatalı.'
          : code.includes('too-many-requests')
            ? 'Çok fazla deneme yapıldı, biraz sonra tekrar deneyin.'
            : code.includes('unauthorized-domain')
              ? 'Bu alan adı Firebase Authentication > Settings > Authorized domains listesine eklenmeli.'
              : 'Giriş yapılamadı: ' + (e?.message ?? '')
      );
    } finally {
      this.busy.set(false);
    }
  }
}
