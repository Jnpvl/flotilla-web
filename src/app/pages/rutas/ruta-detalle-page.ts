import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import * as L from 'leaflet';
import { AlertService } from '../../services/alert.service';
import {
  type Ruta,
  type RutaEstatus,
  type RutaGpsPoint,
  RutaService,
} from '../../services/ruta.service';
import { formatRutaTitle, formatWallClock } from '../../utils/local-datetime';

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const PEDIDO_COLORS = [
  '#7c3aed',
  '#db2777',
  '#0891b2',
  '#ca8a04',
  '#ea580c',
  '#4f46e5',
  '#16a34a',
  '#dc2626',
  '#0d9488',
  '#9333ea',
];

@Component({
  selector: 'app-ruta-detalle-page',
  imports: [RouterLink],
  templateUrl: './ruta-detalle-page.html',
})
export class RutaDetallePage implements OnInit, OnDestroy {
  @ViewChild('mapHost') set mapHost(ref: ElementRef<HTMLDivElement> | undefined) {
    this.mapEl = ref?.nativeElement ?? null;
    if (this.mapEl && this.ruta()) {
      this.drawMap(this.ruta()!);
    }
  }

  private readonly route = inject(ActivatedRoute);
  private readonly rutasApi = inject(RutaService);
  private readonly alerts = inject(AlertService);

  readonly loading = signal(true);
  readonly refreshing = signal(false);
  readonly ruta = signal<Ruta | null>(null);

  private mapEl: HTMLDivElement | null = null;
  private map?: L.Map;
  private overlay = L.layerGroup();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private rutaId = 0;
  private pedidoColorById = new Map<number, string>();

  ngOnInit(): void {
    this.rutaId = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isInteger(this.rutaId) || this.rutaId <= 0) {
      this.loading.set(false);
      void this.alerts.error('Ruta inválida');
      return;
    }
    this.load(true);
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.map?.remove();
    this.map = undefined;
  }

  refresh(): void {
    this.load(false);
  }

  title(ruta: Ruta): string {
    return formatRutaTitle(ruta.iniciadaAt, ruta.createdAt);
  }

  formatDate(value: string | null): string {
    if (!value) return '—';
    return formatWallClock(value);
  }

  formatDuracion(minutos: number | null): string {
    if (minutos === null) return '—';
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    if (h <= 0) return `${m} min`;
    return `${h} h ${m} min`;
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

  pedidoEstatusLabel(estatus: string): string {
    const labels: Record<string, string> = {
      listo_para_entregar: 'Listo',
      cargado: 'Cargado',
      en_ruta: 'En ruta',
      entregado: 'Entregado',
    };
    return labels[estatus] ?? estatus;
  }

  colorForPedidoId(pedidoId: number): string {
    return this.colorForPedido(pedidoId);
  }

  eventLabel(point: RutaGpsPoint): string {
    if (point.label) return point.label;
    switch (point.tipo) {
      case 'inicio_ruta':
        return 'Inicio de ruta';
      case 'pedido_entregado':
        return point.pedidoId
          ? `Pedido #${point.pedidoId} entregado`
          : 'Pedido entregado';
      case 'regreso_almacen':
        return 'Regreso al almacén';
      default:
        return 'GPS tracking';
    }
  }

  eventColor(point: RutaGpsPoint): string {
    switch (point.tipo) {
      case 'inicio_ruta':
        return '#16a34a';
      case 'regreso_almacen':
        return '#0f172a';
      case 'pedido_entregado':
        return this.colorForPedido(point.pedidoId);
      default:
        return '#3b82f6';
    }
  }

  eventos(ruta: Ruta): RutaGpsPoint[] {
    return this.sortedGps(ruta.gps ?? []).filter((p) => p.tipo !== 'tracking');
  }

  trackingCount(ruta: Ruta): number {
    return (ruta.gps ?? []).filter((p) => (p.tipo || 'tracking') === 'tracking').length;
  }

  leyendaPedidos(ruta: Ruta): { pedidoId: number; lugar: string; color: string }[] {
    return ruta.pedidos.map((p) => ({
      pedidoId: p.pedidoId,
      lugar: p.lugarEntrega,
      color: this.colorForPedido(p.pedidoId),
    }));
  }

  async askFinalizar(): Promise<void> {
    const ruta = this.ruta();
    if (!ruta) return;

    const confirmed = await this.alerts.confirm(
      '¿Finalizar ruta?',
      'Se marcará el regreso a bodega. Todos los pedidos deben estar entregados.',
    );
    if (!confirmed) return;

    const kmRaw = window.prompt(
      'Kilómetros recorridos (deja 0 o vacío para calcularlos desde el GPS):',
      '0',
    );
    const kmRecorridos =
      kmRaw === null || kmRaw.trim() === ''
        ? undefined
        : Number(kmRaw.replace(',', '.'));

    if (
      kmRecorridos !== undefined &&
      (!Number.isFinite(kmRecorridos) || kmRecorridos < 0)
    ) {
      void this.alerts.error('Dato inválido', 'Los kilómetros deben ser un número ≥ 0');
      return;
    }

    this.rutasApi.finalizar(ruta.id, { kmRecorridos }).subscribe({
      next: async () => {
        await this.alerts.success('Ruta finalizada');
        this.load(false);
      },
      error: (err: unknown) => {
        void this.alerts.error('No se pudo finalizar', this.errorMessage(err));
      },
    });
  }

  private load(initial: boolean): void {
    if (initial) this.loading.set(true);
    else this.refreshing.set(true);

    this.rutasApi.getById(this.rutaId).subscribe({
      next: (data) => {
        this.buildPedidoColors(data);
        this.ruta.set(data);
        this.loading.set(false);
        this.refreshing.set(false);
        queueMicrotask(() => this.drawMap(data));
        this.syncPolling(data);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.refreshing.set(false);
        void this.alerts.error(
          'Error',
          this.errorMessage(err, 'No se pudo cargar la ruta'),
        );
      },
    });
  }

  private buildPedidoColors(ruta: Ruta): void {
    this.pedidoColorById.clear();
    ruta.pedidos.forEach((p, index) => {
      this.pedidoColorById.set(p.pedidoId, PEDIDO_COLORS[index % PEDIDO_COLORS.length]!);
    });
  }

  private colorForPedido(pedidoId: number | null): string {
    if (pedidoId == null) return '#db2777';
    return this.pedidoColorById.get(pedidoId) ?? '#db2777';
  }

  private syncPolling(ruta: Ruta): void {
    this.stopPolling();
    if (ruta.estatus === 'en_ruta') {
      this.pollTimer = setInterval(() => this.load(false), 10000);
    }
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private drawMap(ruta: Ruta): void {
    if (!this.mapEl) return;

    const points = this.sortedGps(ruta.gps ?? []);

    if (!this.map) {
      this.map = L.map(this.mapEl, {
        zoomControl: true,
        attributionControl: true,
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(this.map);
      this.overlay.addTo(this.map);
    }

    this.overlay.clearLayers();

    if (points.length === 0) {
      this.map.setView([19.4326, -99.1332], 12);
      setTimeout(() => this.map?.invalidateSize(), 80);
      return;
    }

    const latLngs = points.map((p) => L.latLng(p.lat, p.lng));

    // Línea continua del recorrido (todos los puntos en orden)
    L.polyline(latLngs, {
      color: '#1e40af',
      weight: 4,
      opacity: 0.75,
      lineJoin: 'round',
      lineCap: 'round',
    }).addTo(this.overlay);

    for (const point of points) {
      const ll = L.latLng(point.lat, point.lng);
      const tipo = point.tipo || 'tracking';
      const color = this.eventColor(point);
      const hora = this.formatDate(point.recordedAt);
      const titulo = this.eventLabel(point);

      if (tipo === 'tracking') {
        L.circleMarker(ll, {
          radius: 3,
          color: '#93c5fd',
          fillColor: '#3b82f6',
          fillOpacity: 0.85,
          weight: 1,
        })
          .bindPopup(`<strong>GPS tracking</strong><br>${hora}`)
          .addTo(this.overlay);
        continue;
      }

      const radius = tipo === 'pedido_entregado' ? 9 : 8;
      L.circleMarker(ll, {
        radius,
        color: '#fff',
        fillColor: color,
        fillOpacity: 1,
        weight: 2,
      })
        .bindPopup(`<strong>${titulo}</strong><br>${hora}`)
        .addTo(this.overlay);
    }

    const bounds = L.latLngBounds(latLngs);
    this.map.fitBounds(bounds.pad(0.15));
    setTimeout(() => this.map?.invalidateSize(), 80);
  }

  private sortedGps(points: RutaGpsPoint[]): RutaGpsPoint[] {
    return [...points]
      .filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)))
      .map((p) => ({
        ...p,
        lat: Number(p.lat),
        lng: Number(p.lng),
        tipo: p.tipo || 'tracking',
        pedidoId: p.pedidoId ?? null,
        label: p.label ?? null,
      }))
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
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
