import { Injectable, inject, signal } from '@angular/core';
import { Auth, User, onAuthStateChanged, signInWithEmailAndPassword, signOut } from '@angular/fire/auth';
import { Firestore, doc, getDoc, updateDoc } from '@angular/fire/firestore';
import { AppUser } from '../models/user';

export type AuthState = 'loading' | 'signed-out' | 'not-admin' | 'admin';

/**
 * Admin-only sign-in. Anyone can sign in to Firebase Auth, but the panel only
 * opens when users/{uid}.role === 'admin'; firestore.rules enforce the same
 * check on every read and write, so this is only the client gate.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);

  state = signal<AuthState>('loading');
  me = signal<AppUser | null>(null);
  private ready!: Promise<void>;

  constructor() {
    let resolve!: () => void;
    this.ready = new Promise((r) => (resolve = r));
    onAuthStateChanged(this.auth, async (user) => {
      await this.load(user);
      resolve();
    });
  }

  whenReady() {
    return this.ready;
  }

  private async load(user: User | null) {
    if (!user) {
      this.me.set(null);
      this.state.set('signed-out');
      return;
    }
    try {
      const snap = await getDoc(doc(this.firestore, `users/${user.uid}`));
      const data = snap.exists() ? ({ ...(snap.data() as AppUser), uid: user.uid } as AppUser) : null;
      if (data?.role === 'admin') {
        this.me.set(data);
        this.state.set('admin');
        // Keep "son görülme" fresh for the owner too (rules whitelist this field).
        if (!data.lastSeenAt || Date.now() - data.lastSeenAt > 6 * 3600_000) {
          updateDoc(doc(this.firestore, `users/${user.uid}`), { lastSeenAt: Date.now() }).catch(() => {});
        }
      } else {
        this.me.set(data);
        this.state.set('not-admin');
      }
    } catch {
      this.me.set(null);
      this.state.set('not-admin');
    }
  }

  async signIn(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(this.auth, email, password);
    await this.load(cred.user);
    return this.state();
  }

  signOut() {
    return signOut(this.auth);
  }
}
