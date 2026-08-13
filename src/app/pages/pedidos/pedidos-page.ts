import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AlertService } from '../../services/alert.service';
import {
  type Pedido,
  type PedidoEstatus,
  PedidoService,
} from '../../services/pedido.service';
import { formatWallClock } from '../../utils/local-datetime';

@Component({
  selector: 'app-pedidos-page',
  imports: [ReactiveFormsModule, FormsModule, RouterLink],
  templateUrl: './pedidos-page.html',
})
export class PedidosPage implements OnInit {
  private readonly pedidosApi = inject(PedidoService);
  private readonly alerts = inject(AlertService);
  private readonly fb = inject(FormBuilder);

  readonly pedidos = signal<Pedido[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly showForm = signal(false);
  readonly editingId = signal<number | null>(null);

  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly total = signal(0);
  readonly totalPages = signal(1);
  readonly filterEstatus = signal<PedidoEstatus | ''>('');
  readonly searchQ = signal('');

  readonly form = this.fb.nonNullable.group({
    lugarEntrega: ['', [Validators.required]],
  });

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

  openCreate(): void {
    this.editingId.set(null);
    this.form.reset({ lugarEntrega: '' });
    this.showForm.set(true);
  }

  openEdit(pedido: Pedido): void {
    if (this.isEntregado(pedido)) {
      void this.alerts.error('No permitido', 'Un pedido entregado no se puede editar');
      return;
    }
    this.editingId.set(pedido.id);
    this.form.reset({ lugarEntrega: pedido.lugarEntrega });
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
  }

  submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    const { lugarEntrega } = this.form.getRawValue();
    const editingId = this.editingId();
    this.saving.set(true);

    if (editingId === null) {
      this.pedidosApi.create({ lugarEntrega: lugarEntrega.trim() }).subscribe({
        next: async () => {
          this.saving.set(false);
          this.closeForm();
          await this.alerts.success('Pedido creado', 'El lugar de entrega se registró correctamente');
          this.page.set(1);
          this.load();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          void this.alerts.error('No se pudo crear', this.errorMessage(err));
        },
      });
      return;
    }

    this.pedidosApi.update(editingId, { lugarEntrega: lugarEntrega.trim() }).subscribe({
      next: async () => {
        this.saving.set(false);
        this.closeForm();
        await this.alerts.success('Pedido actualizado', 'Los cambios se guardaron correctamente');
        this.load();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        void this.alerts.error('No se pudo actualizar', this.errorMessage(err));
      },
    });
  }

  async askRemove(pedido: Pedido): Promise<void> {
    if (this.isEntregado(pedido)) {
      void this.alerts.error('No permitido', 'Un pedido entregado no se puede eliminar');
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

  async changeEstatus(pedido: Pedido, estatus: PedidoEstatus): Promise<void> {
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
      listo_para_entregar: 'bg-blue-50 text-blue-700',
      cargado: 'bg-violet-50 text-violet-700',
      en_ruta: 'bg-amber-50 text-amber-700',
      entregado: 'bg-green-50 text-green-700',
    };
    return classes[estatus];
  }

  formatDate(value: string): string {
    return formatWallClock(value);
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
