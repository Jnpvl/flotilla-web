import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { ApiClient } from './api-client';

export type AuthUser = {
  id: number;
  nombre: string;
  username: string;
  rol: string;
};

export type LoginResponse = {
  accessToken: string;
  user: AuthUser;
};

const TOKEN_KEY = 'flotilla.accessToken';
const USER_KEY = 'flotilla.user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);

  private readonly userSignal = signal<AuthUser | null>(this.readUser());
  private readonly tokenSignal = signal<string | null>(this.readToken());

  readonly user = this.userSignal.asReadonly();
  readonly token = this.tokenSignal.asReadonly();
  readonly isAuthenticated = computed(() => !!this.tokenSignal());

  login(username: string, password: string): Observable<LoginResponse> {
    return this.api.post<LoginResponse>('/auth/login', { username, password }).pipe(
      tap((response) => {
        localStorage.setItem(TOKEN_KEY, response.accessToken);
        localStorage.setItem(USER_KEY, JSON.stringify(response.user));
        this.tokenSignal.set(response.accessToken);
        this.userSignal.set(response.user);
      }),
    );
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.tokenSignal.set(null);
    this.userSignal.set(null);
    if (!this.router.url.startsWith('/login')) {
      void this.router.navigateByUrl('/login');
    }
  }

  private readToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  private readUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }
}
