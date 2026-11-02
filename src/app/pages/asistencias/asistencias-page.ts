import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Asistencia,
  AsistenciaConfig,
  AsistenciaEstatus,
  AsistenciaFestivo,
  AsistenciaService,
} from '../../services/asistencia.service';
import { AlertService } from '../../services/alert.service';
import { Usuario, UsuarioService } from '../../services/usuario.service';
import { exportAsistenciasExcel } from '../../utils/asistencia-excel';

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

const WEEKDAY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' },
];

@Component({
  selector: 'app-asistencias-page',
  imports: [FormsModule],
  templateUrl: './asistencias-page.html',
})
export class AsistenciasPage implements OnInit {
  private readonly api = inject(AsistenciaService);
  private readonly usuariosApi = inject(UsuarioService);
  private readonly alerts = inject(AlertService);

  readonly weekdayOptions = WEEKDAY_OPTIONS;

  readonly items = signal<Asistencia[]>([]);
  readonly usuarios = signal<Usuario[]>([]);
  readonly festivos = signal<AsistenciaFestivo[]>([]);
  readonly loading = signal(true);
  readonly savingConfig = signal(false);
  readonly savingFestivo = signal(false);
  readonly exporting = signal(false);
  /** registro = listado del mes; configuracion = horarios/festivos */
  readonly tab = signal<'registro' | 'configuracion'>('registro');

  readonly viewYear = signal(new Date().getFullYear());
  readonly viewMonth = signal(new Date().getMonth() + 1);
  filterUsuarioId: number | null = null;

  configEntrada = '08:00';
  configTolerancia = 10;
  configSalida = '17:00';
  configDias: number[] = [1, 2, 3, 4, 5];
  configExigeComida = false;
  configComidaInicio = '13:00';
  configComidaFin = '14:00';

  festivoFecha = '';
  festivoNombre = '';

  readonly monthLabel = computed(
    () => `${MONTHS[this.viewMonth() - 1]} ${this.viewYear()}`,
  );

  horarioResumenText(): string {
    const dias = this.configDias
      .slice()
      .sort((a, b) => {
        const order = [1, 2, 3, 4, 5, 6, 0];
        return order.indexOf(a) - order.indexOf(b);
      })
      .map((d) => WEEKDAY_OPTIONS.find((o) => o.value === d)?.label ?? '')
      .filter(Boolean)
      .join('·');
    const comida = this.configExigeComida ? ' · Comida opcional' : '';
    return `${this.configEntrada} → ${this.configSalida} (±${this.configTolerancia} min)${comida} · ${dias || '—'}`;
  }

  setTab(tab: 'registro' | 'configuracion'): void {
    this.tab.set(tab);
  }

  async exportExcel(): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    try {
      await exportAsistenciasExcel({
        year: this.viewYear(),
        month: this.viewMonth(),
        monthLabel: this.monthLabel(),
        usuarios: this.usuarios().map((u) => ({ id: u.id, nombre: u.nombre })),
        items: this.items(),
        config: {
          entradaEsperada: this.configEntrada,
          toleranciaRetardoMin: Number(this.configTolerancia),
          salidaEsperada: this.configSalida,
          diasLaborales: [...this.configDias],
          exigeComida: this.configExigeComida,
          comidaInicioEsperada: null,
          comidaFinEsperada: null,
          checadas: this.configExigeComida
            ? ['entrada', 'comida_inicio', 'comida_fin', 'salida']
            : ['entrada', 'salida'],
        },
        festivos: this.festivos(),
      });
    } catch (err: unknown) {
      void this.alerts.error(
        'Error',
        this.errorMessage(err, 'No se pudo generar el Excel'),
      );
    } finally {
      this.exporting.set(false);
    }
  }

  ngOnInit(): void {
    this.usuariosApi.list().subscribe({
      next: (data) => this.usuarios.set(data),
      error: () => this.usuarios.set([]),
    });
    this.loadConfig();
    this.load();
  }

  load(): void {
    this.loading.set(true);
    const { desde, hasta } = this.monthRange();

    this.api
      .list({
        desde,
        hasta,
        ...(this.filterUsuarioId != null
          ? { usuarioId: this.filterUsuarioId }
          : {}),
      })
      .subscribe({
        next: (data) => {
          this.items.set(data);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.loading.set(false);
          void this.alerts.error(
            'Error',
            this.errorMessage(err, 'No se pudieron cargar las asistencias'),
          );
        },
      });

    this.api.listFestivos({ desde, hasta }).subscribe({
      next: (data) => this.festivos.set(data),
      error: () => this.festivos.set([]),
    });
  }

  loadConfig(): void {
    this.api.getConfig().subscribe({
      next: (cfg) => this.applyConfigForm(cfg),
      error: () => {
        /* defaults en el formulario */
      },
    });
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
    this.load();
  }

  goToday(): void {
    const now = new Date();
    this.viewYear.set(now.getFullYear());
    this.viewMonth.set(now.getMonth() + 1);
    this.load();
  }

  isDiaLaboral(day: number): boolean {
    return this.configDias.includes(day);
  }

  toggleDiaLaboral(day: number): void {
    if (this.configDias.includes(day)) {
      this.configDias = this.configDias.filter((d) => d !== day);
    } else {
      this.configDias = [...this.configDias, day].sort((a, b) => {
        const order = [1, 2, 3, 4, 5, 6, 0];
        return order.indexOf(a) - order.indexOf(b);
      });
    }
  }

  saveConfig(): void {
    if (this.savingConfig()) return;
    this.savingConfig.set(true);
    this.api
      .updateConfig({
        entradaEsperada: this.configEntrada,
        toleranciaRetardoMin: Number(this.configTolerancia),
        salidaEsperada: this.configSalida,
        diasLaborales: this.configDias,
        exigeComida: this.configExigeComida,
        comidaInicioEsperada: null,
        comidaFinEsperada: null,
      })
      .subscribe({
        next: (cfg) => {
          this.applyConfigForm(cfg);
          this.savingConfig.set(false);
          void this.alerts.success('Guardado', 'Horarios actualizados');
          this.load();
          this.tab.set('registro');
        },
        error: (err: unknown) => {
          this.savingConfig.set(false);
          void this.alerts.error(
            'Error',
            this.errorMessage(err, 'No se pudo guardar la configuración'),
          );
        },
      });
  }

  addFestivo(): void {
    if (!this.festivoFecha || this.savingFestivo()) return;
    this.savingFestivo.set(true);
    this.api
      .createFestivo({
        fecha: this.festivoFecha,
        nombre: this.festivoNombre.trim() || null,
      })
      .subscribe({
        next: async () => {
          this.savingFestivo.set(false);
          this.festivoFecha = '';
          this.festivoNombre = '';
          await this.alerts.success('Festivo agregado', 'Día no laboral registrado');
          this.load();
        },
        error: (err: unknown) => {
          this.savingFestivo.set(false);
          void this.alerts.error(
            'Error',
            this.errorMessage(err, 'No se pudo agregar el festivo'),
          );
        },
      });
  }

  removeFestivo(item: AsistenciaFestivo): void {
    void this.alerts
      .confirm(
        'Quitar festivo',
        `¿Eliminar ${item.fecha}${item.nombre ? ` (${item.nombre})` : ''}?`,
      )
      .then((ok) => {
        if (!ok) return;
        this.api.removeFestivo(item.id).subscribe({
          next: () => this.load(),
          error: (err: unknown) => {
            void this.alerts.error(
              'Error',
              this.errorMessage(err, 'No se pudo eliminar'),
            );
          },
        });
      });
  }

  timeLabel(value: string | null): string {
    if (!value) return '—';
    const match = /(\d{2}):(\d{2})/.exec(value);
    return match ? `${match[1]}:${match[2]}` : value;
  }

  /** Entrada → salida (bruto). */
  totalMinutes(row: Asistencia): number | null {
    return this.diffMinutes(row.entradaAt, row.salidaAt);
  }

  /** Duración de comida (inicio → fin). */
  mealMinutes(row: Asistencia): number | null {
    return this.diffMinutes(row.comidaInicioAt, row.comidaFinAt);
  }

  /** Entrada → salida descontando comida. */
  workedMinutes(row: Asistencia): number | null {
    const total = this.totalMinutes(row);
    if (total == null) return null;
    const meal = this.mealMinutes(row) ?? 0;
    return Math.max(0, total - meal);
  }

  minutesLabel(mins: number | null): string {
    if (mins == null) return '—';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${String(m).padStart(2, '0')}m`;
  }

  totalLabel(row: Asistencia): string {
    return this.minutesLabel(this.totalMinutes(row));
  }

  workedLabel(row: Asistencia): string {
    return this.minutesLabel(this.workedMinutes(row));
  }

  /** Badge sobre tiempo trabajado (neto). */
  workedBadgeClass(row: Asistencia): string {
    const mins = this.workedMinutes(row);
    if (mins == null) return 'bg-gray-100 text-gray-500';
    if (mins < 8 * 60) return 'bg-red-50 text-red-700';
    return 'bg-green-50 text-green-700';
  }

  private diffMinutes(
    from: string | null | undefined,
    to: string | null | undefined,
  ): number | null {
    if (!from || !to) return null;
    const a = this.parseWallClock(from);
    const b = this.parseWallClock(to);
    if (a == null || b == null || b < a) return null;
    return Math.round((b - a) / 60000);
  }

  estatusLabel(estatus: AsistenciaEstatus | null): string {
    switch (estatus) {
      case 'a_tiempo':
        return 'A tiempo';
      case 'retardo':
        return 'Retardo';
      case 'sin_salida':
        return 'Sin salida';
      case 'salida_temprana':
        return 'Salida temprana';
      default:
        return '—';
    }
  }

  estatusClass(estatus: AsistenciaEstatus | null): string {
    switch (estatus) {
      case 'a_tiempo':
        return 'bg-green-50 text-green-700';
      case 'retardo':
        return 'bg-amber-50 text-amber-800';
      case 'sin_salida':
        return 'bg-orange-50 text-orange-800';
      case 'salida_temprana':
        return 'bg-sky-50 text-sky-800';
      default:
        return 'bg-gray-100 text-gray-500';
    }
  }

  mapsUrl(lat: number | null, lng: number | null): string | null {
    if (lat == null || lng == null) return null;
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }

  private applyConfigForm(cfg: AsistenciaConfig): void {
    this.configEntrada = cfg.entradaEsperada;
    this.configTolerancia = cfg.toleranciaRetardoMin;
    this.configSalida = cfg.salidaEsperada;
    this.configDias = [...cfg.diasLaborales];
    this.configExigeComida = Boolean(cfg.exigeComida);
    this.configComidaInicio = cfg.comidaInicioEsperada ?? '13:00';
    this.configComidaFin = cfg.comidaFinEsperada ?? '14:00';
  }

  private monthRange(): { desde: string; hasta: string } {
    const year = this.viewYear();
    const month = this.viewMonth();
    const pad = (n: number) => String(n).padStart(2, '0');
    const desde = `${year}-${pad(month)}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const hasta = `${year}-${pad(month)}-${pad(lastDay)}`;
    return { desde, hasta };
  }

  private parseWallClock(value: string): number | null {
    const match =
      /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(
        value.trim(),
      );
    if (!match) return null;
    const ms = Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6] ?? '0'),
    );
    return Number.isFinite(ms) ? ms : null;
  }

  private errorMessage(err: unknown, fallback: string): string {
    if (
      err &&
      typeof err === 'object' &&
      'error' in err &&
      err.error &&
      typeof err.error === 'object' &&
      'message' in err.error &&
      typeof (err.error as { message: unknown }).message === 'string'
    ) {
      return (err.error as { message: string }).message;
    }
    return fallback;
  }
}
