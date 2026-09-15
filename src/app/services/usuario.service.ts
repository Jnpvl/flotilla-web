import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from './api-client';

export type RolUsuario = 'admin' | 'auxiliar' | 'chofer' | 'vendedor' | 'facturista';

export type Usuario = {
  id: number;
  nombre: string;
  username: string;
  rol: RolUsuario;
  agenteContpaqId: number | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateUsuarioPayload = {
  nombre: string;
  username: string;
  password: string;
  rol: RolUsuario;
  agenteContpaqId?: number | null;
};

export type UpdateUsuarioPayload = {
  nombre?: string;
  username?: string;
  password?: string;
  rol?: RolUsuario;
  agenteContpaqId?: number | null;
};

@Injectable({ providedIn: 'root' })
export class UsuarioService {
  private readonly api = inject(ApiClient);

  list(): Observable<Usuario[]> {
    return this.api.get<Usuario[]>('/usuarios');
  }

  getById(id: number): Observable<Usuario> {
    return this.api.get<Usuario>(`/usuarios/${id}`);
  }

  create(payload: CreateUsuarioPayload): Observable<Usuario> {
    return this.api.post<Usuario>('/usuarios', payload);
  }

  update(id: number, payload: UpdateUsuarioPayload): Observable<Usuario> {
    return this.api.put<Usuario>(`/usuarios/${id}`, payload);
  }

  remove(id: number): Observable<void> {
    return this.api.delete<void>(`/usuarios/${id}`);
  }
}
