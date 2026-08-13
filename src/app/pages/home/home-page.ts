import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AlertService } from '../../services/alert.service';
import { AuthService } from '../../services/auth.service';
import { type DashboardStats, RutaService } from '../../services/ruta.service';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink],
  templateUrl: './home-page.html',
})
export class HomePage implements OnInit {
  readonly auth = inject(AuthService);
  private readonly rutasApi = inject(RutaService);
  private readonly alerts = inject(AlertService);

  readonly loading = signal(true);
  readonly stats = signal<DashboardStats | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.rutasApi.dashboard().subscribe({
      next: (data) => {
        this.stats.set(data);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        void this.alerts.error(
          'Error',
          err instanceof HttpErrorResponse && typeof err.error?.message === 'string'
            ? err.error.message
            : 'No se pudo cargar el dashboard',
        );
      },
    });
  }

  formatMinutos(value: number | null): string {
    if (value === null) return '—';
    const h = Math.floor(value / 60);
    const m = value % 60;
    if (h <= 0) return `${m} min`;
    return `${h} h ${m} min`;
  }
}
