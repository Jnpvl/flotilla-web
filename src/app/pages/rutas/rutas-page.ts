import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AlertService } from '../../services/alert.service';
import { type Pedido, PedidoService } from '../../services/pedido.service';
import { type Usuario, UsuarioService } from '../../services/usuario.service';
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
  private readonly pedidosApi = inject(PedidoService);
  private readonly usuariosApi = inject(UsuarioService);
  private readonly alerts = inject(AlertService);
  private readonly router = inject(Router);

  readonly rutas = signal<Ruta[]>([]);
  readonly loading = signal(true);
  readonly showIniciar = signal(false);
  readonly saving = signal(false);

  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly total = signal(0);
  readonly totalPages = signal(1);
  readonly filterFecha = signal('');

  readonly choferes = signal<Usuario[]>([]);
  readonly pedidosDisponibles = signal<Pedido[]>([]);
  readonly selectedChoferId = signal<number | null>(null);
  readonly selectedPedidoIds = signal<number[]>([]);

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

  openIniciar(): void {
    this.selectedChoferId.set(null);
    this.selectedPedidoIds.set([]);
    this.showIniciar.set(true);
    this.saving.set(false);

    this.usuariosApi.list().subscribe({
      next: (users) => this.choferes.set(users.filter((u) => u.rol === 'chofer')),
      error: (err: unknown) =>
        void this.alerts.error('Error', this.errorMessage(err, 'No se pudieron cargar choferes')),
    });

    this.pedidosApi.list({ page: 1, pageSize: 100 }).subscribe({
      next: (result) =>
        this.pedidosDisponibles.set(
          result.items.filter(
            (p) => p.estatus === 'listo_para_entregar' || p.estatus === 'cargado',
          ),
        ),
      error: (err: unknown) =>
        void this.alerts.error('Error', this.errorMessage(err, 'No se pudieron cargar pedidos')),
    });
  }

  closeIniciar(): void {
    this.showIniciar.set(false);
  }

  onChoferChange(value: number | string | null): void {
    if (value === null || value === '') {
      this.selectedChoferId.set(null);
      return;
    }
    this.selectedChoferId.set(Number(value));
  }

  togglePedido(id: number, checked: boolean): void {
    const current = this.selectedPedidoIds();
    if (checked) {
      this.selectedPedidoIds.set([...current, id]);
    } else {
      this.selectedPedidoIds.set(current.filter((x) => x !== id));
    }
  }

  isPedidoSelected(id: number): boolean {
    return this.selectedPedidoIds().includes(id);
  }

  iniciarRuta(): void {
    const choferId = this.selectedChoferId();
    const pedidoIds = this.selectedPedidoIds();

    if (!choferId) {
      void this.alerts.error('Falta chofer', 'Selecciona un chofer para iniciar la ruta');
      return;
    }
    if (pedidoIds.length === 0) {
      void this.alerts.error('Faltan pedidos', 'Selecciona al menos un pedido listo para entregar');
      return;
    }

    this.saving.set(true);
    this.rutasApi.iniciar({ choferId, pedidoIds }).subscribe({
      next: async (ruta) => {
        this.saving.set(false);
        this.closeIniciar();
        await this.alerts.success('Ruta iniciada', 'Los pedidos pasaron a estatus en ruta');
        void this.router.navigate(['/rutas', ruta.id]);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        void this.alerts.error('No se pudo iniciar', this.errorMessage(err));
      },
    });
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
