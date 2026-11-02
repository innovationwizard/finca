export const WORKER_CATEGORIES = ["VOLUNTARIO", "FIJO", "TEMPORAL"] as const;
export type WorkerCategoryValue = (typeof WORKER_CATEGORIES)[number];

export function categoryLabel(category: string): string {
  switch (category) {
    case "FIJO":
      return "Fijo";
    case "TEMPORAL":
      return "Temporal";
    case "VOLUNTARIO":
      return "Voluntario";
    default:
      return category;
  }
}

export function categoryShort(category: string): string {
  switch (category) {
    case "FIJO":
      return "Fijo";
    case "TEMPORAL":
      return "Temp.";
    case "VOLUNTARIO":
      return "Vol.";
    default:
      return category;
  }
}
