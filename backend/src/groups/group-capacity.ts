import type { LabourGroup } from './labour-group.entity';

export function labourGroupCapacity(group: Pick<LabourGroup, 'availableMemberNames' | 'memberNames'> | null | undefined): number {
  if (!group) return 1;
  return (group.availableMemberNames ?? group.memberNames).length + 1;
}

export function labourAvailabilityCapacity(capacities: Record<string, number> | null | undefined, date: string): number {
  const capacity = capacities?.[date];
  return typeof capacity === 'number' && Number.isInteger(capacity) && capacity >= 1 ? capacity : 1;
}

export function labourAvailabilityRangeCapacity(
  capacities: Record<string, number> | null | undefined,
  dates: string[],
  fallback = 1,
): number {
  return dates.length ? Math.min(...dates.map((date) => labourAvailabilityCapacity(capacities, date))) : fallback;
}
