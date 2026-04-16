import { useMemo } from "react";
import type { Load } from "@/lib/types";

interface LoadSelectorParams {
  allLoads: Load[];
  showToday: boolean;
  showTomorrow: boolean;
  selectedAccounts: string[];
  selectedPickups: string[];
  selectedOperators: string[];
  selectedDropoffs: string[];
  showUrgentOnly: boolean;
}

interface LoadSelectorsResult {
  filteredLoads: Load[];
  availableAccounts: string[];
  availablePickups: string[];
  availableOperators: string[];
  availableDropoffs: string[];
  summary: {
    visible: number;
    urgent: number;
    overdue: number;
    today: number;
    tomorrow: number;
  };
}

function sortValues(values: Set<string>) {
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

export function useLoadSelectors({
  allLoads,
  showToday,
  showTomorrow,
  selectedAccounts,
  selectedPickups,
  selectedOperators,
  selectedDropoffs,
  showUrgentOnly,
}: LoadSelectorParams): LoadSelectorsResult {
  return useMemo(() => {
    const dayFilteredLoads = allLoads.filter((load) => {
      if (showToday && showTomorrow) return load.aging >= -1;
      if (showToday) return load.aging >= 0;
      if (showTomorrow) return load.aging === -1;
      return false;
    });

    const availableAccounts = new Set<string>();
    const availablePickups = new Set<string>();
    const availableOperators = new Set<string>();
    const availableDropoffs = new Set<string>();
    const filteredLoads: Load[] = [];
    const summary = {
      visible: 0,
      urgent: 0,
      overdue: 0,
      today: 0,
      tomorrow: 0,
    };

    for (const load of dayFilteredLoads) {
      const matchesAccount = selectedAccounts.length === 0 || selectedAccounts.includes(load.pickupAccountName);
      const matchesPickup = selectedPickups.length === 0 || selectedPickups.includes(load.pickupName);
      const matchesOperator = selectedOperators.length === 0 || selectedOperators.includes(load.pickupOperator);
      const matchesDropoff = selectedDropoffs.length === 0 || selectedDropoffs.includes(load.dropoffName);
      const matchesUrgent = !showUrgentOnly || load.isUrgent;

      if (matchesPickup && matchesOperator && matchesDropoff && matchesUrgent && load.pickupAccountName) {
        availableAccounts.add(load.pickupAccountName);
      }
      if (matchesAccount && matchesOperator && matchesDropoff && matchesUrgent && load.pickupName) {
        availablePickups.add(load.pickupName);
      }
      if (matchesAccount && matchesPickup && matchesDropoff && matchesUrgent && load.pickupOperator) {
        availableOperators.add(load.pickupOperator);
      }
      if (matchesAccount && matchesPickup && matchesOperator && matchesUrgent && load.dropoffName) {
        availableDropoffs.add(load.dropoffName);
      }

      if (!(matchesAccount && matchesPickup && matchesOperator && matchesDropoff && matchesUrgent)) {
        continue;
      }

      filteredLoads.push(load);
      summary.visible += 1;
      if (load.isUrgent) summary.urgent += 1;
      if (load.aging > 0) summary.overdue += 1;
      if (load.aging === 0) summary.today += 1;
      if (load.aging === -1) summary.tomorrow += 1;
    }

    return {
      filteredLoads,
      availableAccounts: sortValues(availableAccounts),
      availablePickups: sortValues(availablePickups),
      availableOperators: sortValues(availableOperators),
      availableDropoffs: sortValues(availableDropoffs),
      summary,
    };
  }, [
    allLoads,
    selectedAccounts,
    selectedDropoffs,
    selectedOperators,
    selectedPickups,
    showToday,
    showTomorrow,
    showUrgentOnly,
  ]);
}
