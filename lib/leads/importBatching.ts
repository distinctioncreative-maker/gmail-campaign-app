export const LEAD_IMPORT_BATCH_SIZE = 200;

export function batchLeadImport<T>(items: T[]): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += LEAD_IMPORT_BATCH_SIZE) {
    batches.push(items.slice(index, index + LEAD_IMPORT_BATCH_SIZE));
  }
  return batches;
}
