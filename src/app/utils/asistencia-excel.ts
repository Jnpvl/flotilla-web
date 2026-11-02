import type { Asistencia } from '../services/asistencia.service';

/** Reglas configurables */
export const ENTRADA_ESPERADA = '08:00';
export const TOLERANCIA_MIN = 10;
/** 0 = domingo. Días no laborales. */
export const DIAS_NO_LABORALES = [0];

const DIAS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const C = {
  header: 'FF1F3864',
  ok: 'FFC6EFCE',
  retardo: 'FFFFEB9C',
  falta: 'FFFFC7CE',
  sinSalida: 'FFF8CBAD',
  domingo: 'FFD9D9D9',
};

type Estatus = 'A tiempo' | 'Retardo' | 'Sin salida' | 'Falta';

const pad = (n: number) => String(n).padStart(2, '0');

/** Toma la hora tal como viene guardada (sin conversión de zona). */
function hhmm(v: string | null): string {
  if (!v) return '';
  const m = /(\d{2}):(\d{2})/.exec(v.replace(/^\d{4}-\d{2}-\d{2}/, ''));
  return m ? `${m[1]}:${m[2]}` : v;
}
function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function wallMs(v: string | null): number | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(v.trim());
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
}
function workedMin(r: Asistencia): number | null {
  const a = wallMs(r.entradaAt), b = wallMs(r.salidaAt);
  if (a == null || b == null || b < a) return null;
  return Math.round((b - a) / 60000);
}
const hLabel = (min: number) => `${Math.floor(min / 60)}:${pad(min % 60)}`;

function estatus(r: Asistencia): Estatus {
  const ent = hhmm(r.entradaAt);
  if (!r.salidaAt) return 'Sin salida';
  if (ent && toMin(ent) > toMin(ENTRADA_ESPERADA) + TOLERANCIA_MIN) return 'Retardo';
  return 'A tiempo';
}
const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });

export async function exportAsistenciasExcel(opts: {
  year: number;
  month: number;
  monthLabel: string;
  usuarios: { id: number; nombre: string }[];
  items: Asistencia[];
}): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const { year, month, monthLabel, items } = opts;
  const days = new Date(year, month, 0).getDate();
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  // usuarios: lista + los que aparezcan en registros
  const users = new Map<number, string>();
  opts.usuarios.forEach((u) => users.set(u.id, u.nombre));
  items.forEach((r) => { if (!users.has(r.usuarioId)) users.set(r.usuarioId, r.usuarioNombre ?? `#${r.usuarioId}`); });
  const userList = [...users.entries()].sort((a, b) => a[1].localeCompare(b[1]));

  const byKey = new Map<string, Asistencia>();
  items.forEach((r) => byKey.set(`${r.usuarioId}|${r.fecha.slice(0, 10)}`, r));

  const wb = new ExcelJS.Workbook();
  const styleHeader = (row: import('exceljs').Row) => row.eachCell((c) => {
    c.fill = fill(C.header);
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });

  // Resumen
  const res = wb.addWorksheet('Resumen');
  res.addRow([`Asistencia ${monthLabel}`]).font = { bold: true, size: 14 };
  res.mergeCells(1, 1, 1, 7);
  styleHeader(res.addRow(['Usuario', 'Días trabajados', 'Faltas', 'Retardos', 'Sin salida', 'Horas totales', 'Promedio diario']));
  // Calendario
  const cal = wb.addWorksheet('Calendario');
  cal.addRow([`Calendario ${monthLabel}`]).font = { bold: true, size: 14 };
  const calHead = ['Usuario'];
  for (let d = 1; d <= days; d++) calHead.push(`${DIAS[new Date(year, month - 1, d).getDay()]} ${d}`);
  styleHeader(cal.addRow(calHead));
  cal.getColumn(1).width = 24;
  for (let d = 1; d <= days; d++) cal.getColumn(d + 1).width = 8;

  for (const [uid, nombre] of userList) {
    let trab = 0, faltas = 0, ret = 0, sinSal = 0, mins = 0, conHoras = 0;
    const row = cal.addRow([nombre]);
    row.height = 32;
    for (let d = 1; d <= days; d++) {
      const key = `${year}-${pad(month)}-${pad(d)}`;
      const noLab = DIAS_NO_LABORALES.includes(new Date(year, month - 1, d).getDay());
      const r = byKey.get(`${uid}|${key}`);
      const cell = row.getCell(d + 1);
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.font = { size: 9 };
      if (r) {
        trab++;
        const e = estatus(r);
        if (e === 'Retardo') ret++;
        if (e === 'Sin salida') sinSal++;
        const w = workedMin(r);
        if (w != null) { mins += w; conHoras++; }
        cell.value = `${hhmm(r.entradaAt)}\n${hhmm(r.salidaAt) || '—'}`;
        cell.fill = fill(e === 'Retardo' ? C.retardo : e === 'Sin salida' ? C.sinSalida : C.ok);
      } else if (noLab) {
        cell.fill = fill(C.domingo);
      } else if (key <= todayKey) {
        faltas++;
        cell.value = 'FALTA';
        cell.fill = fill(C.falta);
      }
    }
    res.addRow([nombre, trab, faltas, ret, sinSal, hLabel(mins), conHoras ? hLabel(Math.round(mins / conHoras)) : '—']);
  }
  res.getColumn(1).width = 26;
  for (let i = 2; i <= 7; i++) res.getColumn(i).width = 15;
  res.views = [{ state: 'frozen', ySplit: 2 }];

  cal.addRow([]);
  const ley = cal.addRow(['Leyenda:', 'A tiempo', '', 'Retardo', '', 'Falta', '', 'Sin salida', '', 'No laboral']);
  ley.getCell(1).font = { bold: true };
  [[2, C.ok], [4, C.retardo], [6, C.falta], [8, C.sinSalida], [10, C.domingo]].forEach(([i, c]) => (ley.getCell(i as number).fill = fill(c as string)));
  cal.addRow([`Entrada esperada ${ENTRADA_ESPERADA}, tolerancia ${TOLERANCIA_MIN} min. Cada celda: entrada / salida.`]);
  cal.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }];

  // Detalle
  const det = wb.addWorksheet('Detalle');
  styleHeader(det.addRow(['Usuario', 'Fecha', 'Entrada', 'Salida', 'Tiempo', 'Estatus', 'Origen', 'Ubicación']));
  [24, 12, 10, 10, 10, 12, 10, 16].forEach((w, i) => (det.getColumn(i + 1).width = w));
  const sorted = [...items].sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.usuarioNombre ?? '').localeCompare(b.usuarioNombre ?? ''));
  for (const r of sorted) {
    const w = workedMin(r);
    const row = det.addRow([
      r.usuarioNombre ?? users.get(r.usuarioId) ?? '',
      r.fecha.slice(0, 10),
      hhmm(r.entradaAt) || '—',
      hhmm(r.salidaAt) || '—',
      w != null ? hLabel(w) : '—',
      estatus(r),
      [r.origenEntrada, r.origenSalida].filter(Boolean).join(' / ') || '—',
      '',
    ]);
    if (r.entradaLat != null && r.entradaLng != null) {
      const c = row.getCell(8);
      c.value = { text: 'Ver en Maps', hyperlink: `https://www.google.com/maps?q=${r.entradaLat},${r.entradaLng}` };
      c.font = { color: { argb: 'FF0563C1' }, underline: true };
    }
  }
  det.autoFilter = { from: 'A1', to: 'H1' };
  det.views = [{ state: 'frozen', ySplit: 1 }];

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `asistencia-${year}-${pad(month)}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}
