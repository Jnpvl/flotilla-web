import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';
import {
  canAccessFlotilla,
  canAccessInicio,
  canAccessUsuarios,
  canAccessVentas,
  canAccessVisitas,
  defaultHomePath,
} from '../utils/roles';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.token()) {
    return router.createUrlTree(['/login']);
  }

  return auth.ensureSession().pipe(
    map((ok) => (ok ? true : router.createUrlTree(['/login']))),
  );
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.token()) {
    return true;
  }

  return auth.ensureSession().pipe(
    map((ok) =>
      ok ? router.createUrlTree([defaultHomePath(auth.user()?.rol)]) : true,
    ),
  );
};

export const inicioGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (canAccessInicio(auth.user()?.rol)) return true;
  return router.createUrlTree([defaultHomePath(auth.user()?.rol)]);
};

export const flotillaGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (canAccessFlotilla(auth.user()?.rol)) return true;
  return router.createUrlTree([defaultHomePath(auth.user()?.rol)]);
};

export const ventasGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (canAccessVentas(auth.user()?.rol)) return true;
  return router.createUrlTree([defaultHomePath(auth.user()?.rol)]);
};

export const visitasGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (canAccessVisitas(auth.user()?.rol)) return true;
  return router.createUrlTree([defaultHomePath(auth.user()?.rol)]);
};

export const usuariosGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (canAccessUsuarios(auth.user()?.rol)) return true;
  return router.createUrlTree([defaultHomePath(auth.user()?.rol)]);
};
