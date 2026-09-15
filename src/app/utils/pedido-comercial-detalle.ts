export type LineaPedidoComercial = {
  codigo: string;
  nombre: string;
  cantidad: number;
  /** Precio unitario sin IVA (captura vendedor). */
  precioSinIva: number | null;
  /** Cantidad que sí entró en Compact (solo facturista). */
  cantidadSurtida: number | null;
};

export function buildPedidoDetalle(
  lineas: LineaPedidoComercial[],
  notas: string,
): string {
  const lines = lineas.map((l) => {
    let line = `${l.codigo} x${l.cantidad} | ${l.nombre}`;
    if (l.precioSinIva != null && Number.isFinite(l.precioSinIva)) {
      line += ` | precio:${formatPrecio(l.precioSinIva)}`;
    }
    if (l.cantidadSurtida != null) {
      line += ` | surtido:${l.cantidadSurtida}`;
    }
    return line;
  });
  if (notas) {
    lines.push(`Notas: ${notas}`);
  }
  return lines.join('\n');
}

function formatPrecio(value: number): string {
  const n = Math.round(value * 100) / 100;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function parsePedidoDetalle(detalle: string | null): {
  lineas: LineaPedidoComercial[];
  notas: string;
} {
  if (!detalle?.trim()) return { lineas: [], notas: '' };
  const lineas: LineaPedidoComercial[] = [];
  let notas = '';
  for (const raw of detalle.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.toLowerCase().startsWith('notas:')) {
      notas = line.slice(6).trim();
      continue;
    }
    const match =
      /^(\S+)\s+x(\d+)\s*\|\s*(.+?)(?:\s*\|\s*precio:([\d.]+))?(?:\s*\|\s*surtido:(\d+))?$/i.exec(
        line,
      );
    if (match) {
      lineas.push({
        codigo: match[1] ?? '',
        cantidad: Number(match[2]) || 1,
        nombre: (match[3] ?? '').trim(),
        precioSinIva:
          match[4] !== undefined && match[4] !== ''
            ? Number(match[4])
            : null,
        cantidadSurtida: match[5] !== undefined ? Number(match[5]) : null,
      });
    }
  }
  return { lineas, notas };
}

/** Identidad de productos/cantidades/precio (ignora surtido). */
export function productFingerprint(lineas: LineaPedidoComercial[]): string {
  return lineas
    .map((l) => `${l.codigo}:${l.cantidad}:${l.precioSinIva ?? ''}`)
    .sort()
    .join('|');
}

/**
 * El pedido del vendedor manda: se conservan código/nombre/cantidad/precio del servidor
 * y solo se aplica el surtido del borrador del facturista.
 */
export function mergeSurtidoOntoLineas(
  serverLineas: LineaPedidoComercial[],
  draftLineas: LineaPedidoComercial[],
): LineaPedidoComercial[] {
  const surtidoByCode = new Map(
    draftLineas.map((l) => [l.codigo, l.cantidadSurtida]),
  );
  return serverLineas.map((l) => ({
    ...l,
    cantidadSurtida: surtidoByCode.has(l.codigo)
      ? (surtidoByCode.get(l.codigo) ?? null)
      : (l.cantidadSurtida ?? null),
  }));
}

export function formatLineasResumen(lineas: LineaPedidoComercial[]): string {
  if (lineas.length === 0) return '(sin productos)';
  return lineas
    .map((l) => {
      const precio =
        l.precioSinIva != null ? ` · $${formatPrecio(l.precioSinIva)} s/IVA` : '';
      return `• ${l.codigo} x${l.cantidad} — ${l.nombre}${precio}`;
    })
    .join('\n');
}

export function formatPrecioDisplay(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `$${formatPrecio(value)}`;
}
