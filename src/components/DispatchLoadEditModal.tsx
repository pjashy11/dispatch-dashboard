"use client";

import { useEffect, useMemo, useState } from "react";
import type { DispatchLoad } from "@/lib/types";
import SearchableSelect from "./SearchableSelect";

interface DispatchLoadEditModalProps {
  load: DispatchLoad;
  onClose: () => void;
  onSave: (
    loadId: number,
    updates: { tankName?: string; dropoffName?: string; dropoffAccountName?: string }
  ) => Promise<void>;
}

export default function DispatchLoadEditModal({
  load,
  onClose,
  onSave,
}: DispatchLoadEditModalProps) {
  type SelectOption = { value: string; label: string };
  type DropoffAccountOption = { value: string; label: string; dropoffs: SelectOption[] };

  const [tank, setTank] = useState(load.tankName);
  const [dropoff, setDropoff] = useState(load.dropoffName);
  const [dropoffAccount, setDropoffAccount] = useState(load.dropoffAccountName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [tankOptions, setTankOptions] = useState<SelectOption[]>([]);
  const [dropoffAccounts, setDropoffAccounts] = useState<DropoffAccountOption[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadOptions = async () => {
      setLoadingOptions(true);
      setError("");

      try {
        const pickupParams = new URLSearchParams({ account: load.pickupAccountName });
        if (load.terminal) pickupParams.set("terminal", load.terminal);

        const dropoffParams = new URLSearchParams();
        if (load.terminal) dropoffParams.set("terminal", load.terminal);

        const [pickupResponse, dropoffResponse] = await Promise.all([
          fetch(`/api/pickups?${pickupParams.toString()}`),
          fetch(`/api/dropoffs?${dropoffParams.toString()}`),
        ]);
        const [pickupData, dropoffData] = await Promise.all([
          pickupResponse.json(),
          dropoffResponse.json(),
        ]);

        if (!pickupResponse.ok || pickupData.error) {
          throw new Error(pickupData.error || "Failed to load pickup options");
        }
        if (!dropoffResponse.ok || dropoffData.error) {
          throw new Error(dropoffData.error || "Failed to load dropoff options");
        }
        if (cancelled) return;

        const pickup = (pickupData.account?.pickups || []).find((item: any) => item.name === load.pickupName);
        const nextTankOptions: SelectOption[] = (pickup?.tanks || []).map((item: any) => ({
          value: item.tankNumber,
          label: item.tankNumber,
        }));

        const accountMap = new Map<string, DropoffAccountOption>();

        for (const account of dropoffData.accounts || []) {
          accountMap.set(account.name, {
            value: account.name,
            label: account.name,
            dropoffs: (account.dropoffs || []).map((item: any) => ({
              value: item.name,
              label: item.name,
            })),
          });
        }

        for (const defaultDropoff of pickup?.defaultDropoffs || []) {
          if (!defaultDropoff.accountName) continue;
          const existing = accountMap.get(defaultDropoff.accountName);
          if (existing) {
            if (!existing.dropoffs.some((item) => item.value === defaultDropoff.name)) {
              existing.dropoffs.push({ value: defaultDropoff.name, label: defaultDropoff.name });
              existing.dropoffs.sort((left, right) => left.label.localeCompare(right.label));
            }
            continue;
          }

          accountMap.set(defaultDropoff.accountName, {
            value: defaultDropoff.accountName,
            label: defaultDropoff.accountName,
            dropoffs: [{ value: defaultDropoff.name, label: defaultDropoff.name }],
          });
        }

        const nextDropoffAccounts: DropoffAccountOption[] = Array.from(accountMap.values()).sort((left, right) =>
          left.label.localeCompare(right.label)
        );

        setTankOptions(nextTankOptions);
        setDropoffAccounts(nextDropoffAccounts);

        if (
          nextTankOptions.length > 0 &&
          !nextTankOptions.some((option) => option.value === load.tankName)
        ) {
          setTank("");
        }

        const selectedAccount = nextDropoffAccounts.find((account) => account.value === load.dropoffAccountName);
        if (selectedAccount) {
          setDropoffAccount(selectedAccount.value);
          if (!selectedAccount.dropoffs.some((option) => option.value === load.dropoffName)) {
            setDropoff("");
          }
          return;
        }

        const inferredAccount = nextDropoffAccounts.find((account) =>
          account.dropoffs.some((option) => option.value === load.dropoffName)
        );
        setDropoffAccount(inferredAccount?.value || "");
        if (inferredAccount && !inferredAccount.dropoffs.some((option) => option.value === load.dropoffName)) {
          setDropoff("");
        }
      } catch (caughtError: unknown) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "Failed to load edit options");
        }
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    };

    loadOptions();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const availableDropoffs = useMemo(
    () => dropoffAccounts.find((account) => account.value === dropoffAccount)?.dropoffs || [],
    [dropoffAccount, dropoffAccounts]
  );

  useEffect(() => {
    if (!dropoffAccount) return;
    if (availableDropoffs.some((option) => option.value === dropoff)) return;
    setDropoff("");
  }, [availableDropoffs, dropoff, dropoffAccount]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave(load.id, {
        tankName: tank,
        dropoffName: dropoff,
        dropoffAccountName: dropoffAccount,
      });
      onClose();
    } catch (caughtError: unknown) {
      setError(caughtError instanceof Error ? caughtError.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-[360px] rounded-2xl border p-5 shadow-xl"
        style={{
          background: "var(--color-bg-secondary)",
          borderColor: "var(--color-border)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>
          Edit Load
        </h3>
        <p className="mb-4 text-xs" style={{ color: "var(--color-text-secondary)" }}>
          {load.pickupName} &rarr; {load.dropoffName}
          <span className="ml-2" style={{ color: "var(--color-text-muted)" }}>
            ({load.confirmationNo})
          </span>
        </p>

        <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
          Tank
        </label>
        <SearchableSelect
          value={tank}
          onChange={setTank}
          options={tankOptions}
          placeholder={loadingOptions ? "Loading tanks..." : "Select tank"}
          disabled={loadingOptions || tankOptions.length === 0}
          className="mb-3 w-full rounded-lg px-2 py-1.5 text-sm"
          style={{
            background: "var(--color-input-bg)",
            border: "1px solid var(--color-input-border)",
            color: "var(--color-text-primary)",
          }}
        />

        <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
          Drop Off Account
        </label>
        <SearchableSelect
          value={dropoffAccount}
          onChange={(value) => {
            setDropoffAccount(value);
            setDropoff("");
          }}
          options={dropoffAccounts.map((account) => ({ value: account.value, label: account.label }))}
          placeholder={loadingOptions ? "Loading accounts..." : "Select drop off account"}
          disabled={loadingOptions || dropoffAccounts.length === 0}
          className="mb-3 w-full rounded-lg px-2 py-1.5 text-sm"
          style={{
            background: "var(--color-input-bg)",
            border: "1px solid var(--color-input-border)",
            color: "var(--color-text-primary)",
          }}
        />

        <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
          Drop Off
        </label>
        <SearchableSelect
          value={dropoff}
          onChange={setDropoff}
          options={availableDropoffs}
          placeholder={loadingOptions ? "Loading dropoffs..." : dropoffAccount ? "Select drop off" : "Select account first"}
          disabled={loadingOptions || !dropoffAccount || availableDropoffs.length === 0}
          className="mb-4 w-full rounded-lg px-2 py-1.5 text-sm"
          style={{
            background: "var(--color-input-bg)",
            border: "1px solid var(--color-input-border)",
            color: "var(--color-text-primary)",
          }}
        />

        {error && <p className="mb-3 text-xs" style={{ color: "var(--color-danger)" }}>{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs"
            style={{
              border: "1px solid var(--color-input-border)",
              color: "var(--color-text-secondary)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loadingOptions || !tank || !dropoffAccount || !dropoff}
            className="rounded-lg px-3 py-1.5 text-xs text-white disabled:opacity-50"
            style={{
              background: "var(--color-accent)",
            }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
