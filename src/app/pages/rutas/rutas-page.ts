import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AlertService } from '../../services/alert.service';
import {
  type Ruta,
  type RutaEstatus,
  RutaService,
} from '../../services/ruta.service';
import { formatRutaTitle, todayLocalDay } from '../../utils/local-datetime';

@Component({
  selector: 'app-rutas-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './rutas-page.html',
})
export class RutasPage implements OnInit {
  private readonly rutasApi = inject(RutaService);
  private readonly alerts = inject(AlertService);

  readonly rutas = signal<Ruta[]>([]);
  readonly loading = signal(true);

  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly total = signal(0);
  readonly totalPages = signal(1);
  readonly filterFecha = signal('');

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.rutasApi
      .list({
        page: this.page(),
        pageSize: this.pageSize(),
        fecha: this.filterFecha(),
      })
      .subscribe({
        next: (data) => {
          this.rutas.set(data.items);
          this.total.set(data.total);
          this.page.set(data.page);
          this.pageSize.set(data.pageSize);
          this.totalPages.set(data.totalPages);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.loading.set(false);
          void this.alerts.error(
            'Error',
            this.errorMessage(err, 'No se pudieron cargar las rutas'),
          );
        },
      });
  }

  onFilterFecha(value: string): void {
    this.filterFecha.set(value);
    this.page.set(1);
    this.load();
  }

  clearFecha(): void {
    this.filterFecha.set('');
    this.page.set(1);
    this.load();
  }

  goToToday(): void {
    this.filterFecha.set(todayLocalDay());
    this.page.set(1);
    this.load();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.page()) return;
    this.page.set(page);
    this.load();
  }

  rutaTitle(ruta: Ruta): string {
    return formatRutaTitle(ruta.iniciadaAt, ruta.createdAt);
  }

  estatusLabel(estatus: RutaEstatus): string {
    const labels: Record<RutaEstatus, string> = {
      creada: 'Creada',
      en_ruta: 'En ruta',
      ruta_finalizada: 'Finalizada',
    };
    return labels[estatus];
  }

  estatusClass(estatus: RutaEstatus): string {
    const classes: Record<RutaEstatus, string> = {
      creada: 'bg-gray-100 text-gray-700',
      en_ruta: 'bg-amber-50 text-amber-700',
      ruta_finalizada: 'bg-green-50 text-green-700',
    };
    return classes[estatus];
  }

  private errorMessage(err: unknown, fallback = 'Ocurrió un error'): string {
    if (err instanceof HttpErrorResponse) {
      if (typeof err.error?.message === 'string') return err.error.message;
      if (err.status === 0) return 'No hay conexión con el servidor';
      if (err.status === 401) return 'Sesión expirada. Vuelve a iniciar sesión';
    }
    return fallback;
  }
}
