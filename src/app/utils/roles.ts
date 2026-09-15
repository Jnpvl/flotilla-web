export type AppRol =
  | 'admin'
  | 'auxiliar'
  | 'chofer'
  | 'vendedor'
  | 'facturista';

export function canAccessFlotilla(rol: string | undefined | null): boolean {
  return rol === 'admin' || rol === 'auxiliar';
}

export function canAccessVentas(rol: string | undefined | null): boolean {
  return rol === 'admin' || rol === 'vendedor' || rol === 'facturista';
}

/** Calendario de visitas: admin y vendedor (no facturista). */
export function canAccessVisitas(rol: string | undefined | null): boolean {
  return rol === 'admin' || rol === 'vendedor';
}

export function canAccessUsuarios(rol: string | undefined | null): boolean {
  return rol === 'admin';
}

/** Dashboard de inicio: solo admin. */
export function canAccessInicio(rol: string | undefined | null): boolean {
  return rol === 'admin';
}

export function defaultHomePath(rol: string | undefined | null): string {
  if (canAccessInicio(rol)) return '/';
  if (rol === 'auxiliar') return '/pedidos';
  if (rol === 'facturista') return '/ventas/pedidos';
  if (rol === 'vendedor') return '/ventas/visitas';
  return '/login';
}
