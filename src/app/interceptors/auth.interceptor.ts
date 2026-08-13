import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

let handlingUnauthorized = false;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const isLoginRequest = req.url.includes('/auth/login');

  return next(req).pipe(
    catchError((error: unknown) => {
      if (
        !isLoginRequest &&
        error instanceof HttpErrorResponse &&
        error.status === 401
      ) {
        if (!handlingUnauthorized) {
          handlingUnauthorized = true;
          auth.logout();
          // permite futuros 401 tras un nuevo login
          setTimeout(() => {
            handlingUnauthorized = false;
          }, 1000);
        }
      }
      return throwError(() => error);
    }),
  );
};
