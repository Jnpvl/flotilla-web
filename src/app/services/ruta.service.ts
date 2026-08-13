import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from './api-client';
import type { PedidoEstatus } from './pedido.service';

export type RutaEstatus = 'creada' | 'en_ruta' | 'ruta_finalizada';

export type RutaPedidoItem = {
  id: number;
  pedidoId: number;
  lugarEntrega: string;
  estatus: PedidoEstatus;
  ordenEntrega: number;
};

export type RutaGpsPoint = {
  id: number;
  lat: number;
  lng: number;
  recordedAt: string;
  speed: number | null;
  tipo: 'tracking' | 'inicio_ruta' | 'pedido_entregado' | 'regreso_almacen' | string;
  pedidoId: number | null;
  label: string | null;
};

export type Ruta = {
  id: number;
  choferId: number;
  choferNombre: string | null;
  almacenId: number;
  almacenNombre: string | null;
  estatus: RutaEstatus;
  kmRecorridos: number;
  pedidos: RutaPedidoItem[];
  iniciadaAt: string | null;
  finalizadaAt: string | null;
  createdAt: string;
  updatedAt: string;
  duracionMinutos: number | null;
  gps?: RutaGpsPoint[];
};

export type RutaListResult = {
  items: Ruta[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type RutaListParams = {
  page?: number;
  pageSize?: number;
  /** Día `YYYY-MM-DD` */
  fecha?: string;
};

export type DashboardStats = {
  rutasTotales: number;
  rutasHoy: number;
  rutasActivas: number;
  kmTotales: number;
  kmHoy: number;
  promedioMinutosRuta: number | null;
  pedidosPendientes: number;
  pedidosEnRuta: number;
  pedidosEntregadosHoy: number;
  choferesActivosHoy: number;
};

@Injectable({ providedIn: 'root' })
export class RutaService {
  private readonly api = inject(ApiClient);

  list(params: RutaListParams = {}): Observable<RutaListResult> {
    const query: Record<string, string | number | boolean> = {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 10,
    };
    if (params.fecha?.trim()) query['fecha'] = params.fecha.trim();

    return this.api.get<RutaListResult>('/rutas', { params: query });
  }

  getById(id: number): Observable<Ruta> {
    return this.api.get<Ruta>(`/rutas/${id}`);
  }

  dashboard(): Observable<DashboardStats> {
    return this.api.get<DashboardStats>('/rutas/dashboard');
  }

  iniciar(payload: { choferId: number; pedidoIds: number[] }): Observable<Ruta> {
    return this.api.post<Ruta>('/rutas/iniciar', payload);
  }

  finalizar(id: number, payload: { kmRecorridos?: number } = {}): Observable<Ruta> {
    return this.api.post<Ruta>(`/rutas/${id}/finalizar`, payload);
  }
}
