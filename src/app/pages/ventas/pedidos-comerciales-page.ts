import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AlertService } from '../../services/alert.service';
import { AuthService } from '../../services/auth.service';
import {
  type PedidoComercial,
  type PedidoComercialEstatus,
  PedidoComercialService,
} from '../../services/pedido-comercial.service';
import {
  type LineaPedidoComercial,
  type LineaPedidoDiff,
  buildPedidoDetalle,
  diffLineasPedido,
  mergeSurtidoOntoLineas,
  parsePedidoDetalle,
  productFingerprint,
} from '../../utils/pedido-comercial-detalle';
import { formatWallClock } from '../../utils/local-datetime';

@Component({
  selector: 'app-pedidos-comerciales-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './pedidos-comerciales-page.html',
})
export class PedidosComercialesPage implements OnInit {
  private readonly api = inject(PedidoComercialService);
  private readonly alerts = inject(AlertService);
  private readonly auth = inject(AuthService);

  readonly pedidos = signal<PedidoComercial[]>([]);
  readonly loading = signal(true);
  readonly page = signal(1);
  readonly pageSize = signal(20);
  readonly total = signal(0);
  readonly totalPages = signal(1);
  readonly filterEstatus = signal<PedidoComercialEstatus | ''>('');
  readonly searchQ = signal('');
  readonly expandedIds = signal<Set<number>>(new Set());
  /** Borrador de surtido por pedido (solo facturista en el listado). */
  readonly surtidoDrafts = signal<Map<number, LineaPedidoComercial[]>>(new Map());
  /**
   * Listado de productos conocido antes del cambio del vendedor.
   * Sirve para resaltar altas/bajas/cambios de cant/precio.
   */
  readonly listadoBaselineById = signal(
    new Map<number, LineaPedidoComercial[]>(),
  );
  /**
   * Fingerprint del listado que ya se mostró al facturista tras un cambio.
   * El OK de la alerta solo deja ver productos; no guarda ni factura.
   */
  private readonly listadoVistoFp = signal(new Map<number, string>());
  readonly savingSurtidoId = signal<number | null>(null);

  readonly isAdmin = computed(() => this.auth.user()?.rol === 'admin');
  readonly isFacturista = computed(() => this.auth.user()?.rol === 'facturista');
  /** Mismas operaciones de facturación: surtido, WhatsApp y marcar facturado. */
  readonly canFacturarOps = computed(
    () => this.isFacturista() || this.isAdmin(),
  );
  readonly isVendedor = computed(() => this.auth.user()?.rol === 'vendedor');
  readonly canCreate = computed(() => {
    const rol = this.auth.user()?.rol;
    return rol === 'admin' || rol === 'vendedor';
  });

  readonly estatusOptions = computed((): PedidoComercialEstatus[] => {
    if (this.isFacturista()) {
      return ['capturado', 'prefacturado', 'facturado'];
    }
    return ['borrador', 'capturado', 'prefacturado', 'facturado'];
  });

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    const user = this.auth.user();
    const vendedorId = user?.rol === 'vendedor' ? user.id : undefined;

    this.api
      .list({
        page: this.page(),
        pageSize: this.pageSize(),
        estatus: this.filterEstatus(),
        q: this.searchQ(),
        vendedorId,
      })
      .subscribe({
        next: (data) => {
          this.pedidos.set(data.items);
          this.total.set(data.total);
          this.page.set(data.page);
          this.totalPages.set(data.totalPages);
          this.loading.set(false);
          // Refrescar drafts abiertos con datos frescos; si el listado cambió,
          // conservar el anterior como baseline para resaltar diferencias.
          this.surtidoDrafts.update((map) => {
            const next = new Map(map);
            for (const id of next.keys()) {
              const pedido = data.items.find((p) => p.id === id);
              if (pedido && this.canEditSurtido(pedido)) {
                const prevDraft = next.get(id) ?? [];
                const freshLineas = this.cloneLineas(pedido);
                if (
                  prevDraft.length > 0 &&
                  productFingerprint(prevDraft) !==
                    productFingerprint(freshLineas)
                ) {
                  this.ensureListadoBaseline(id, prevDraft);
                }
                next.set(id, freshLineas);
              } else {
                next.delete(id);
                this.clearListadoBaseline(id);
              }
            }
            return next;
          });
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
    }, 300);
  }

  onFilterEstatus(value: PedidoComercialEstatus | ''): void {
    this.filterEstatus.set(value);
    this.page.set(1);
    this.load();
  }

  toggleExpand(pedido: PedidoComercial): void {
    const id = pedido.id;
    const willOpen = !this.expandedIds().has(id);
    this.expandedIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (willOpen && this.canEditSurtido(pedido)) {
      this.ensureSurtidoDraft(pedido);
    }
  }

  isExpanded(id: number): boolean {
    return this.expandedIds().has(id);
  }

  lineasDe(pedido: PedidoComercial): LineaPedidoComercial[] {
    const draft = this.surtidoDrafts().get(pedido.id);
    if (draft && this.canEditSurtido(pedido)) return draft;
    return parsePedidoDetalle(pedido.detalle).lineas;
  }

  /** Líneas con marcadores de cambio vs el listado previo del facturista. */
  lineasDiffDe(pedido: PedidoComercial): LineaPedidoDiff[] {
    const current = this.lineasDe(pedido);
    const baseline = this.listadoBaselineById().get(pedido.id);
    if (
      !baseline ||
      productFingerprint(baseline) === productFingerprint(current)
    ) {
      return current.map((linea) => ({
        kind: 'same' as const,
        codigo: linea.codigo,
        linea,
        cantidadChanged: false,
        precioChanged: false,
      }));
    }
    return diffLineasPedido(baseline, current);
  }

  hasListadoDiffs(pedido: PedidoComercial): boolean {
    return this.lineasDiffDe(pedido).some((d) => d.kind !== 'same');
  }

  lineaDiffRowClass(diff: LineaPedidoDiff): string {
    switch (diff.kind) {
      case 'added':
        return 'border-t border-emerald-200/80 bg-emerald-50/80';
      case 'removed':
        return 'border-t border-red-200/80 bg-red-50/70';
      case 'changed':
        return 'border-t border-amber-200/80 bg-amber-50/80';
      default:
        return 'border-t border-gray-200/80';
    }
  }

  lineaDiffBadge(diff: LineaPedidoDiff): string | null {
    if (diff.kind === 'added') return 'Agregado';
    if (diff.kind === 'removed') return 'Eliminado';
    if (diff.kind === 'changed') {
      const parts: string[] = [];
      if (diff.cantidadChanged) parts.push('Cantidad');
      if (diff.precioChanged) parts.push('Precio');
      if (parts.length === 0) parts.push('Modificado');
      return parts.join(' · ');
    }
    return null;
  }

  notasDe(pedido: PedidoComercial): string {
    return parsePedidoDetalle(pedido.detalle).notas;
  }

  canEditSurtido(pedido: PedidoComercial): boolean {
    return this.canFacturarOps() && this.isPrefactura(pedido.estatus);
  }

  updateSurtido(pedidoId: number, codigo: string, value: number | string): void {
    const raw = String(value).trim();
    const qty =
      raw === '' ? null : Math.max(0, Math.floor(Number(raw) || 0));
    this.surtidoDrafts.update((map) => {
      const next = new Map(map);
      const lines = next.get(pedidoId);
      if (!lines) return map;
      next.set(
        pedidoId,
        lines.map((l) =>
          l.codigo === codigo ? { ...l, cantidadSurtida: qty } : l,
        ),
      );
      return next;
    });
  }

  saveSurtido(pedido: PedidoComercial): void {
    void this.confirmAndSaveSurtido(pedido);
  }

  private async confirmAndSaveSurtido(pedido: PedidoComercial): Promise<void> {
    if (this.savingSurtidoId() === pedido.id) return;

    let fresh: PedidoComercial;
    try {
      fresh = await new Promise<PedidoComercial>((resolve, reject) => {
        this.api.getById(pedido.id).subscribe({ next: resolve, error: reject });
      });
    } catch (err: unknown) {
      void this.alerts.error(
        'No se pudo verificar el pedido',
        this.errorMessage(err),
      );
      return;
    }

    this.pedidos.update((list) =>
      list.map((p) => (p.id === fresh.id ? fresh : p)),
    );

    const parsed = parsePedidoDetalle(fresh.detalle);
    const draft = this.surtidoDrafts().get(fresh.id) ?? [];
    const merged = mergeSurtidoOntoLineas(parsed.lineas, draft).map((l) => ({
      ...l,
      cantidadSurtida: l.cantidadSurtida ?? l.cantidad,
    }));
    const fp = productFingerprint(parsed.lineas);

    this.expandedIds.update((set) => new Set(set).add(fresh.id));
    this.surtidoDrafts.update((map) => {
      const next = new Map(map);
      next.set(fresh.id, merged);
      return next;
    });

    const draftProductsDiffer =
      draft.length > 0 &&
      productFingerprint(draft) !== fp;
    const listadoCambio = fresh.requiereRevision || draftProductsDiffer;

    if (draftProductsDiffer) {
      // El borrador previo es la base para resaltar altas/bajas/cambios.
      this.setListadoBaseline(fresh.id, draft);
    }

    // Primero solo avisa y muestra productos; no guarda ni factura
    if (listadoCambio && !this.yaVioListado(fresh.id, fp)) {
      await this.alerts.info(
        'Listado actualizado',
        'se actualizo el listado, revisalo antes de continuar',
      );
      this.marcarListadoVisto(fresh.id, fp);
      return;
    }

    this.savingSurtidoId.set(fresh.id);
    this.api
      .update(fresh.id, {
        detalle: buildPedidoDetalle(merged, parsed.notas),
        ...(fresh.requiereRevision ? { ackRevision: true } : {}),
      })
      .subscribe({
        next: async () => {
          this.savingSurtidoId.set(null);
          this.setListadoBaseline(fresh.id, merged);
          await this.alerts.success('Cantidades surtidas guardadas');
          this.load();
        },
        error: (err: unknown) => {
          this.savingSurtidoId.set(null);
          void this.alerts.error('No se pudo guardar', this.errorMessage(err));
        },
      });
  }

  async askRemove(pedido: PedidoComercial): Promise<void> {
    if (pedido.estatus === 'facturado') {
      void this.alerts.info(
        'Facturado',
        'Un pedido facturado no se puede eliminar.',
      );
      return;
    }
    const confirmed = await this.alerts.confirm(
      '¿Eliminar pedido?',
      `Se eliminará el pedido de ${pedido.clienteNombre}.`,
    );
    if (!confirmed) return;

    this.api.remove(pedido.id).subscribe({
      next: async () => {
        await this.alerts.success('Pedido eliminado');
        this.load();
      },
      error: (err: unknown) => {
        void this.alerts.error('No se pudo eliminar', this.errorMessage(err));
      },
    });
  }

  markFacturado(pedido: PedidoComercial): void {
    void this.confirmAndMarkFacturado(pedido);
  }

  private async confirmAndMarkFacturado(pedido: PedidoComercial): Promise<void> {
    let fresh: PedidoComercial;
    try {
      fresh = await new Promise<PedidoComercial>((resolve, reject) => {
        this.api.getById(pedido.id).subscribe({ next: resolve, error: reject });
      });
    } catch (err: unknown) {
      void this.alerts.error(
        'No se pudo verificar el pedido',
        this.errorMessage(err),
      );
      return;
    }

    this.pedidos.update((list) =>
      list.map((p) => (p.id === fresh.id ? fresh : p)),
    );

    const parsed = parsePedidoDetalle(fresh.detalle);
    const draft = this.surtidoDrafts().get(fresh.id) ?? [];
    const merged = mergeSurtidoOntoLineas(parsed.lineas, draft).map((l) => ({
      ...l,
      cantidadSurtida: l.cantidadSurtida ?? l.cantidad,
    }));
    const fp = productFingerprint(parsed.lineas);

    this.expandedIds.update((set) => new Set(set).add(fresh.id));
    this.surtidoDrafts.update((map) => {
      const next = new Map(map);
      next.set(fresh.id, merged);
      return next;
    });

    const draftProductsDiffer =
      draft.length > 0 && productFingerprint(draft) !== fp;
    const listadoCambio = fresh.requiereRevision || draftProductsDiffer;

    if (draftProductsDiffer) {
      this.setListadoBaseline(fresh.id, draft);
    }

    // Con listado modificado: solo avisa, muestra productos y corta. No factura.
    if (listadoCambio) {
      await this.alerts.info(
        'Listado actualizado',
        'se actualizo el listado, revisalo antes de continuar',
      );
      this.marcarListadoVisto(fresh.id, fp);
      return;
    }

    if (merged.length === 0) {
      void this.alerts.error(
        'Sin productos',
        'No se puede facturar un pedido sin productos.',
      );
      return;
    }

    const resumen = merged
      .map(
        (l) =>
          `• ${l.codigo}: pedidas ${l.cantidad} → surtido ${l.cantidadSurtida}`,
      )
      .join('\n');

    const okCantidades = await this.alerts.confirm(
      'Confirmar cantidades y facturar',
      `Se guardará el surtido y el pedido quedará facturado:\n\n${resumen}`,
    );
    if (!okCantidades) return;

    // Revalidar justo antes de guardar: el vendedor pudo agregar productos
    // mientras estaba abierta la confirmación.
    let latest: PedidoComercial;
    try {
      latest = await new Promise<PedidoComercial>((resolve, reject) => {
        this.api.getById(fresh.id).subscribe({ next: resolve, error: reject });
      });
    } catch (err: unknown) {
      void this.alerts.error(
        'No se pudo verificar el pedido',
        this.errorMessage(err),
      );
      return;
    }

    const latestFp = productFingerprint(
      parsePedidoDetalle(latest.detalle).lineas,
    );
    if (latest.requiereRevision || latestFp !== fp) {
      this.setListadoBaseline(fresh.id, merged);
      this.pedidos.update((list) =>
        list.map((p) => (p.id === latest.id ? latest : p)),
      );
      const latestParsed = parsePedidoDetalle(latest.detalle);
      this.surtidoDrafts.update((map) => {
        const next = new Map(map);
        next.set(
          latest.id,
          mergeSurtidoOntoLineas(latestParsed.lineas, merged).map((l) => ({
            ...l,
            cantidadSurtida: l.cantidadSurtida ?? l.cantidad,
          })),
        );
        return next;
      });
      await this.alerts.info(
        'Listado actualizado',
        'se actualizo el listado, revisalo antes de continuar',
      );
      this.marcarListadoVisto(latest.id, latestFp);
      return;
    }

    const detalle = buildPedidoDetalle(merged, parsed.notas);
    this.api
      .update(fresh.id, {
        detalle,
        estatus: 'facturado',
      })
      .subscribe({
        next: async () => {
          await this.alerts.success('Pedido facturado');
          await this.offerWhatsAppAviso(
            fresh,
            `Pedido #${fresh.id} de ${this.clienteLabel(fresh)} se facturó.`,
          );
          this.load();
        },
        error: async (err: unknown) => {
          if (err instanceof HttpErrorResponse && err.status === 409) {
            await this.alerts.info(
              'Listado actualizado',
              'se actualizo el listado, revisalo antes de continuar',
            );
            this.load();
            return;
          }
          void this.alerts.error('No se pudo actualizar', this.errorMessage(err));
        },
      });
  }

  sendToPrefactura(pedido: PedidoComercial): void {
    this.api.update(pedido.id, { estatus: 'prefacturado' }).subscribe({
      next: async (updated) => {
        await this.alerts.success('Enviado a prefactura');
        this.expandedIds.update((set) => new Set(set).add(pedido.id));
        this.ensureSurtidoDraft(updated);
        await this.offerWhatsAppAviso(
          updated,
          `Pedido #${updated.id} de ${this.clienteLabel(updated)} se mandó a prefactura.`,
        );
        this.load();
      },
      error: (err: unknown) => {
        void this.alerts.error('No se pudo actualizar', this.errorMessage(err));
      },
    });
  }

  /** Aviso de diferencias de surtido (no confundir con prefactura/facturado). */
  avisarDiferenciasWhatsApp(pedido: PedidoComercial): void {
    const diffs = this.lineasDe(pedido).filter(
      (l) => l.cantidadSurtida != null && l.cantidadSurtida !== l.cantidad,
    );

    if (diffs.length === 0) {
      void this.alerts.info(
        'Sin diferencias',
        'Expande el pedido e indica en “Surtido” una cantidad distinta a la pedida antes de avisar.',
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
      `Hola, del cliente ${this.clienteLabel(pedido)}, pedido #${pedido.id}.`,
      ``,
      ...lines,
      ``,
      `¿Timbro el pedido o habrá algún cambio?`,
    ].join('\n');

    this.openWhatsApp(text);
  }

  private clienteLabel(pedido: PedidoComercial): string {
    const codigo = pedido.clienteCodigo?.trim();
    if (codigo) return `${codigo} — ${pedido.clienteNombre}`;
    return pedido.clienteNombre;
  }

  private openWhatsApp(text: string): void {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener,noreferrer',
    );
  }

  private async offerWhatsAppAviso(
    _pedido: PedidoComercial,
    text: string,
  ): Promise<void> {
    const share = await this.alerts.confirm(
      '¿Avisar por WhatsApp?',
      text,
    );
    if (!share) return;
    this.openWhatsApp(text);
  }

  /** Facturista no edita el pedido; vendedor sí puede en prefactura. */
  canEdit(pedido: PedidoComercial): boolean {
    if (this.isFacturista()) return false;
    if (pedido.estatus === 'facturado') return false;
    if (this.isVendedor()) {
      return (
        pedido.estatus === 'borrador' ||
        pedido.estatus === 'capturado' ||
        pedido.estatus === 'prefacturado' ||
        pedido.estatus === 'en_facturacion'
      );
    }
    return this.isAdmin();
  }

  canSendPrefactura(pedido: PedidoComercial): boolean {
    return (
      this.canFacturarOps() &&
      (pedido.estatus === 'borrador' || pedido.estatus === 'capturado')
    );
  }

  canMarkFacturado(pedido: PedidoComercial): boolean {
    return this.canFacturarOps() && this.isPrefactura(pedido.estatus);
  }

  canDelete(pedido: PedidoComercial): boolean {
    if (this.isFacturista()) return false;
    if (pedido.estatus === 'facturado') return false;
    if (this.isVendedor()) {
      return pedido.estatus === 'borrador' || pedido.estatus === 'capturado';
    }
    return this.isAdmin();
  }

  isPrefactura(estatus: PedidoComercialEstatus): boolean {
    return estatus === 'prefacturado' || estatus === 'en_facturacion';
  }

  /** Etiqueta bajo el cliente cuando el surtido no coincide con lo pedido. */
  cantidadDiffLabel(pedido: PedidoComercial): string | null {
    const kind = this.cantidadDiffKind(pedido);
    if (!kind) return null;

    const facturado = pedido.estatus === 'facturado';
    if (kind === 'ambos') {
      return facturado
        ? 'facturado con cantidades distintas'
        : 'cantidades distintas a lo solicitado';
    }
    if (kind === 'menor') {
      return facturado
        ? 'facturado con cantidad menor'
        : 'cantidad menor a lo solicitado';
    }
    return facturado
      ? 'facturado con cantidad mayor'
      : 'cantidad mayor a lo solicitado';
  }

  private cantidadDiffKind(
    pedido: PedidoComercial,
  ): 'menor' | 'mayor' | 'ambos' | null {
    const lines = this.lineasDe(pedido);
    let menor = false;
    let mayor = false;
    for (const l of lines) {
      if (l.cantidadSurtida == null) continue;
      if (l.cantidadSurtida < l.cantidad) menor = true;
      if (l.cantidadSurtida > l.cantidad) mayor = true;
    }
    if (menor && mayor) return 'ambos';
    if (menor) return 'menor';
    if (mayor) return 'mayor';
    return null;
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

  estatusClass(estatus: PedidoComercialEstatus): string {
    const classes: Record<PedidoComercialEstatus, string> = {
      borrador: 'bg-gray-100 text-gray-700',
      capturado: 'bg-brand-50 text-brand-700',
      en_facturacion: 'bg-amber-50 text-amber-800',
      prefacturado: 'bg-amber-50 text-amber-800',
      facturado: 'bg-emerald-50 text-emerald-800',
    };
    return classes[estatus];
  }

  formatMomento(value: string | null | undefined): string {
    if (!value) return '—';
    return formatWallClock(value);
  }

  prevPage(): void {
    if (this.page() <= 1) return;
    this.page.update((p) => p - 1);
    this.load();
  }

  nextPage(): void {
    if (this.page() >= this.totalPages()) return;
    this.page.update((p) => p + 1);
    this.load();
  }

  private ensureSurtidoDraft(pedido: PedidoComercial): void {
    if (!this.canFacturarOps() || !this.isPrefactura(pedido.estatus)) return;
    const lineas = this.cloneLineas(pedido);
    this.surtidoDrafts.update((map) => {
      const next = new Map(map);
      next.set(pedido.id, lineas);
      return next;
    });
    // Baseline inicial: listado que el facturista ya vio (sin diffs).
    this.ensureListadoBaseline(pedido.id, lineas);
  }

  private ensureListadoBaseline(
    pedidoId: number,
    lineas: LineaPedidoComercial[],
  ): void {
    this.listadoBaselineById.update((map) => {
      if (map.has(pedidoId)) return map;
      const next = new Map(map);
      next.set(
        pedidoId,
        lineas.map((l) => ({ ...l })),
      );
      return next;
    });
  }

  private setListadoBaseline(
    pedidoId: number,
    lineas: LineaPedidoComercial[],
  ): void {
    this.listadoBaselineById.update((map) => {
      const next = new Map(map);
      next.set(
        pedidoId,
        lineas.map((l) => ({ ...l })),
      );
      return next;
    });
  }

  private clearListadoBaseline(pedidoId: number): void {
    this.listadoBaselineById.update((map) => {
      if (!map.has(pedidoId)) return map;
      const next = new Map(map);
      next.delete(pedidoId);
      return next;
    });
  }

  private yaVioListado(pedidoId: number, fingerprint: string): boolean {
    return this.listadoVistoFp().get(pedidoId) === fingerprint;
  }

  private marcarListadoVisto(pedidoId: number, fingerprint: string): void {
    this.listadoVistoFp.update((map) => {
      const next = new Map(map);
      next.set(pedidoId, fingerprint);
      return next;
    });
  }

  private cloneLineas(pedido: PedidoComercial): LineaPedidoComercial[] {
    return parsePedidoDetalle(pedido.detalle).lineas.map((l) => ({
      ...l,
      cantidadSurtida: l.cantidadSurtida ?? l.cantidad,
    }));
  }

  private errorMessage(err: unknown, fallback = 'Ocurrió un error'): string {
    if (err instanceof HttpErrorResponse) {
      if (typeof err.error?.message === 'string') return err.error.message;
      if (err.status === 0) return 'No hay conexión con el servidor';
    }
    return fallback;
  }
}
