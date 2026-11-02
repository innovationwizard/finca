/** Temporal workers do not earn séptimo. Voluntario and Fijo still do. */
export function earnsSeptimo(category: string): boolean {
  return category !== "TEMPORAL";
}
