/** Reloj de pared local de la máquina del cliente, sin zona horaria. */
export function nowLocalWallClock(date = new Date()): string {
  const pad = (n: number, size = 2) => String(n).padStart(size, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

/** Día local `YYYY-MM-DD` (para inputs type=date). */
export function todayLocalDay(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Muestra una fecha local guardada sin convertir zonas. */
export function formatWallClock(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(
    value.trim(),
  );
  if (!match) return value;

  const [, y, mo, d, h, mi, s = '00'] = match;
  return `${d}/${mo}/${y}, ${h}:${mi}:${s}`;
}

export function formatWallClockDay(value: string | null | undefined): string {
  if (!value) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return value;
  const [, y, mo, d] = match;
  return `${d}/${mo}/${y}`;
}

export function formatWallClockTime(value: string | null | undefined): string {
  if (!value) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(value.trim());
  if (!match) return value;
  const [, , , , h, mi] = match;
  return `${h}:${mi}`;
}

/** Ej: "Ruta del 12/08/2026 · iniciada 14:30" */
export function formatRutaTitle(iniciadaAt: string | null, createdAt: string): string {
  const ref = iniciadaAt ?? createdAt;
  const day = formatWallClockDay(ref);
  const time = formatWallClockTime(ref);
  if (!iniciadaAt) {
    return `Ruta del ${day} · creada ${time}`;
  }
  return `Ruta del ${day} · iniciada ${time}`;
}
