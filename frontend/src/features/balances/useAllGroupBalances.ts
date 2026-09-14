import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "../../services/api";
import { getGroupBalances, type GroupBalances } from "./api/balancesApi";
import { listGroups, type PublicGroup } from "../groups/api/groupsApi";

export interface GroupBalancesEntry {
  group: PublicGroup;
  balances: GroupBalances;
}

export interface AllGroupBalancesState {
  entries: GroupBalancesEntry[] | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** All balances for every group the current user actively belongs to. */
export function useAllGroupBalances(): AllGroupBalancesState {
  const [entries, setEntries] = useState<GroupBalancesEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setEntries(null);
    try {
      const groups = await listGroups();
      const active = groups.filter((group) => group.myStatus === "active");
      const result = await Promise.all(
        active.map(async (group): Promise<GroupBalancesEntry> => ({
          group,
          balances: await getGroupBalances(group.id),
        })),
      );
      setEntries(result);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { entries, error, loading: !entries && !error, reload: () => void load() };
}