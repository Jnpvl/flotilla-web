import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { AlertService } from '../../services/alert.service';
import { AuthService } from '../../services/auth.service';
import {
  type CatalogItem,
  CatalogoService,
} from '../../services/catalogo.service';
import { type Usuario, UsuarioService } from '../../services/usuario.service';
import {
  type Visita,
  type VisitaEstatus,
  VisitaService,
} from '../../services/visita.service';
import { formatWallClock, todayLocalDay } from '../../utils/local-datetime';

type CalendarCell = {
  date: string | null;
  day: number | null;
  isToday: boolean;
  isSelected: boolean;
  count: number;
  planeadas: number;
  visitadas: number;
  canceladas: number;
};

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

@Component({
  selector: 'app-visitas-page',
  imports: [ReactiveFormsModule, FormsModule],
  templateUrl: './visitas-page.html',
})
export class VisitasPage implements OnInit {
  private readonly api = inject(VisitaService);
  private readonly usuariosApi = inject(UsuarioService);
  private readonly catalogo = inject(CatalogoService);
  private readonly alerts = inject(AlertService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly sanitizer = inject(DomSanitizer);
  private clienteSearchSeq = 0;

  readonly weekdays = WEEKDAYS;

  readonly monthVisitas = signal<Visita[]>([]);
  readonly vendedores = signal<Usuario[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly showForm = signal(false);
  readonly detailVisita = signal<Visita | null>(null);
  readonly editingId = signal<number | null>(null);
  readonly selectedDate = signal(todayLocalDay());
  readonly viewYear = signal(Number(todayLocalDay().slice(0, 4)));
  readonly viewMonth = signal(Number(todayLocalDay().slice(5, 7)));
  readonly filterVendedorId = signal<number | null>(null);

  readonly clienteQuery = signal('');
  readonly clienteSuggestions = signal<CatalogItem[]>([]);
  readonly showClienteSuggestions = signal(false);

  /** Check-in pendiente mientras eligen productos promocionados (catálogo Contpaq). */
  private readonly pendingCheckIn = signal<{
    visita: Visita;
    hizoPedido: boolean;
  } | null>(null);
  readonly showPromoProductos = signal(false);
  readonly promoProductoQuery = signal('');
  readonly promoProductoSuggestions = signal<CatalogItem[]>([]);
  readonly showPromoProductoSuggestions = signal(false);
  readonly promoProductos = signal<CatalogItem[]>([]);
  private promoProductoSearchSeq = 0;

  readonly isAdmin = computed(() => this.auth.user()?.rol === 'admin');
  readonly isVendedor = computed(() => this.auth.user()?.rol === 'vendedor');
  readonly canManage = computed(() => {
    const rol = this.auth.user()?.rol;
    return rol === 'admin' || rol === 'vendedor';
  });

  readonly monthLabel = computed(
    () => `${MONTHS[this.viewMonth() - 1]} ${this.viewYear()}`,
  );

  readonly selectedLabel = computed(() => {
    const [y, m, d] = this.selectedDate().split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  });

  readonly dayVisitas = computed(() =>
    this.monthVisitas()
      .filter((v) => v.fechaPlanificada === this.selectedDate())
      .slice()
      .sort((a, b) =>
        (a.horaPlanificada ?? '99:99').localeCompare(b.horaPlanificada ?? '99:99'),
      ),
  );

  readonly dayStats = computed(() => {
    const list = this.dayVisitas();
    return {
      total: list.length,
      planeadas: list.filter((v) => v.estatus === 'planeada').length,
      visitadas: list.filter((v) => v.estatus === 'visitada').length,
      canceladas: list.filter((v) => v.estatus === 'cancelada').length,
    };
  });

  readonly calendarCells = computed((): CalendarCell[] => {
    const year = this.viewYear();
    const month = this.viewMonth();
    const today = todayLocalDay();
    const selected = this.selectedDate();
    const first = new Date(year, month - 1, 1);
    const startOffset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month, 0).getDate();
    const counts = new Map<
      string,
      { total: number; planeadas: number; visitadas: number; canceladas: number }
    >();

    for (const v of this.monthVisitas()) {
      const cur = counts.get(v.fechaPlanificada) ?? {
        total: 0,
        planeadas: 0,
        visitadas: 0,
        canceladas: 0,
      };
      cur.total += 1;
      if (v.estatus === 'planeada') cur.planeadas += 1;
      if (v.estatus === 'visitada') cur.visitadas += 1;
      if (v.estatus === 'cancelada') cur.canceladas += 1;
      counts.set(v.fechaPlanificada, cur);
    }

    const empty = (): CalendarCell => ({
      date: null,
      day: null,
      isToday: false,
      isSelected: false,
      count: 0,
      planeadas: 0,
      visitadas: 0,
      canceladas: 0,
    });

    const cells: CalendarCell[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(empty());

    const pad = (n: number) => String(n).padStart(2, '0');
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${year}-${pad(month)}-${pad(day)}`;
      const stats = counts.get(date) ?? {
        total: 0,
        planeadas: 0,
        visitadas: 0,
        canceladas: 0,
      };
      cells.push({
        date,
        day,
        isToday: date === today,
        isSelected: date === selected,
        count: stats.total,
        planeadas: stats.planeadas,
        visitadas: stats.visitadas,
        canceladas: stats.canceladas,
      });
    }

    while (cells.length % 7 !== 0) cells.push(empty());
    return cells;
  });

  readonly form = this.fb.nonNullable.group({
    clienteNombre: ['', [Validators.required]],
    fechaPlanificada: [todayLocalDay(), [Validators.required]],
    horaPlanificada: [''],
    notas: [''],
    vendedorId: [0 as number],
  });

  ngOnInit(): void {
    if (this.isAdmin()) {
      this.usuariosApi.list().subscribe({
        next: (users) =>
          this.vendedores.set(
            users
              .filter((u) => u.rol === 'vendedor' || u.rol === 'admin')
              .slice()
              .sort((a, b) => {
                // Admin actual primero, luego resto por nombre
                const me = this.auth.user()?.id;
                if (me != null && a.id === me) return -1;
                if (me != null && b.id === me) return 1;
                return a.nombre.localeCompare(b.nombre, 'es');
              }),
          ),
        error: () => undefined,
      });
    }
    this.loadMonth();
  }

  loadMonth(): void {
    this.loading.set(true);
    const year = this.viewYear();
    const month = this.viewMonth();
    const pad = (n: number) => String(n).padStart(2, '0');
    const desde = `${year}-${pad(month)}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const hasta = `${year}-${pad(month)}-${pad(lastDay)}`;

    const user = this.auth.user();
    let vendedorId: number | undefined;
    if (user?.rol === 'vendedor') {
      vendedorId = user.id;
    } else if (this.filterVendedorId()) {
      vendedorId = this.filterVendedorId()!;
    }

    this.api
      .list({
        desde,
        hasta,
        ...(vendedorId != null ? { vendedorId } : {}),
      })
      .subscribe({
        next: (data) => {
          this.monthVisitas.set(data);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.loading.set(false);
          void this.alerts.error(
            'Error',
            this.errorMessage(err, 'No se pudieron cargar las visitas'),
          );
        },
      });
  }

  selectDay(date: string | null): void {
    if (!date) return;
    this.selectedDate.set(date);
  }

  goToday(): void {
    const today = todayLocalDay();
    this.selectedDate.set(today);
    this.viewYear.set(Number(today.slice(0, 4)));
    this.viewMonth.set(Number(today.slice(5, 7)));
    this.loadMonth();
  }

  shiftMonth(delta: number): void {
    let year = this.viewYear();
    let month = this.viewMonth() + delta;
    if (month < 1) {
      month = 12;
      year -= 1;
    } else if (month > 12) {
      month = 1;
      year += 1;
    }
    this.viewYear.set(year);
    this.viewMonth.set(month);

    const selected = this.selectedDate();
    const selMonth = Number(selected.slice(5, 7));
    const selYear = Number(selected.slice(0, 4));
    if (selMonth !== month || selYear !== year) {
      const pad = (n: number) => String(n).padStart(2, '0');
      this.selectedDate.set(`${year}-${pad(month)}-01`);
    }
    this.loadMonth();
  }

  onVendedorFilter(value: number | null): void {
    this.filterVendedorId.set(value);
    this.loadMonth();
  }

  openCreate(date?: string): void {
    this.editingId.set(null);
    const user = this.auth.user();
    this.form.reset({
      clienteNombre: '',
      fechaPlanificada: date ?? this.selectedDate(),
      horaPlanificada: '',
      notas: '',
      // Admin puede asignarse a sí mismo; vendedor siempre es él
      vendedorId: user?.id ?? 0,
    });
    this.clienteQuery.set('');
    this.clienteSuggestions.set([]);
    this.showClienteSuggestions.set(false);
    this.showForm.set(true);
  }

  openEdit(visita: Visita): void {
    if (visita.estatus !== 'planeada') {
      void this.alerts.info(
        'Visita cerrada',
        'Solo se pueden editar visitas planeadas.',
      );
      return;
    }
    this.editingId.set(visita.id);
    this.form.reset({
      clienteNombre: visita.clienteNombre,
      fechaPlanificada: visita.fechaPlanificada,
      horaPlanificada: visita.horaPlanificada ?? '',
      notas: visita.notas ?? '',
      vendedorId: visita.vendedorId,
    });
    this.clienteQuery.set(visita.clienteNombre);
    this.clienteSuggestions.set([]);
    this.showClienteSuggestions.set(false);
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
    this.clienteQuery.set('');
    this.clienteSuggestions.set([]);
    this.showClienteSuggestions.set(false);
  }

  hasDetalle(visita: Visita): boolean {
    if (visita.notas?.trim()) return true;
    if (visita.motivo?.trim()) return true;
    if (visita.notasVisita?.trim()) return true;
    if (this.isAdmin()) {
      if (visita.origenRegistro) return true;
      if (visita.visitadaAt) return true;
      if (visita.lat != null && visita.lng != null) return true;
      if (visita.hizoPedido != null || visita.promociono != null) return true;
    }
    return false;
  }

  openDetalle(visita: Visita): void {
    if (!this.hasDetalle(visita)) return;
    this.detailVisita.set(visita);
  }

  closeDetalle(): void {
    this.detailVisita.set(null);
  }

  private readDeviceGeo(): Promise<{
    lat?: number;
    lng?: number;
    accuracy?: number;
  }> {
    if (!navigator.geolocation) return Promise.resolve({});
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy:
              typeof pos.coords.accuracy === 'number'
                ? pos.coords.accuracy
                : undefined,
          });
        },
        () => resolve({}),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
      );
    });
  }

  onClienteInput(value: string): void {
    this.clienteQuery.set(value);
    this.form.controls.clienteNombre.setValue(value);
    this.showClienteSuggestions.set(true);
    const seq = ++this.clienteSearchSeq;
    this.catalogo.searchClientes(value).subscribe((items) => {
      if (seq !== this.clienteSearchSeq) return;
      this.clienteSuggestions.set(items);
    });
  }

  selectCliente(cliente: CatalogItem): void {
    this.clienteQuery.set(`${cliente.codigo} — ${cliente.nombre}`);
    this.form.controls.clienteNombre.setValue(cliente.nombre);
    this.showClienteSuggestions.set(false);
  }

  submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    if (this.isAdmin() && (!value.vendedorId || value.vendedorId <= 0)) {
      void this.alerts.error(
        'Falta asignado',
        'Selecciona a quién se asigna la visita',
      );
      return;
    }

    const editingId = this.editingId();
    this.saving.set(true);

    const payload = {
      clienteNombre: value.clienteNombre.trim(),
      fechaPlanificada: value.fechaPlanificada,
      horaPlanificada: value.horaPlanificada.trim() || null,
      notas: value.notas.trim() || null,
      ...(this.isAdmin() && value.vendedorId > 0
        ? { vendedorId: value.vendedorId }
        : {}),
    };

    if (editingId === null) {
      this.api.create(payload).subscribe({
        next: async () => {
          this.saving.set(false);
          this.closeForm();
          this.selectedDate.set(payload.fechaPlanificada);
          const [y, m] = payload.fechaPlanificada.split('-').map(Number);
          this.viewYear.set(y);
          this.viewMonth.set(m);
          await this.alerts.success('Visita agendada');
          this.loadMonth();
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
        this.closeForm();
        await this.alerts.success('Visita actualizada');
        this.loadMonth();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        void this.alerts.error('No se pudo actualizar', this.errorMessage(err));
      },
    });
  }

  async askVisitada(visita: Visita): Promise<void> {
    const ok = await this.alerts.confirm(
      '¿Marcar como visitada?',
      `Visita a ${visita.clienteNombre}.`,
    );
    if (!ok) return;

    const hizoPedido = await this.alerts.askYesNo('¿Le hicieron pedido?');
    if (hizoPedido === null) return;

    const promociono = await this.alerts.askYesNo('¿Promocionaron algo?');
    if (promociono === null) return;

    if (promociono) {
      this.pendingCheckIn.set({ visita, hizoPedido });
      this.promoProductos.set([]);
      this.promoProductoQuery.set('');
      this.promoProductoSuggestions.set([]);
      this.showPromoProductoSuggestions.set(false);
      this.showPromoProductos.set(true);
      return;
    }

    await this.finishCheckIn(visita, hizoPedido, false, null);
  }

  onPromoProductoInput(value: string): void {
    this.promoProductoQuery.set(value);
    this.showPromoProductoSuggestions.set(true);
    const seq = ++this.promoProductoSearchSeq;
    this.catalogo.searchProductos(value).subscribe((items) => {
      if (seq !== this.promoProductoSearchSeq) return;
      this.promoProductoSuggestions.set(items);
    });
  }

  addPromoProducto(producto: CatalogItem): void {
    const exists = this.promoProductos().some(
      (p) => p.codigo.toLowerCase() === producto.codigo.toLowerCase(),
    );
    if (!exists) {
      this.promoProductos.update((list) => [...list, producto]);
    }
    this.promoProductoQuery.set('');
    this.promoProductoSuggestions.set([]);
    this.showPromoProductoSuggestions.set(false);
  }

  removePromoProducto(codigo: string): void {
    this.promoProductos.update((list) =>
      list.filter((p) => p.codigo.toLowerCase() !== codigo.toLowerCase()),
    );
  }

  closePromoProductos(): void {
    this.showPromoProductos.set(false);
    this.pendingCheckIn.set(null);
    this.promoProductos.set([]);
    this.promoProductoQuery.set('');
    this.promoProductoSuggestions.set([]);
    this.showPromoProductoSuggestions.set(false);
  }

  async confirmPromoProductos(): Promise<void> {
    const pending = this.pendingCheckIn();
    if (!pending) return;
    if (this.promoProductos().length === 0) {
      void this.alerts.error(
        'Sin productos',
        'Agrega al menos un producto promocionado.',
      );
      return;
    }
    const productosPromocion = this.promoProductos()
      .map((p) => `${p.codigo} — ${p.nombre}`)
      .join('\n');
    const visita = pending.visita;
    const hizoPedido = pending.hizoPedido;
    this.closePromoProductos();
    await this.finishCheckIn(visita, hizoPedido, true, productosPromocion);
  }

  private async finishCheckIn(
    visita: Visita,
    hizoPedido: boolean,
    promociono: boolean,
    productosPromocion: string | null,
  ): Promise<void> {
    const geo = await this.readDeviceGeo();
    this.api
      .checkIn(visita.id, {
        origen: 'web',
        hizoPedido,
        promociono,
        ...(productosPromocion ? { productosPromocion } : {}),
        ...geo,
      })
      .subscribe({
        next: async () => {
          await this.alerts.success('Visita registrada');
          this.loadMonth();
        },
        error: (err: unknown) => {
          void this.alerts.error('No se pudo registrar', this.errorMessage(err));
        },
      });
  }

  async askCancelar(visita: Visita): Promise<void> {
    const motivo = await this.alerts.promptMotivo(
      `Cancelar visita a ${visita.clienteNombre}`,
      {
        label: '¿Por qué no se visitó?',
        confirmText: 'Cancelar visita',
      },
    );
    if (!motivo) return;

    const geo = await this.readDeviceGeo();
    this.api
      .cancelar(visita.id, {
        motivo,
        origen: 'web',
        ...geo,
      })
      .subscribe({
        next: async () => {
          await this.alerts.success('Visita cancelada');
          this.loadMonth();
        },
        error: (err: unknown) => {
          void this.alerts.error('No se pudo cancelar', this.errorMessage(err));
        },
      });
  }

  async askRemove(visita: Visita): Promise<void> {
    const motivo = await this.alerts.promptMotivo(
      `Eliminar visita a ${visita.clienteNombre}`,
      {
        label: 'Motivo de eliminación',
        confirmText: 'Eliminar',
      },
    );
    if (!motivo) return;

    this.api.eliminar(visita.id, motivo).subscribe({
      next: async () => {
        await this.alerts.success('Visita eliminada');
        this.loadMonth();
      },
      error: (err: unknown) => {
        void this.alerts.error('No se pudo eliminar', this.errorMessage(err));
      },
    });
  }

  estatusLabel(estatus: VisitaEstatus): string {
    const labels: Record<VisitaEstatus, string> = {
      planeada: 'Planeada',
      visitada: 'Visitada',
      cancelada: 'Cancelada',
    };
    return labels[estatus];
  }

  estatusClass(estatus: VisitaEstatus): string {
    const classes: Record<VisitaEstatus, string> = {
      planeada: 'bg-brand-50 text-brand-800',
      visitada: 'bg-emerald-50 text-emerald-800',
      cancelada: 'bg-rose-50 text-rose-800',
    };
    return classes[estatus];
  }

  formatMomento(value: string | null | undefined): string {
    if (!value) return '—';
    return formatWallClock(value);
  }

  mapsUrl(visita: Visita): string | null {
    if (visita.lat == null || visita.lng == null) return null;
    return `https://www.google.com/maps?q=${visita.lat},${visita.lng}`;
  }

  mapEmbedUrl(visita: Visita): SafeResourceUrl | null {
    if (visita.lat == null || visita.lng == null) return null;
    const url = `https://maps.google.com/maps?q=${visita.lat},${visita.lng}&z=16&output=embed`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  origenLabel(origen: string | null | undefined): string {
    if (origen === 'mobile') return 'App móvil';
    if (origen === 'web') return 'Panel web';
    return 'No registrado';
  }

  accuracyLabel(accuracy: number): string {
    return `${Math.round(accuracy)} m`;
  }

  private errorMessage(err: unknown, fallback = 'Ocurrió un error'): string {
    if (err instanceof HttpErrorResponse) {
      if (typeof err.error?.message === 'string') return err.error.message;
      if (err.status === 0) return 'No hay conexión con el servidor';
    }
    return fallback;
  }
}
