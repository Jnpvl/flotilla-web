import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { nowLocalWallClock } from '../utils/local-datetime';

export type ApiRequestOptions = {
  params?: Record<string, string | number | boolean | readonly (string | number | boolean)[]>;
  headers?: Record<string, string>;
};

@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  get<T>(path: string, options?: ApiRequestOptions): Observable<T> {
    return this.http.get<T>(this.url(path), this.buildOptions(options));
  }

  post<T>(path: string, body?: unknown, options?: ApiRequestOptions): Observable<T> {
    return this.http.post<T>(this.url(path), body ?? null, this.buildOptions(options));
  }

  put<T>(path: string, body?: unknown, options?: ApiRequestOptions): Observable<T> {
    return this.http.put<T>(this.url(path), body ?? null, this.buildOptions(options));
  }

  patch<T>(path: string, body?: unknown, options?: ApiRequestOptions): Observable<T> {
    return this.http.patch<T>(this.url(path), body ?? null, this.buildOptions(options));
  }

  delete<T>(path: string, options?: ApiRequestOptions): Observable<T> {
    return this.http.delete<T>(this.url(path), this.buildOptions(options));
  }

  private url(path: string): string {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}${normalized}`;
  }

  private buildOptions(options?: ApiRequestOptions): {
    headers?: HttpHeaders;
    params?: HttpParams;
  } {
    let headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'X-Client-Local-Time': nowLocalWallClock(),
    });

    const token = localStorage.getItem('flotilla.accessToken');
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    if (options?.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        headers = headers.set(key, value);
      }
    }

    let params = new HttpParams();
    if (options?.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (Array.isArray(value)) {
          for (const item of value) {
            params = params.append(key, String(item));
          }
        } else {
          params = params.set(key, String(value));
        }
      }
    }

    return {
      headers,
      params: options?.params ? params : undefined,
    };
  }
}
