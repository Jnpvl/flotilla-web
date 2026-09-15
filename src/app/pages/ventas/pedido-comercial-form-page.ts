import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AlertService } from '../../services/alert.service';
import { AuthService } from '../../services/auth.service';
import {
  type CatalogItem,
  CatalogoService,
} from '../../services/catalogo.service';
import {
  type PedidoComercialEstatus,
  PedidoComercialService,
} from '../../services/pedido-comercial.service';
import {
  type LineaPedidoComercial,
  buildPedidoDetalle,
  parsePedidoDetalle,
} from '../../utils/pedido-comercial-detalle';
import { todayLocalDay } from '../../utils/local-datetime';

@Component({
  selector: 'app-pedido-comercial-form-page',
  imports: [ReactiveFormsModule, FormsModule, RouterLink],
  templateUrl: './pedido-comercial-form-page.html',
})
export class PedidoComercialFormPage implements OnInit {
  private readonly api = inject(PedidoComercialService);
  private readonly catalogo = inject(CatalogoService);
  private readonly alerts = inject(AlertService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private clienteSearchSeq = 0;
  private productoSearchSeq = 0;

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly editingId = signal<number | null>(null);

  readonly clienteQuery = signal('');
  readonly clienteSuggestions = signal<CatalogItem[]>([]);
  readonly showClienteSuggestions = signal(false);
  readonly selectedCliente = signal<CatalogItem | null>(null);

  readonly productoQuery = signal('');
  readonly productoSuggestions = signal<CatalogItem[]>([]);
  readonly showProductoSuggestions = signal(false);
  readonly lineas = signal<LineaPedidoComercial[]>([]);
  readonly cantidadNueva = signal(1);
  readonly precioNuevo = signal<number | null>(null);
  readonly formEstatus = signal<PedidoComercialEstatus>('capturado');

  readonly isFacturista = computed(() => this.auth.user()?.rol === 'facturista');
  readonly isVendedor = computed(() => this.auth.user()?.rol === 'vendedor');
  readonly canEditSurtido = computed(() => {
    const estatus = this.formEstatus();
    return (
      this.isFacturista() &&
      (estatus === 'prefacturado' || estatus === 'en_facturacion')
    );
  });
  readonly shortfallLines = computed(() =>
    this.lineas().filter(
      (l) => l.cantidadSurtida != null && l.cantidadSurtida !== l.cantidad,
    ),
  );
  readonly pageTitle = computed(() =>
    this.editingId() === null ? 'Nuevo pedido' : `Pedido #${this.editingId()}`,
  );

  readonly estatusOptions = computed((): PedidoComercialEstatus[] => {
    if (this.isVendedor()) {
      // En prefactura el vendedor puede editar líneas pero no cambia el estatus
      if (
        this.formEstatus() === 'prefacturado' ||
        this.formEstatus() === 'en_facturacion'
      ) {
        return ['prefacturado'];
      }
      return ['borrador', 'capturado'];
    }
    if (this.isFacturista()) {
      return ['prefacturado', 'facturado'];
    }
    return ['borrador', 'capturado', 'prefacturado', 'facturado'];
  });

  readonly form = this.fb.nonNullable.group({
    clienteNombre: ['', [Validators.required]],
    fechaPedido: [todayLocalDay(), [Validators.required]],
    estatus: ['capturado' as PedidoComercialEstatus, [Validators.required]],
    notas: [''],
  });

  ngOnInit(): void {
    if (this.isFacturista()) {
      void this.alerts.info(
        'Sin edición',
        'Como facturista trabaja desde el listado: prefactura, surtido y facturar.',
      );
      void this.router.navigateByUrl('/ventas/pedidos');
      return;
    }

    const idParam = this.route.snapshot.paramMap.get('id');
    if (!idParam || idParam === 'nuevo') {
      if (this.isVendedor()) {
        this.form.controls.estatus.setValue('capturado');
        this.formEstatus.set('capturado');
      }
      this.loading.set(false);
      return;
    }

    const id = Number(idParam);
    if (!Number.isInteger(id) || id <= 0) {
      this.loading.set(false);
      void this.alerts.error('Pedido inválido');
      void this.router.navigateByUrl('/ventas/pedidos');
      return;
    }

    this.editingId.set(id);
    this.api.getById(id).subscribe({
      next: (pedido) => {
        if (pedido.estatus === 'facturado') {
          this.loading.set(false);
          void this.alerts.info('Facturado', 'Este pedido ya no se puede editar.');
          void this.router.navigateByUrl('/ventas/pedidos');
          return;
        }
        if (
          this.isVendedor() &&
          pedido.estatus !== 'borrador' &&
          pedido.estatus !== 'capturado' &&
          pedido.estatus !== 'prefacturado' &&
          pedido.estatus !== 'en_facturacion'
        ) {
          this.loading.set(false);
          void this.alerts.info(
            'No editable',
            'Solo puedes editar pedidos en borrador, capturado o prefacturado.',
          );
          void this.router.navigateByUrl('/ventas/pedidos');
          return;
        }
        const parsed = parsePedidoDetalle(pedido.detalle);
        const estatus =
          pedido.estatus === 'en_facturacion' ? 'prefacturado' : pedido.estatus;
        const lineas =
          this.isVendedor() &&
          (estatus === 'prefacturado' || pedido.estatus === 'en_facturacion')
            ? parsed.lineas.map((l) => ({ ...l, cantidadSurtida: null }))
            : parsed.lineas;
        this.form.reset({
          clienteNombre: pedido.clienteNombre,
          fechaPedido: pedido.fechaPedido,
          estatus,
          notas: parsed.notas,
        });
        this.formEstatus.set(estatus);
        this.clienteQuery.set(pedido.clienteNombre);
        this.lineas.set(lineas);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        void this.alerts.error(
          'Error',
          this.errorMessage(err, 'No se pudo cargar el pedido'),
        );
        void this.router.navigateByUrl('/ventas/pedidos');
      },
    });
  }

  onEstatusChange(value: PedidoComercialEstatus): void {
    this.formEstatus.set(value);
  }

  onClienteInput(value: string): void {
    this.clienteQuery.set(value);
    this.selectedCliente.set(null);
    this.form.controls.clienteNombre.setValue(value);
    this.showClienteSuggestions.set(true);
    const seq = ++this.clienteSearchSeq;
    this.catalogo.searchClientes(value).subscribe((items) => {
      if (seq !== this.clienteSearchSeq) return;
      this.clienteSuggestions.set(items);
    });
  }

  selectCliente(cliente: CatalogItem): void {
    this.selectedCliente.set(cliente);
    this.clienteQuery.set(`${cliente.codigo} — ${cliente.nombre}`);
    this.form.controls.clienteNombre.setValue(cliente.nombre);
    this.showClienteSuggestions.set(false);
  }

  onProductoInput(value: string): void {
    this.productoQuery.set(value);
    this.showProductoSuggestions.set(true);
    const seq = ++this.productoSearchSeq;
    this.catalogo.searchProductos(value).subscribe((items) => {
      if (seq !== this.productoSearchSeq) return;
      this.productoSuggestions.set(items);
    });
  }

  addProducto(producto: CatalogItem): void {
    const cantidad = Math.max(1, Math.floor(Number(this.cantidadNueva()) || 1));
    const precioRaw = this.precioNuevo();
    const precio =
      precioRaw != null && Number.isFinite(precioRaw) && precioRaw > 0
        ? Math.round(precioRaw * 100) / 100
        : null;
    if (precio == null) {
      void this.alerts.error(
        'Falta precio',
        'Indica el precio sin IVA del producto.',
      );
      return;
    }
    const existing = this.lineas().find(
      (l) => l.codigo.toLowerCase() === producto.codigo.toLowerCase(),
    );
    if (existing) {
      this.lineas.update((lines) =>
        lines.map((l) =>
          l.codigo.toLowerCase() === producto.codigo.toLowerCase()
            ? {
                ...l,
                cantidad: l.cantidad + cantidad,
                precioSinIva: precio,
              }
            : l,
        ),
      );
    } else {
      this.lineas.update((lines) => [
        ...lines,
        {
          codigo: producto.codigo,
          nombre: producto.nombre,
          cantidad,
          precioSinIva: precio,
          cantidadSurtida: null,
        },
      ]);
    }
    this.productoQuery.set('');
    this.productoSuggestions.set([]);
    this.showProductoSuggestions.set(false);
    this.cantidadNueva.set(1);
    this.precioNuevo.set(null);
  }

  updateCantidad(codigo: string, cantidad: number): void {
    const qty = Math.max(1, Math.floor(Number(cantidad) || 1));
    this.lineas.update((lines) =>
      lines.map((l) => (l.codigo === codigo ? { ...l, cantidad: qty } : l)),
    );
  }

  updatePrecio(codigo: string, value: number | string): void {
    const raw = String(value).trim();
    const precio =
      raw === ''
        ? null
        : Math.max(0, Math.round((Number(raw) || 0) * 100) / 100);
    this.lineas.update((lines) =>
      lines.map((l) =>
        l.codigo === codigo ? { ...l, precioSinIva: precio } : l,
      ),
    );
  }

  updateSurtido(codigo: string, value: number | string): void {
    const raw = String(value).trim();
    if (raw === '') {
      this.lineas.update((lines) =>
        lines.map((l) =>
          l.codigo === codigo ? { ...l, cantidadSurtida: null } : l,
        ),
      );
      return;
    }
    const qty = Math.max(0, Math.floor(Number(raw) || 0));
    this.lineas.update((lines) =>
      lines.map((l) =>
        l.codigo === codigo ? { ...l, cantidadSurtida: qty } : l,
      ),
    );
  }

  removeLinea(codigo: string): void {
    this.lineas.update((lines) => lines.filter((l) => l.codigo !== codigo));
  }

  submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.lineas().length === 0) {
      void this.alerts.error(
        'Sin productos',
        'Agrega al menos un producto al pedido',
      );
      return;
    }
    const sinPrecio = this.lineas().some(
      (l) => l.precioSinIva == null || l.precioSinIva <= 0,
    );
    if (sinPrecio) {
      void this.alerts.error(
        'Falta precio',
        'Todas las líneas deben tener precio sin IVA.',
      );
      return;
    }

    const value = this.form.getRawValue();
    if (this.isVendedor()) {
      const e = value.estatus;
      const ok =
        e === 'borrador' ||
        e === 'capturado' ||
        e === 'prefacturado' ||
        e === 'en_facturacion';
      if (!ok) {
        void this.alerts.error(
          'Estatus no permitido',
          'Como vendedor solo puedes usar borrador, capturado o prefacturado.',
        );
        return;
      }
    }

    const editingId = this.editingId();
    this.saving.set(true);

    // Si el vendedor edita en prefactura, no reenviar surtido
    const lineas =
      this.isVendedor() &&
      (value.estatus === 'prefacturado' || value.estatus === 'en_facturacion')
        ? this.lineas().map((l) => ({ ...l, cantidadSurtida: null }))
        : this.lineas();

    const payload = {
      clienteNombre: value.clienteNombre.trim(),
      detalle: buildPedidoDetalle(lineas, value.notas.trim()),
      fechaPedido: value.fechaPedido,
      estatus: value.estatus,
    };

    if (editingId === null) {
      this.api.create(payload).subscribe({
        next: async () => {
          this.saving.set(false);
          await this.alerts.success('Pedido creado');
          void this.router.navigateByUrl('/ventas/pedidos');
        },
        error: (err: unknown) => {
          this.saving.set(false);
          void this.alerts.error('No se pudo crear', this.errorMessage(err));
        },
      });
      return;
    }

    this.api.update(editingId, payload).subscribe({
      next: async () => {
        this.saving.set(false);
        const enPrefactura =
          payload.estatus === 'prefacturado' ||
          payload.estatus === 'en_facturacion';
        if (this.isVendedor() && enPrefactura) {
          await this.alerts.success(
            'Pedido actualizado',
            'Quedó marcado para que facturación lo revise (al refrescar verán el aviso).',
          );
        } else {
          await this.alerts.success('Pedido actualizado');
        }
        void this.router.navigateByUrl('/ventas/pedidos');
      },
      error: (err: unknown) => {
        this.saving.set(false);
        void this.alerts.error('No se pudo actualizar', this.errorMessage(err));
      },
    });
  }

  avisarWhatsApp(): void {
    const cliente = this.form.controls.clienteNombre.value;
    const diffs = this.lineas().filter(
      (l) => l.cantidadSurtida != null && l.cantidadSurtida !== l.cantidad,
    );

    if (diffs.length === 0) {
      void this.alerts.info(
        'Sin diferencias',
        'Indica en “Surtido” una cantidad distinta a la pedida antes de avisar.',
      );
      return;
    }

    const lines = diffs.map((l) => {
      const surtido = l.cantidadSurtida!;
      if (surtido < l.cantidad) {
        return `• ${l.codigo} ${l.nombre}: se pidieron ${l.cantidad} y solo teníamos ${surtido}`;
      }
      return `• ${l.codigo} ${l.nombre}: se pidieron ${l.cantidad} y tenemos ${surtido} (más de lo solicitado)`;
    });
    const text = [
      `Hola, del cliente ${cliente}, pedido #${this.editingId() ?? ''}.`,
      ``,
      ...lines,
      ``,
      `¿Timbro el pedido o habrá algún cambio?`,
    ].join('\n');

    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener,noreferrer',
    );
  }

  estatusLabel(estatus: PedidoComercialEstatus): string {
    const labels: Record<PedidoComercialEstatus, string> = {
      borrador: 'Borrador',
      capturado: 'Capturado',
      en_facturacion: 'Prefacturado',
      prefacturado: 'Prefacturado',
      facturado: 'Facturado',
    };
    return labels[estatus];
  }

  private errorMessage(err: unknown, fallback = 'Ocurrió un error'): string {
    if (err instanceof HttpErrorResponse) {
      if (typeof err.error?.message === 'string') return err.error.message;
      if (err.status === 0) return 'No hay conexión con el servidor';
    }
    return fallback;
  }
}
