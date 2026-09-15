import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from './api-client';

export type VisitaEstatus = 'planeada' | 'visitada' | 'cancelada';
export type VisitaOrigenRegistro = 'mobile' | 'web';

export type Visita = {
  id: number;
  vendedorId: number;
  vendedorNombre: string | null;
  clienteNombre: string;
  fechaPlanificada: string;
  horaPlanificada: string | null;
  notas: string | null;
  estatus: VisitaEstatus;
  visitadaAt: string | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  origenRegistro: VisitaOrigenRegistro | null;
  notasVisita: string | null;
  hizoPedido: boolean | null;
  promociono: boolean | null;
  productosPromocion: string | null;
  motivo: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateVisitaPayload = {
  clienteNombre: string;
  fechaPlanificada: string;
  horaPlanificada?: string | null;
  notas?: string | null;
  vendedorId?: number;
};

export type UpdateVisitaPayload = {
  clienteNombre?: string;
  fechaPlanificada?: string;
  horaPlanificada?: string | null;
  notas?: string | null;
};

export type CheckInVisitaPayload = {
  lat?: number;
  lng?: number;
  accuracy?: number;
  notasVisita?: string | null;
  origen?: VisitaOrigenRegistro;
  hizoPedido: boolean;
  promociono: boolean;
  productosPromocion?: string | null;
  estatus?: 'visitada';
};

export type CancelarVisitaPayload = {
  motivo: string;
  lat?: number;
  lng?: number;
  accuracy?: number;
  origen?: VisitaOrigenRegistro;
};

@Injectable({ providedIn: 'root' })
export class VisitaService {
  private readonly api = inject(ApiClient);

  list(params?: {
    fecha?: string;
    desde?: string;
    hasta?: string;
    vendedorId?: number;
    estatus?: string;
  }): Observable<Visita[]> {
    return this.api.get<Visita[]>('/visitas', {
      params: {
        ...(params?.fecha ? { fecha: params.fecha } : {}),
        ...(params?.desde ? { desde: params.desde } : {}),
        ...(params?.hasta ? { hasta: params.hasta } : {}),
        ...(params?.vendedorId != null ? { vendedorId: params.vendedorId } : {}),
        ...(params?.estatus ? { estatus: params.estatus } : {}),
      },
    });
  }

  hoy(fecha?: string): Observable<Visita[]> {
    return this.api.get<Visita[]>('/visitas/hoy', {
      params: fecha ? { fecha } : undefined,
    });
  }

  create(payload: CreateVisitaPayload): Observable<Visita> {
    return this.api.post<Visita>('/visitas', payload);
  }

  update(id: number, payload: UpdateVisitaPayload): Observable<Visita> {
    return this.api.put<Visita>(`/visitas/${id}`, payload);
  }

  checkIn(id: number, payload: CheckInVisitaPayload): Observable<Visita> {
    return this.api.post<Visita>(`/visitas/${id}/check-in`, payload);
  }

  cancelar(id: number, payload: CancelarVisitaPayload): Observable<Visita> {
    return this.api.post<Visita>(`/visitas/${id}/cancelar`, payload);
  }

  eliminar(id: number, motivo: string): Observable<void> {
    return this.api.post<void>(`/visitas/${id}/eliminar`, { motivo });
  }
}
