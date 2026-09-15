import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from './api-client';

export type PedidoComercialEstatus =
  | 'borrador'
  | 'capturado'
  | 'en_facturacion'
  | 'prefacturado'
  | 'facturado';

export type PedidoComercial = {
  id: number;
  clienteNombre: string;
  detalle: string | null;
  fechaPedido: string;
  estatus: PedidoComercialEstatus;
  vendedorId: number;
  vendedorNombre: string | null;
  createdAt: string;
  updatedAt: string;
  capturadoAt: string | null;
  prefacturadoAt: string | null;
  facturadoAt: string | null;
  requiereRevision: boolean;
  modificadoEnPrefacturaAt: string | null;
};

export type PedidoComercialListResult = {
  items: PedidoComercial[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type CreatePedidoComercialPayload = {
  clienteNombre: string;
  detalle?: string | null;
  fechaPedido: string;
  estatus?: PedidoComercialEstatus;
  vendedorId?: number;
};

export type UpdatePedidoComercialPayload = {
  clienteNombre?: string;
  detalle?: string | null;
  fechaPedido?: string;
  estatus?: PedidoComercialEstatus;
  /** Confirma revisión de productos del vendedor (si requiereRevision). */
  ackRevision?: boolean;
};

@Injectable({ providedIn: 'root' })
export class PedidoComercialService {
  private readonly api = inject(ApiClient);

  list(params?: {
    page?: number;
    pageSize?: number;
    estatus?: string;
    q?: string;
    vendedorId?: number;
  }): Observable<PedidoComercialListResult> {
    return this.api.get<PedidoComercialListResult>('/pedidos-comerciales', {
      params: {
        ...(params?.page != null ? { page: params.page } : {}),
        ...(params?.pageSize != null ? { pageSize: params.pageSize } : {}),
        ...(params?.estatus ? { estatus: params.estatus } : {}),
        ...(params?.q ? { q: params.q } : {}),
        ...(params?.vendedorId != null ? { vendedorId: params.vendedorId } : {}),
      },
    });
  }

  create(payload: CreatePedidoComercialPayload): Observable<PedidoComercial> {
    return this.api.post<PedidoComercial>('/pedidos-comerciales', payload);
  }

  getById(id: number): Observable<PedidoComercial> {
    return this.api.get<PedidoComercial>(`/pedidos-comerciales/${id}`);
  }

  update(
    id: number,
    payload: UpdatePedidoComercialPayload,
  ): Observable<PedidoComercial> {
    return this.api.put<PedidoComercial>(`/pedidos-comerciales/${id}`, payload);
  }

  remove(id: number): Observable<void> {
    return this.api.delete<void>(`/pedidos-comerciales/${id}`);
  }
}
