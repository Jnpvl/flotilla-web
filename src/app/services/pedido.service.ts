import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from './api-client';

export type PedidoEstatus =
  | 'listo_para_entregar'
  | 'cargado'
  | 'en_ruta'
  | 'entregado';

export type Pedido = {
  id: number;
  lugarEntrega: string;
  estatus: PedidoEstatus;
  creadoPorId: number;
  creadoPorNombre: string | null;
  rutaId: number | null;
  createdAt: string;
  updatedAt: string;
};

export type PedidoListResult = {
  items: Pedido[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type PedidoListParams = {
  page?: number;
  pageSize?: number;
  estatus?: PedidoEstatus | '';
  q?: string;
};

export type CreatePedidoPayload = {
  lugarEntrega: string;
};

export type UpdatePedidoPayload = {
  lugarEntrega?: string;
  estatus?: PedidoEstatus;
};

@Injectable({ providedIn: 'root' })
export class PedidoService {
  private readonly api = inject(ApiClient);

  list(params: PedidoListParams = {}): Observable<PedidoListResult> {
    const query: Record<string, string | number | boolean> = {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 10,
    };
    if (params.estatus) query['estatus'] = params.estatus;
    if (params.q?.trim()) query['q'] = params.q.trim();

    return this.api.get<PedidoListResult>('/pedidos', { params: query });
  }

  create(payload: CreatePedidoPayload): Observable<Pedido> {
    return this.api.post<Pedido>('/pedidos', payload);
  }

  update(id: number, payload: UpdatePedidoPayload): Observable<Pedido> {
    return this.api.put<Pedido>(`/pedidos/${id}`, payload);
  }

  remove(id: number): Observable<void> {
    return this.api.delete<void>(`/pedidos/${id}`);
  }
}
