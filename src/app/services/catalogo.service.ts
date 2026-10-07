import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ApiClient } from './api-client';

export type CatalogItem = {
  codigo: string;
  nombre: string;
};

export type CatalogAgente = {
  id: number;
  codigo: string;
  nombre: string;
};

export type FacturaPartida = {
  codigoProducto: string;
  producto: string;
  cantidad: number;
  precioUnitario: number;
  totalPartida: number;
  entregado?: boolean;
};

export type FacturaDocumento = {
  idDocumento: number;
  factura: number;
  serie: string;
  fechaDocumento: string | null;
  totalFactura: number;
  uuid: string;
  fechaTimbrado: string | null;
  horaTimbrado: string | null;
  estadoTimbrado: number | null;
  idCliente: number | null;
  codigoCliente: string;
  cliente: string;
  rfc: string;
  partidas: FacturaPartida[];
};

type CatalogListResponse<T> = {
  items: T[];
};

@Injectable({ providedIn: 'root' })
export class CatalogoService {
  private readonly api = inject(ApiClient);

  searchClientes(
    q: string,
    limit = 8,
    agenteId?: number,
  ): Observable<CatalogItem[]> {
    const params: Record<string, string | number> = { q, limit };
    if (agenteId != null && agenteId > 0) {
      params['agenteId'] = agenteId;
    }
    return this.api
      .get<CatalogListResponse<CatalogItem>>('/catalogos/clientes', { params })
      .pipe(
        map((res) => res.items ?? []),
        catchError(() => of([])),
      );
  }

  searchProductos(q: string, limit = 8): Observable<CatalogItem[]> {
    return this.api
      .get<CatalogListResponse<CatalogItem>>('/catalogos/productos', {
        params: { q, limit },
      })
      .pipe(
        map((res) => res.items ?? []),
        catchError(() => of([])),
      );
  }

  listAgentes(): Observable<CatalogAgente[]> {
    return this.api
      .get<CatalogListResponse<CatalogAgente>>('/catalogos/agentes')
      .pipe(
        map((res) => res.items ?? []),
        catchError(() => of([])),
      );
  }

  lookupFactura(folio: number): Observable<FacturaDocumento[]> {
    return this.api
      .get<CatalogListResponse<FacturaDocumento>>('/catalogos/facturas', {
        params: { folio },
      })
      .pipe(map((res) => res.items ?? []));
  }
}
