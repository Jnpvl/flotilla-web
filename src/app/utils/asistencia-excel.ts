import type {
  Asistencia,
  AsistenciaConfig,
  AsistenciaEstatus,
  AsistenciaFestivo,
} from '../services/asistencia.service';

const DIAS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const C = {
  header: 'FF1F3864',
  ok: 'FFC6EFCE',
  retardo: 'FFFFEB9C',
  falta: 'FFFFC7CE',
  sinSalida: 'FFF8CBAD',
  temprano: 'FFBDD7EE',
  noLaboral: 'FFD9D9D9',
};

type EstatusLabel =
  | 'A tiempo'
  | 'Retardo'
  | 'Sin salida'
  | 'Salida temprana'
  | 'Falta';

const pad = (n: number) => String(n).padStart(2, '0');

function hhmm(v: string | null | undefined): string {
  if (!v) return '';
  const m = /(\d{2}):(\d{2})/.exec(v.replace(/^\d{4}-\d{2}-\d{2}/, ''));
  return m ? `${m[1]}:${m[2]}` : v;
}

function wallMs(v: string | null | undefined): number | null {
  if (!v) return null;
  const m =
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(v.trim());
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
}

function diffMin(
  from: string | null | undefined,
  to: string | null | undefined,
): number | null {
  const a = wallMs(from);
  const b = wallMs(to);
  if (a == null || b == null || b < a) return null;
  return Math.round((b - a) / 60000);
}

/** Entrada → salida. */
function totalMin(r: Asistencia): number | null {
  return diffMin(r.entradaAt, r.salidaAt);
}

/** Entrada → salida menos comida. */
function workedMin(r: Asistencia): number | null {
  const total = totalMin(r);
  if (total == null) return null;
  const meal = diffMin(r.comidaInicioAt, r.comidaFinAt) ?? 0;
  return Math.max(0, total - meal);
}

const hLabel = (min: number) => `${Math.floor(min / 60)}:${pad(min % 60)}`;

function estatusFromApi(e: AsistenciaEstatus | null): EstatusLabel | null {
  switch (e) {
    case 'a_tiempo':
      return 'A tiempo';
    case 'retardo':
      return 'Retardo';
    case 'sin_salida':
      return 'Sin salida';
    case 'salida_temprana':
      return 'Salida temprana';
    default:
      return null;
  }
}

function estatusLabel(
  r: Asistencia,
  config: Pick<AsistenciaConfig, 'entradaEsperada' | 'toleranciaRetardoMin'>,
): EstatusLabel {
  const fromApi = estatusFromApi(r.estatus);
  if (fromApi) return fromApi;
  if (!r.salidaAt) return 'Sin salida';
  const ent = hhmm(r.entradaAt);
  if (!ent) return 'A tiempo';
  const [eh, em] = config.entradaEsperada.split(':').map(Number);
  const [ih, im] = ent.split(':').map(Number);
  const limite = (eh ?? 8) * 60 + (em ?? 0) + config.toleranciaRetardoMin;
  const actual = (ih ?? 0) * 60 + (im ?? 0);
  if (actual > limite) return 'Retardo';
  return 'A tiempo';
}

function fill(argb: string) {
  return {
    type: 'pattern' as const,
    pattern: 'solid' as const,
    fgColor: { argb },
  };
}

function colorFor(e: EstatusLabel): string {
  switch (e) {
    case 'Retardo':
      return C.retardo;
    case 'Sin salida':
      return C.sinSalida;
    case 'Salida temprana':
      return C.temprano;
    case 'Falta':
      return C.falta;
    default:
      return C.ok;
  }
}

export async function exportAsistenciasExcel(opts: {
  year: number;
  month: number;
  monthLabel: string;
  usuarios: { id: number; nombre: string }[];
  items: Asistencia[];
  config: AsistenciaConfig;
  festivos: AsistenciaFestivo[];
}): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const { year, month, monthLabel, items, config, festivos } = opts;
  const days = new Date(year, month, 0).getDate();
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const festivoSet = new Set(festivos.map((f) => f.fecha.slice(0, 10)));
  const diasLaborales = new Set(config.diasLaborales);

  const users = new Map<number, string>();
  opts.usuarios.forEach((u) => users.set(u.id, u.nombre));
  items.forEach((r) => {
    if (!users.has(r.usuarioId)) {
      users.set(r.usuarioId, r.usuarioNombre ?? `#${r.usuarioId}`);
    }
  });
  const userList = [...users.entries()].sort((a, b) => a[1].localeCompare(b[1]));

  const byKey = new Map<string, Asistencia>();
  items.forEach((r) => byKey.set(`${r.usuarioId}|${r.fecha.slice(0, 10)}`, r));

  const isNoLaboral = (ymd: string, weekday: number) =>
    !diasLaborales.has(weekday) || festivoSet.has(ymd);

  const wb = new ExcelJS.Workbook();
  const styleHeader = (row: import('exceljs').Row) =>
    row.eachCell((c) => {
      c.fill = fill(C.header);
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });

  // Resumen
  const res = wb.addWorksheet('Resumen');
  res.addRow([`Asistencia ${monthLabel}`]).font = { bold: true, size: 14 };
  res.mergeCells(1, 1, 1, 8);
  styleHeader(
    res.addRow([
      'Usuario',
      'Días trabajados',
      'Faltas',
      'Retardos',
      'Sin salida',
      'Horas totales',
      'Horas trabajadas',
      'Promedio diario',
    ]),
  );

  // Calendario
  const cal = wb.addWorksheet('Calendario');
  cal.addRow([`Calendario ${monthLabel}`]).font = { bold: true, size: 14 };
  const calHead = ['Usuario'];
  for (let d = 1; d <= days; d++) {
    calHead.push(`${DIAS[new Date(year, month - 1, d).getDay()]} ${d}`);
  }
  styleHeader(cal.addRow(calHead));
  cal.getColumn(1).width = 24;
  for (let d = 1; d <= days; d++) cal.getColumn(d + 1).width = 9;

  for (const [uid, nombre] of userList) {
    let trab = 0;
    let faltas = 0;
    let ret = 0;
    let sinSal = 0;
    let minsTotal = 0;
    let minsTrab = 0;
    let conHoras = 0;
    const row = cal.addRow([nombre]);
    row.height = 36;

    for (let d = 1; d <= days; d++) {
      const key = `${year}-${pad(month)}-${pad(d)}`;
      const weekday = new Date(year, month - 1, d).getDay();
      const noLab = isNoLaboral(key, weekday);
      const r = byKey.get(`${uid}|${key}`);
      const cell = row.getCell(d + 1);
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.font = { size: 8 };

      if (r) {
        trab++;
        const e = estatusLabel(r, config);
        if (e === 'Retardo') ret++;
        if (e === 'Sin salida') sinSal++;
        const t = totalMin(r);
        const w = workedMin(r);
        if (t != null) minsTotal += t;
        if (w != null) {
          minsTrab += w;
          conHoras++;
        }
        const comida =
          r.comidaInicioAt || r.comidaFinAt
            ? `\n${hhmm(r.comidaInicioAt) || '—'}–${hhmm(r.comidaFinAt) || '—'}`
            : '';
        cell.value = `${hhmm(r.entradaAt) || '—'}\n${hhmm(r.salidaAt) || '—'}${comida}`;
        cell.fill = fill(colorFor(e));
      } else if (noLab) {
        cell.fill = fill(C.noLaboral);
      } else if (key <= todayKey) {
        faltas++;
        cell.value = 'FALTA';
        cell.fill = fill(C.falta);
      }
    }

    res.addRow([
      nombre,
      trab,
      faltas,
      ret,
      sinSal,
      hLabel(minsTotal),
      hLabel(minsTrab),
      conHoras ? hLabel(Math.round(minsTrab / conHoras)) : '—',
    ]);
  }

  res.getColumn(1).width = 26;
  for (let i = 2; i <= 8; i++) res.getColumn(i).width = 15;
  res.views = [{ state: 'frozen', ySplit: 2 }];

  cal.addRow([]);
  const ley = cal.addRow([
    'Leyenda:',
    'A tiempo',
    '',
    'Retardo',
    '',
    'Falta',
    '',
    'Sin salida',
    '',
    'No laboral',
  ]);
  ley.getCell(1).font = { bold: true };
  (
    [
      [2, C.ok],
      [4, C.retardo],
      [6, C.falta],
      [8, C.sinSalida],
      [10, C.noLaboral],
    ] as const
  ).forEach(([i, c]) => {
    ley.getCell(i).fill = fill(c);
  });
  cal.addRow([
    `Entrada ${config.entradaEsperada}, tolerancia ${config.toleranciaRetardoMin} min, salida ${config.salidaEsperada}. Celda: entrada / salida` +
      (config.exigeComida ? ' (+ comida si aplica).' : '.'),
  ]);
  cal.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }];

  // Detalle
  const det = wb.addWorksheet('Detalle');
  styleHeader(
    det.addRow([
      'Usuario',
      'Fecha',
      'Entrada',
      'Comida ini.',
      'Comida fin',
      'Salida',
      'Total',
      'Trabajado',
      'Estatus',
      'Origen',
      'Ubicación',
    ]),
  );
  [22, 12, 9, 10, 10, 9, 9, 10, 14, 12, 14].forEach((w, i) => {
    det.getColumn(i + 1).width = w;
  });

  const sorted = [...items].sort(
    (a, b) =>
      a.fecha.localeCompare(b.fecha) ||
      (a.usuarioNombre ?? '').localeCompare(b.usuarioNombre ?? ''),
  );

  for (const r of sorted) {
    const t = totalMin(r);
    const w = workedMin(r);
    const row = det.addRow([
      r.usuarioNombre ?? users.get(r.usuarioId) ?? '',
      r.fecha.slice(0, 10),
      hhmm(r.entradaAt) || '—',
      hhmm(r.comidaInicioAt) || '—',
      hhmm(r.comidaFinAt) || '—',
      hhmm(r.salidaAt) || '—',
      t != null ? hLabel(t) : '—',
      w != null ? hLabel(w) : '—',
      estatusLabel(r, config),
      [r.origenEntrada, r.origenSalida].filter(Boolean).join(' / ') || '—',
      '',
    ]);
    if (r.entradaLat != null && r.entradaLng != null) {
      const c = row.getCell(11);
      c.value = {
        text: 'Ver en Maps',
        hyperlink: `https://www.google.com/maps?q=${r.entradaLat},${r.entradaLng}`,
      };
      c.font = { color: { argb: 'FF0563C1' }, underline: true };
    }
  }
  det.autoFilter = { from: 'A1', to: 'K1' };
  det.views = [{ state: 'frozen', ySplit: 1 }];

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `asistencia-${year}-${pad(month)}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}
