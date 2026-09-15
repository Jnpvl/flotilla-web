import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, tap } from 'rxjs';
import { ApiClient } from './api-client';

export type AuthUser = {
  id: number;
  nombre: string;
  username: string;
  rol: string;
  agenteContpaqId?: number | null;
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
  private sessionValidated = false;
  private sessionCheck$: Observable<boolean> | null = null;

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
        this.sessionValidated = true;
        this.sessionCheck$ = null;
      }),
    );
  }

  /**
   * Confirma contra la API que el token y el usuario siguen siendo válidos.
   * Solo limpia la sesión local ante 401 (token/usuario inválidos).
   * Errores de red o 5xx mantienen la sesión cacheada para no botar al refrescar.
   */
  ensureSession(): Observable<boolean> {
    if (!this.tokenSignal()) {
      this.sessionValidated = false;
      return of(false);
    }
    if (this.sessionValidated && this.userSignal()) {
      return of(true);
    }
    if (this.sessionCheck$) {
      return this.sessionCheck$;
    }

    this.sessionCheck$ = this.api.get<AuthUser>('/auth/me').pipe(
      tap((user) => {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        this.userSignal.set(user);
        this.sessionValidated = true;
      }),
      map(() => true),
      catchError((err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 401) {
          this.clearLocalSession();
          return of(false);
        }
        // Red / 5xx / CORS: conservar sesión local si hay usuario cacheado.
        if (this.userSignal()) {
          return of(true);
        }
        return of(false);
      }),
      finalize(() => {
        this.sessionCheck$ = null;
      }),
    );

    return this.sessionCheck$;
  }

  logout(): void {
    this.clearLocalSession();
    if (!this.router.url.startsWith('/login')) {
      void this.router.navigateByUrl('/login');
    }
  }

  private clearLocalSession(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.tokenSignal.set(null);
    this.userSignal.set(null);
    this.sessionValidated = false;
    this.sessionCheck$ = null;
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
