import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AlertService } from '../../services/alert.service';
import { AuthService } from '../../services/auth.service';
import {
  type FacturaDocumento,
  CatalogoService,
} from '../../services/catalogo.service';
import {
  type Pedido,
  type PedidoEstatus,
  PedidoService,
} from '../../services/pedido.service';
import { formatWallClock, formatWallClockDay } from '../../utils/local-datetime';

@Component({
  selector: 'app-pedidos-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './pedidos-page.html',
})
export class PedidosPage implements OnInit {
  private readonly pedidosApi = inject(PedidoService);
  private readonly catalogo = inject(CatalogoService);
  private readonly auth = inject(AuthService);
  private readonly alerts = inject(AlertService);

  readonly pedidos = signal<Pedido[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly showForm = signal(false);

  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly total = signal(0);
  readonly totalPages = signal(1);
  readonly filterEstatus = signal<PedidoEstatus | ''>('');
  readonly searchQ = signal('');
  readonly expandedIds = signal<Set<number>>(new Set());
  readonly firmas = signal<Record<number, string | null>>({});

  readonly facturaFolioInput = signal('');
  readonly lookingUpFactura = signal(false);
  readonly facturaOptions = signal<FacturaDocumento[]>([]);
  readonly selectedFactura = signal<FacturaDocumento | null>(null);
  readonly lookupError = signal('');

  readonly isAdmin = computed(() => this.auth.user()?.rol === 'admin');

  readonly estatusOptions: PedidoEstatus[] = [
    'listo_para_entregar',
    'cargado',
    'en_ruta',
    'entregado',
  ];

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.pedidosApi
      .list({
        page: this.page(),
        pageSize: this.pageSize(),
        estatus: this.filterEstatus(),
        q: this.searchQ(),
      })
      .subscribe({
        next: (data) => {
          this.pedidos.set(data.items);
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
            this.errorMessage(err, 'No se pudieron cargar los pedidos'),
          );
        },
      });
  }

  onSearchInput(value: string): void {
    this.searchQ.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page.set(1);
      this.load();
    }, 350);
  }

  onFilterEstatus(value: PedidoEstatus | ''): void {
    this.filterEstatus.set(value);
    this.page.set(1);
    this.load();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.page()) return;
    this.page.set(page);
    this.load();
  }

  toggleExpand(pedido: Pedido): void {
    const id = pedido.id;
    const opening = !this.expandedIds().has(id);
    this.expandedIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (opening && pedido.tieneFirma && this.firmas()[id] === undefined) {
      this.pedidosApi.getById(id).subscribe({
        next: (full) => {
          this.firmas.update((map) => ({ ...map, [id]: full.firma }));
        },
        error: () => {
          this.firmas.update((map) => ({ ...map, [id]: null }));
        },
      });
    }
  }

  firmaSrc(id: number): string | null {
    const raw = this.firmas()[id];
    if (!raw) return null;
    return raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`;
  }

  isExpanded(id: number): boolean {
    return this.expandedIds().has(id);
  }

  openCreate(): void {
    this.resetFacturaLookup();
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.resetFacturaLookup();
  }

  buscarFactura(): void {
    const folio = Number(this.facturaFolioInput().trim());
    if (!Number.isInteger(folio) || folio <= 0) {
      this.lookupError.set('Escribe un número de factura válido');
      this.facturaOptions.set([]);
      this.selectedFactura.set(null);
      return;
    }

    this.lookingUpFactura.set(true);
    this.lookupError.set('');
    this.facturaOptions.set([]);
    this.selectedFactura.set(null);
    this.catalogo.lookupFactura(folio).subscribe({
      next: (items) => {
        this.lookingUpFactura.set(false);
        this.facturaOptions.set(items);
        this.selectedFactura.set(items.length === 1 ? items[0] : null);
      },
      error: (err: unknown) => {
        this.lookingUpFactura.set(false);
        this.lookupError.set(this.errorMessage(err, 'No se encontró la factura'));
      },
    });
  }

  selectFactura(factura: FacturaDocumento): void {
    this.selectedFactura.set(factura);
    this.lookupError.set('');
  }

  submit(): void {
    if (this.saving()) return;

    const factura = this.selectedFactura();
    if (!factura) {
      this.lookupError.set('Busca una factura para crear el pedido');
      return;
    }

    this.saving.set(true);
    this.pedidosApi.create({ idDocumento: factura.idDocumento }).subscribe({
      next: async () => {
        this.saving.set(false);
        this.closeForm();
        await this.alerts.success(
          'Pedido creado',
          'Quedó como listo para entregar',
        );
        this.page.set(1);
        this.load();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        void this.alerts.error('No se pudo crear', this.errorMessage(err));
      },
    });
  }

  async askRemove(pedido: Pedido): Promise<void> {
    if (!this.canRemove(pedido)) {
      void this.alerts.error(
        'No permitido',
        'Solo se pueden eliminar pedidos en listo para entregar',
      );
      return;
    }
    const confirmed = await this.alerts.confirm(
      '¿Eliminar pedido?',
      `Se eliminará el pedido a “${pedido.lugarEntrega}”. Esta acción no se puede deshacer.`,
    );
    if (!confirmed) return;

    this.pedidosApi.remove(pedido.id).subscribe({
      next: async () => {
        await this.alerts.success('Pedido eliminado');
        this.load();
      },
      error: (err: unknown) => {
        void this.alerts.error('No se pudo eliminar', this.errorMessage(err));
      },
    });
  }

  isEntregado(pedido: Pedido): boolean {
    return pedido.estatus === 'entregado';
  }

  isListoParaEntregar(pedido: Pedido): boolean {
    return pedido.estatus === 'listo_para_entregar';
  }

  canRemove(pedido: Pedido): boolean {
    return this.isListoParaEntregar(pedido);
  }

  canChangeEstatus(pedido: Pedido): boolean {
    return this.isAdmin() && !this.isEntregado(pedido);
  }

  async changeEstatus(pedido: Pedido, estatus: PedidoEstatus): Promise<void> {
    if (!this.isAdmin()) {
      void this.alerts.error(
        'No permitido',
        'Solo el administrador puede cambiar el estatus desde el panel',
      );
      this.load();
      return;
    }
    if (pedido.estatus === estatus) return;
    if (this.isEntregado(pedido)) {
      void this.alerts.error(
        'No permitido',
        'Un pedido entregado no puede cambiar de estatus',
      );
      this.load();
      return;
    }

    const confirmed = await this.alerts.confirm(
      '¿Cambiar estatus?',
      `El pedido “${pedido.lugarEntrega}” pasará a “${this.estatusLabel(estatus)}”.`,
    );
    if (!confirmed) {
      this.load();
      return;
    }

    this.pedidosApi.update(pedido.id, { estatus }).subscribe({
      next: async () => {
        await this.alerts.success('Estatus actualizado');
        this.load();
      },
      error: (err: unknown) => {
        void this.alerts.error('No se pudo actualizar', this.errorMessage(err));
        this.load();
      },
    });
  }

  estatusLabel(estatus: PedidoEstatus): string {
    const labels: Record<PedidoEstatus, string> = {
      listo_para_entregar: 'Listo para entregar',
      cargado: 'Cargado',
      en_ruta: 'En ruta',
      entregado: 'Entregado',
    };
    return labels[estatus];
  }

  estatusClass(estatus: PedidoEstatus): string {
    const classes: Record<PedidoEstatus, string> = {
      listo_para_entregar: 'bg-brand-50 text-brand-700',
      cargado: 'bg-violet-50 text-violet-700',
      en_ruta: 'bg-amber-50 text-amber-700',
      entregado: 'bg-green-50 text-green-700',
    };
    return classes[estatus];
  }

  formatDate(value: string): string {
    return formatWallClock(value);
  }

  formatDay(value: string | null | undefined): string {
    return formatWallClockDay(value);
  }

  formatMoney(value: number | null | undefined): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(value ?? 0);
  }

  formatQty(value: number): string {
    return new Intl.NumberFormat('es-MX', {
      maximumFractionDigits: 4,
    }).format(value);
  }

  facturaLabel(pedido: Pedido): string {
    const serie = pedido.facturaSerie?.trim();
    const folio = pedido.facturaFolio;
    if (!folio) return '';
    return serie ? `${serie}-${folio}` : String(folio);
  }

  private resetFacturaLookup(): void {
    this.facturaFolioInput.set('');
    this.lookingUpFactura.set(false);
    this.facturaOptions.set([]);
    this.selectedFactura.set(null);
    this.lookupError.set('');
  }

  private errorMessage(err: unknown, fallback = 'Ocurrió un error'): string {
    if (err instanceof HttpErrorResponse) {
      if (typeof err.error?.message === 'string') return err.error.message;
      if (err.status === 0) return 'No hay conexión con el servidor';
      if (err.status === 401) return 'Sesión expirada. Vuelve a iniciar sesión';
      if (err.status === 403) return err.error?.message ?? 'No tienes permiso para esta acción';
    }
    return fallback;
  }
}
