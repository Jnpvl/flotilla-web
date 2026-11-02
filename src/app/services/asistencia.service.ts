import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from './api-client';

export type AsistenciaOrigen = 'mobile' | 'web';

export type AsistenciaChecadaTipo =
  | 'entrada'
  | 'comida_inicio'
  | 'comida_fin'
  | 'salida';

export type AsistenciaEstatus =
  | 'a_tiempo'
  | 'retardo'
  | 'sin_salida'
  | 'salida_temprana';

export type Asistencia = {
  id: number;
  usuarioId: number;
  usuarioNombre: string | null;
  usuarioRol: string | null;
  fecha: string;
  entradaAt: string | null;
  entradaLat: number | null;
  entradaLng: number | null;
  entradaAccuracy: number | null;
  origenEntrada: AsistenciaOrigen | null;
  comidaInicioAt: string | null;
  comidaInicioLat: number | null;
  comidaInicioLng: number | null;
  comidaInicioAccuracy: number | null;
  origenComidaInicio: AsistenciaOrigen | null;
  comidaFinAt: string | null;
  comidaFinLat: number | null;
  comidaFinLng: number | null;
  comidaFinAccuracy: number | null;
  origenComidaFin: AsistenciaOrigen | null;
  salidaAt: string | null;
  salidaLat: number | null;
  salidaLng: number | null;
  salidaAccuracy: number | null;
  origenSalida: AsistenciaOrigen | null;
  estatus: AsistenciaEstatus | null;
  createdAt: string;
  updatedAt: string;
};

export type AsistenciaHoy = {
  fecha: string;
  asistencia: Asistencia | null;
  reglas: AsistenciaConfig;
  opciones: AsistenciaChecadaTipo[];
  siguiente: AsistenciaChecadaTipo | null;
  diaNoLaboral: boolean;
  puedeEntrada: boolean;
  puedeSalida: boolean;
};

export type AsistenciaConfig = {
  entradaEsperada: string;
  toleranciaRetardoMin: number;
  salidaEsperada: string;
  diasLaborales: number[];
  exigeComida: boolean;
  comidaInicioEsperada: string | null;
  comidaFinEsperada: string | null;
  checadas: AsistenciaChecadaTipo[];
};

export type AsistenciaFestivo = {
  id: number;
  fecha: string;
  nombre: string | null;
  createdAt: string;
};

@Injectable({ providedIn: 'root' })
export class AsistenciaService {
  private readonly api = inject(ApiClient);

  hoy(): Observable<AsistenciaHoy> {
    return this.api.get<AsistenciaHoy>('/asistencias/hoy');
  }

  list(params?: {
    fecha?: string;
    desde?: string;
    hasta?: string;
    usuarioId?: number;
  }): Observable<Asistencia[]> {
    return this.api.get<Asistencia[]>('/asistencias', {
      params: {
        ...(params?.fecha ? { fecha: params.fecha } : {}),
        ...(params?.desde ? { desde: params.desde } : {}),
        ...(params?.hasta ? { hasta: params.hasta } : {}),
        ...(params?.usuarioId != null ? { usuarioId: params.usuarioId } : {}),
      },
    });
  }

  getConfig(): Observable<AsistenciaConfig> {
    return this.api.get<AsistenciaConfig>('/asistencias/config');
  }

  updateConfig(payload: Partial<AsistenciaConfig>): Observable<AsistenciaConfig> {
    return this.api.put<AsistenciaConfig>('/asistencias/config', payload);
  }

  listFestivos(params?: {
    desde?: string;
    hasta?: string;
  }): Observable<AsistenciaFestivo[]> {
    return this.api.get<AsistenciaFestivo[]>('/asistencias/festivos', {
      params: {
        ...(params?.desde ? { desde: params.desde } : {}),
        ...(params?.hasta ? { hasta: params.hasta } : {}),
      },
    });
  }

  createFestivo(payload: {
    fecha: string;
    nombre?: string | null;
  }): Observable<AsistenciaFestivo> {
    return this.api.post<AsistenciaFestivo>('/asistencias/festivos', payload);
  }

  removeFestivo(id: number): Observable<void> {
    return this.api.delete<void>(`/asistencias/festivos/${id}`);
  }
}
