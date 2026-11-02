export function cuadrillaLabel(row: {
  name: string;
  startDate: string;
  endDate: string | null;
}): string {
  return row.endDate
    ? `${row.name} · ${row.startDate} a ${row.endDate}`
    : `${row.name} · desde ${row.startDate}`;
}
