"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import type { Terminal, Scenario, Load } from "@/lib/types";
import SearchableSelect from "./SearchableSelect";

const RouteMap = dynamic(() => import("./RouteMap"), { ssr: false });

interface LoadFormProps {
  terminals: Terminal[];
  scenarios: Scenario[];
  lastTerminal: string;
  accountsByTerminal: Record<string, string[]>;
  existingLoad: Load | null;
  onCreated: (lastTerminal: string) => void;
  onCancel: () => void;
  onLoadUpdated?: () => void;
  userName?: string;
}

interface DefaultDropoff {
  id: number;
  name: string;
  accountName: string;
  accountId: number | null;
}

interface PickupOption {
  id: number;
  name: string;
  operator: string;
  tanks: { id: number; tankNumber: string; capacity: number }[];
  defaultDropoffs: DefaultDropoff[];
}

interface LoadEntry {
  confirmationNo: string;
}

interface SplitPickup {
  pickupName: string;
  tankNumber: string;
}

function toApiDate(isoDate: string): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  return `${m}/${d}/${y}`;
}

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getTomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Client-side caches — persist across re-renders and form open/close
const pickupDataCache: Record<string, PickupOption[]> = {};
const dropoffDataCache: Record<string, { id: number; name: string; dropoffs: { id: number; name: string }[] }[]> = {};

function pickupCacheKey(account: string, terminal: string) {
  return `${account}||${terminal}`;
}

function fromApiDate(apiDate: string): string {
  if (!apiDate) return "";
  const [m, d, y] = apiDate.split("/");
  if (!m || !d || !y) return apiDate;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export default function LoadForm({
  terminals,
  scenarios,
  lastTerminal,
  accountsByTerminal,
  existingLoad,
  onCreated,
  onCancel,
  onLoadUpdated,
  userName,
}: LoadFormProps) {
  // Form state
  const [terminalName, setTerminalName] = useState(lastTerminal || "");
  const [pickupAccountName, setPickupAccountName] = useState("");
  const [pickupOptions, setPickupOptions] = useState<PickupOption[]>([]);
  const [loadingPickups, setLoadingPickups] = useState(false);
  const [selectedPickupName, setSelectedPickupName] = useState("");
  const [selectedTankNumber, setSelectedTankNumber] = useState("");
  const [dropoffAccountName, setDropoffAccountName] = useState("");
  const [dropoffName, setDropoffName] = useState("");
  const [isUrgent, setIsUrgent] = useState(false);
  const [loadInstructions, setLoadInstructions] = useState("");
  const [dayToggle, setDayToggle] = useState<"tomorrow" | "today">("tomorrow");
  const [requestedPickupDate, setRequestedPickupDate] = useState(getTomorrowStr());
  const [entries, setEntries] = useState<LoadEntry[]>([{ confirmationNo: "" }]);

  // All dropoff accounts and their dropoffs (fetched once)
  const [allDropoffAccounts, setAllDropoffAccounts] = useState<
    { id: number; name: string; dropoffs: { id: number; name: string }[] }[]
  >([]);
  const [loadingDropoffs, setLoadingDropoffs] = useState(false);
  const [manualLoadedMiles, setManualLoadedMiles] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState(0);
  const [createdConfirmations, setCreatedConfirmations] = useState<string[]>([]);
  const [showSnackbar, setShowSnackbar] = useState(false);

  // Edit mode state for existing loads
  const [isEditing, setIsEditing] = useState(false);
  const [editPickupDate, setEditPickupDate] = useState("");
  const [editPickupName, setEditPickupName] = useState("");
  const [editTankNumber, setEditTankNumber] = useState("");
  const [editDropoffAccountName, setEditDropoffAccountName] = useState("");
  const [editDropoffName, setEditDropoffName] = useState("");
  const [editInstructions, setEditInstructions] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState(false);

  // Edit mode dropdown data
  const [editPickupOptions, setEditPickupOptions] = useState<PickupOption[]>([]);
  const [editLoadingPickups, setEditLoadingPickups] = useState(false);
  const [editDropoffAccounts, setEditDropoffAccounts] = useState<
    { id: number; name: string; dropoffs: { id: number; name: string }[] }[]
  >([]);
  const [editLoadingDropoffs, setEditLoadingDropoffs] = useState(false);

  // Derived: selected pickup's tanks in edit mode
  const editSelectedPickup = useMemo(
    () => editPickupOptions.find((p) => p.name === editPickupName) || null,
    [editPickupOptions, editPickupName]
  );
  const editTankOptions = editSelectedPickup?.tanks || [];

  // Derived: dropoff names for selected dropoff account in edit mode
  const editDropoffAccountOptions = useMemo(
    () => editDropoffAccounts.map((a) => a.name).sort(),
    [editDropoffAccounts]
  );
  const editDropoffNameOptions = useMemo(() => {
    if (!editDropoffAccountName) return [];
    const acct = editDropoffAccounts.find((a) => a.name === editDropoffAccountName);
    return acct ? acct.dropoffs.map((d) => d.name).sort() : [];
  }, [editDropoffAccountName, editDropoffAccounts]);

  // Initialize edit fields and fetch dropdown data when entering edit mode
  const enterEditMode = async () => {
    if (!existingLoad) return;
    setEditPickupDate(fromApiDate(existingLoad.requestedPickupDate));
    setEditPickupName(existingLoad.pickupName);
    setEditTankNumber(existingLoad.tankName);
    setEditDropoffAccountName(existingLoad.dropoffAccountName);
    setEditDropoffName(existingLoad.dropoffName);
    setEditInstructions(existingLoad.loadInstructions || "");
    setIsEditing(true);
    setError(null);
    setEditSuccess(null);

    // Fetch pickups for this load's account (use client cache)
    if (existingLoad.pickupAccountName) {
      const cKey = pickupCacheKey(existingLoad.pickupAccountName, existingLoad.terminal);
      const cached = pickupDataCache[cKey];
      if (cached) {
        setEditPickupOptions(cached);
      } else {
        setEditLoadingPickups(true);
        try {
          const params = new URLSearchParams({ account: existingLoad.pickupAccountName });
          if (existingLoad.terminal) params.set("terminal", existingLoad.terminal);
          const res = await fetch(`/api/pickups?${params}`);
          const data = await res.json();
          const pickups: PickupOption[] = (data.account?.pickups || []).map(
            (p: any) => ({
              id: p.id,
              name: p.name,
              operator: p.operator,
              tanks: p.tanks || [],
              defaultDropoffs: p.defaultDropoffs || [],
            })
          );
          pickupDataCache[cKey] = pickups;
          setEditPickupOptions(pickups);
        } catch {
          setEditPickupOptions([]);
        } finally {
          setEditLoadingPickups(false);
        }
      }
    }

    // Fetch dropoffs (use client cache)
    const dKey = `dropoff||${existingLoad.terminal}`;
    const cachedDropoffs = dropoffDataCache[dKey];
    if (cachedDropoffs) {
      setEditDropoffAccounts(cachedDropoffs);
    } else {
      setEditLoadingDropoffs(true);
      try {
        const params = new URLSearchParams();
        if (existingLoad.terminal) params.set("terminal", existingLoad.terminal);
        const res = await fetch(`/api/dropoffs?${params}`);
        const data = await res.json();
        const accounts = data.accounts || [];
        dropoffDataCache[dKey] = accounts;
        setEditDropoffAccounts(accounts);
      } catch {
        setEditDropoffAccounts([]);
      } finally {
        setEditLoadingDropoffs(false);
      }
    }
  };

  // When edit pickup changes, reset tank
  const handleEditPickupChange = (name: string) => {
    setEditPickupName(name);
    setEditTankNumber("");
  };

  const handleSaveEdit = async () => {
    if (!existingLoad) return;
    setEditSubmitting(true);
    setError(null);
    setEditSuccess(null);
    try {
      const payload: Record<string, unknown> = {
        billOfLadingNumber: existingLoad.bolNumber,
      };
      if (editPickupDate !== fromApiDate(existingLoad.requestedPickupDate)) {
        payload.requestedPickUpDate = toApiDate(editPickupDate);
        payload.requestedDropOffDate = toApiDate(editPickupDate);
      }
      if (editPickupName !== existingLoad.pickupName) {
        payload.pickUpName = editPickupName;
      }
      if (editTankNumber !== existingLoad.tankName) {
        payload.pickUpTankNumber = editTankNumber;
      }
      if (editDropoffName !== existingLoad.dropoffName) {
        payload.dropOffName = editDropoffName;
      }
      if (editDropoffAccountName !== existingLoad.dropoffAccountName) {
        payload.dropOffAccountName = editDropoffAccountName;
      }
      if (editInstructions !== (existingLoad.loadInstructions || "")) {
        payload.dispatcherComments = editInstructions;
      }

      const res = await fetch("/api/loads/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Failed to update load");
        return;
      }
      setEditSuccess("Load updated successfully");
      setIsEditing(false);
      onLoadUpdated?.();
    } catch (err: any) {
      setError(err.message || "Failed to update load");
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleCancelLoad = async () => {
    if (!existingLoad) return;
    setEditSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/loads/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cancel",
          loadId: existingLoad.id,
          billOfLadingNumber: existingLoad.bolNumber,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Failed to cancel load");
        return;
      }
      onLoadUpdated?.();
      onCancel();
    } catch (err: any) {
      setError(err.message || "Failed to cancel load");
    } finally {
      setEditSubmitting(false);
    }
  };

  // Account options for selected terminal
  const accountOptions = useMemo(
    () => accountsByTerminal[terminalName] || [],
    [accountsByTerminal, terminalName]
  );

  // When terminal changes, reset downstream
  const handleTerminalChange = (name: string) => {
    setTerminalName(name);
    setPickupAccountName("");
    setPickupOptions([]);
    setSelectedPickupName("");
    setSelectedTankNumber("");
    setDropoffAccountName("");
    setDropoffName("");
  };

  // When account changes, reset downstream and fetch pickups
  const handleAccountChange = (name: string) => {
    setPickupAccountName(name);
    setSelectedPickupName("");
    setSelectedTankNumber("");
    setDropoffAccountName("");
    setDropoffName("");
    if (name) fetchPickupsForAccount(name);
    else setPickupOptions([]);
  };

  // Selected pickup's full data
  const selectedPickup = useMemo(
    () => pickupOptions.find((p) => p.name === selectedPickupName) || null,
    [pickupOptions, selectedPickupName]
  );

  // Tanks from selected pickup
  const tankOptions = selectedPickup?.tanks || [];

  // Fetch dropoff accounts filtered by terminal (client + server cache)
  useEffect(() => {
    const cKey = `dropoff||${terminalName}`;
    const cached = dropoffDataCache[cKey];
    if (cached) {
      setAllDropoffAccounts(cached);
      return;
    }
    setLoadingDropoffs(true);
    const params = new URLSearchParams();
    if (terminalName) params.set("terminal", terminalName);
    fetch(`/api/dropoffs?${params}`)
      .then((r) => r.json())
      .then((data) => {
        const accounts = data.accounts || [];
        dropoffDataCache[cKey] = accounts;
        setAllDropoffAccounts(accounts);
      })
      .catch(console.error)
      .finally(() => setLoadingDropoffs(false));
  }, [terminalName]);

  // Dropoff account options — all accounts from the cached dropoff data
  const dropoffAccountOptions = useMemo(() => {
    return allDropoffAccounts.map((a) => a.name).sort();
  }, [allDropoffAccounts]);

  // Dropoff name options filtered by selected account
  const dropoffNameOptions = useMemo(() => {
    if (!dropoffAccountName) return [];
    const acct = allDropoffAccounts.find((a) => a.name === dropoffAccountName);
    if (!acct) return [];
    return acct.dropoffs.map((d) => d.name).sort();
  }, [dropoffAccountName, allDropoffAccounts]);

  // Build a lookup map for O(1) scenario matching (10k+ scenarios)
  const scenarioMap = useMemo(() => {
    const map = new Map<string, Scenario>();
    for (const s of scenarios) {
      if (s.pickUpName && s.dropOffName) {
        map.set(`${s.pickUpName.toUpperCase()}||${s.dropOffName.toUpperCase()}`, s);
      }
    }
    return map;
  }, [scenarios]);

  // Find scenario for loaded miles
  const matchedScenario = useMemo(() => {
    if (!selectedPickupName || !dropoffName) return null;
    return scenarioMap.get(`${selectedPickupName.toUpperCase()}||${dropoffName.toUpperCase()}`) || null;
  }, [scenarioMap, selectedPickupName, dropoffName]);

  const scenarioLoadedMiles = matchedScenario?.loadedMiles ?? null;
  // Effective loaded miles: scenario value if exists, otherwise manual entry
  const effectiveLoadedMiles = scenarioLoadedMiles ?? (manualLoadedMiles ? Number(manualLoadedMiles) : null);

  const [splitPickups, setSplitPickups] = useState<SplitPickup[]>([]);

  // Sync day toggle → date
  useEffect(() => {
    if (dayToggle === "today") {
      setRequestedPickupDate(getTodayStr());
    } else {
      setRequestedPickupDate(getTomorrowStr());
    }
  }, [dayToggle]);

  // When date changes manually, update toggle
  const handleDateChange = (val: string) => {
    const today = getTodayStr();
    const tomorrow = getTomorrowStr();
    if (val < today) return; // Prevent past dates
    setRequestedPickupDate(val);
    if (val === today) setDayToggle("today");
    else if (val === tomorrow) setDayToggle("tomorrow");
  };

  // Fetch pickups when account changes (client + server cache)
  const fetchPickupsForAccount = useCallback(async (accountName: string) => {
    if (!accountName) {
      setPickupOptions([]);
      return;
    }
    const cKey = pickupCacheKey(accountName, terminalName);
    const cached = pickupDataCache[cKey];
    if (cached) {
      setPickupOptions(cached);
      return;
    }
    setLoadingPickups(true);
    try {
      const params = new URLSearchParams({ account: accountName });
      if (terminalName) params.set("terminal", terminalName);
      const res = await fetch(`/api/pickups?${params}`);
      const data = await res.json();
      const pickups: PickupOption[] = (data.account?.pickups || []).map(
        (p: any) => ({
          id: p.id,
          name: p.name,
          operator: p.operator,
          tanks: p.tanks || [],
          defaultDropoffs: p.defaultDropoffs || [],
        })
      );
      pickupDataCache[cKey] = pickups;
      setPickupOptions(pickups);
    } catch (err) {
      console.error("Failed to fetch pickups:", err);
      setPickupOptions([]);
    } finally {
      setLoadingPickups(false);
    }
  }, [terminalName]);

  // When pickup changes, set default dropoff from its defaultDropOffList
  // Resolve account name client-side against active dropoff data
  const handlePickupChange = (pickupName: string) => {
    setSelectedPickupName(pickupName);
    setSelectedTankNumber("");
    setManualLoadedMiles("");

    const pickup = pickupOptions.find((p) => p.name === pickupName);
    if (pickup && pickup.defaultDropoffs.length > 0) {
      const defaultDrop = pickup.defaultDropoffs[0];
      let acctName = defaultDrop.accountName || "";
      const dropName = defaultDrop.name || "";

      // If no account name from API, resolve against active dropoff accounts
      if (!acctName && dropName) {
        for (const acct of allDropoffAccounts) {
          if (acct.dropoffs.some((d) => d.name.toUpperCase() === dropName.toUpperCase())) {
            acctName = acct.name;
            break;
          }
        }
      }

      setDropoffAccountName(acctName);
      setDropoffName(dropName);
    } else {
      setDropoffAccountName("");
      setDropoffName("");
    }
  };

  const addSplitPickup = () => {
    if (splitPickups.length >= 5) return;
    setSplitPickups((prev) => [...prev, { pickupName: "", tankNumber: "" }]);
  };

  const removeSplitPickup = (idx: number) => {
    setSplitPickups((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateSplitPickup = (idx: number, field: keyof SplitPickup, value: string) => {
    setSplitPickups((prev) =>
      prev.map((sp, i) => {
        if (i !== idx) return sp;
        const updated = { ...sp, [field]: value };
        if (field === "pickupName") updated.tankNumber = "";
        return updated;
      })
    );
  };

  // Multi-load entries
  const addEntry = () => setEntries((prev) => [...prev, { confirmationNo: "" }]);
  const removeEntry = (idx: number) => {
    if (entries.length <= 1) return;
    setEntries((prev) => prev.filter((_, i) => i !== idx));
  };
  const updateEntry = (idx: number, confirmationNo: string) => {
    setEntries((prev) =>
      prev.map((e, i) => (i === idx ? { confirmationNo } : e))
    );
  };

  // Submit
  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    setSuccessCount(0);
    setCreatedConfirmations([]);
    setShowSnackbar(false);

    try {
      let created = 0;
      const confirmations: string[] = [];
      for (const entry of entries) {
        const payload: Record<string, unknown> = {
          pickUpAccountName: pickupAccountName,
          pickUpName: selectedPickupName,
          pickUpTankNumber: selectedTankNumber || undefined,
          dropOffAccountName: dropoffAccountName || undefined,
          dropOffName: dropoffName || undefined,
          useDefaultDropoff: !dropoffName,
          requestedPickUpDate: toApiDate(requestedPickupDate),
          requestedDropOffDate: toApiDate(requestedPickupDate),
          loadedMiles: effectiveLoadedMiles || undefined,
          averageSpeed: matchedScenario?.averageSpeed || 65,
          isUrgent,
          dispatcherComments: loadInstructions || undefined,
        };

        if (entry.confirmationNo) {
          payload.confirmationNumber = entry.confirmationNo;
        }

        // Split pickups (indices 2-6)
        splitPickups.forEach((sp, i) => {
          const idx = i + 2;
          if (sp.pickupName) payload[`pickUpName${idx}`] = sp.pickupName;
          if (sp.tankNumber) payload[`pickUpTankNumber${idx}`] = sp.tankNumber;
        });

        const res = await fetch("/api/loads/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok || data.error) {
          setError(
            `Load ${created + 1} failed: ${data.error || "Unknown error"}`
          );
          break;
        }
        created++;
        setSuccessCount(created);
        if (data.confirmation) {
          confirmations.push(data.confirmation);
        }
      }

      if (created === entries.length) {
        setCreatedConfirmations(confirmations);
        // Auto-copy confirmation numbers to clipboard
        if (confirmations.length > 0) {
          const clipboardText = confirmations.join(", ");
          try {
            await navigator.clipboard.writeText(clipboardText);
          } catch {
            // Clipboard write may fail in some contexts, ignore
          }
          setShowSnackbar(true);
        }
        setTimeout(() => {
          onCreated(terminalName);
        }, 4000);
      }
    } catch (err: any) {
      setError(err.message || "Failed to create load");
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    pickupAccountName && selectedPickupName && selectedTankNumber && requestedPickupDate && !submitting &&
    (scenarioLoadedMiles != null || manualLoadedMiles !== "");

  const isViewing = existingLoad !== null;
  const title = isViewing
    ? `${existingLoad.pickupName} → ${existingLoad.dropoffName} - ${existingLoad.confirmationNo}`
    : "New Load";

  const inputClass =
    "w-full rounded px-3 py-2 text-base focus:outline-none focus:ring-1 focus:ring-blue-500";
  const inputStyle = {
    background: "var(--color-input-bg)",
    border: "1px solid var(--color-input-border)",
    color: "var(--color-text-primary)",
  };
  const labelClass = "block text-sm mb-1";
  const labelStyle = { color: "var(--color-text-secondary)" };
  const sectionHeaderClass = "text-sm font-semibold uppercase tracking-wide";

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--color-bg-secondary)" }}>
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{
          background: "var(--color-bg-secondary)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div>
          <h2 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
            {title}
          </h2>
          {userName && (
            <div className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
              Working as {userName}
            </div>
          )}
        </div>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm font-medium rounded transition-colors hover:bg-red-600/20 hover:text-red-400"
          style={{
            color: "var(--color-text-primary)",
            border: "1px solid var(--color-input-border)",
            background: "var(--color-input-bg)",
          }}
        >
          ✕ Close
        </button>
      </div>

      {successCount > 0 && (
        <div
          className="mx-4 mt-3 px-3 py-2 rounded text-sm"
          style={{
            background: "rgba(34,197,94,0.15)",
            border: "1px solid rgba(34,197,94,0.4)",
            color: "rgb(134,239,172)",
          }}
        >
          {successCount === entries.length
            ? `${successCount} load${successCount > 1 ? "s" : ""} created successfully!`
            : `${successCount}/${entries.length} loads created...`}
        </div>
      )}

      {error && (
        <div
          className="mx-4 mt-3 px-3 py-2 rounded text-sm"
          style={{
            background: "rgba(239,68,68,0.15)",
            border: "1px solid rgba(239,68,68,0.4)",
            color: "rgb(252,165,165)",
          }}
        >
          {error}
        </div>
      )}

      {/* Form body */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* View / Edit mode */}
        {isViewing && !isEditing && (
          <div className="space-y-3">
            {editSuccess && (
              <div
                className="px-3 py-2 rounded text-sm"
                style={{
                  background: "rgba(34,197,94,0.15)",
                  border: "1px solid rgba(34,197,94,0.4)",
                  color: "rgb(134,239,172)",
                }}
              >
                {editSuccess}
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <InfoField label="BOL #" value={existingLoad.bolNumber} />
              <InfoField label="Confirmation #" value={existingLoad.confirmationNo} />
              <InfoField label="Terminal" value={existingLoad.terminal} />
              <InfoField label="PU Account" value={existingLoad.pickupAccountName} />
              <InfoField label="DO Account" value={existingLoad.dropoffAccountName} />
              <InfoField label="Pickup Name" value={existingLoad.pickupName} />
              <InfoField label="Drop Off" value={existingLoad.dropoffName} />
              <InfoField label="Operator" value={existingLoad.pickupOperator} />
              <InfoField label="Tank" value={existingLoad.tankName} />
              <InfoField label="Loaded Miles" value={existingLoad.loadedMiles != null ? String(existingLoad.loadedMiles) : ""} />
              <InfoField label="Commodity" value={existingLoad.commodity} />
              <InfoField label="Req. Pickup Date" value={existingLoad.requestedPickupDate || ""} />
              <InfoField label="Asgn. Pickup Date" value={existingLoad.assignedPickupDate || ""} />
              <InfoField label="Urgent" value={existingLoad.isUrgent ? "Yes" : "No"} />
              <InfoField label="Instructions" value={existingLoad.loadInstructions || ""} />
              <InfoField label="Age (days)" value={String(existingLoad.aging)} />
            </div>

            {/* Route map */}
            <RouteMap load={existingLoad} />

            {/* Edit / Cancel buttons */}
            {(existingLoad.status === "OPEN" || existingLoad.status === "ASSIGNED" || existingLoad.status === "ONGOING") && (
              <div className="flex items-center gap-3 pt-2" style={{ borderTop: "1px solid var(--color-border)" }}>
                <button
                  onClick={enterEditMode}
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                >
                  Edit Load
                </button>
                {!cancelConfirm ? (
                  <button
                    onClick={() => setCancelConfirm(true)}
                    className="px-4 py-2 text-sm bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded transition-colors"
                    style={{ border: "1px solid rgba(239,68,68,0.4)" }}
                  >
                    Cancel Load
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-red-400">Are you sure?</span>
                    <button
                      onClick={handleCancelLoad}
                      disabled={editSubmitting}
                      className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-500 text-white rounded transition-colors disabled:opacity-50"
                    >
                      {editSubmitting ? "Cancelling..." : "Yes, Cancel"}
                    </button>
                    <button
                      onClick={() => setCancelConfirm(false)}
                      className="px-3 py-1.5 text-sm rounded transition-colors"
                      style={{
                        background: "var(--color-input-bg)",
                        border: "1px solid var(--color-input-border)",
                        color: "var(--color-text-primary)",
                      }}
                    >
                      No
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Edit mode for existing load */}
        {isViewing && isEditing && (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <InfoField label="BOL #" value={existingLoad.bolNumber} />
              <InfoField label="Confirmation #" value={existingLoad.confirmationNo} />
              <InfoField label="Terminal" value={existingLoad.terminal} />
              <InfoField label="PU Account" value={existingLoad.pickupAccountName} />
            </div>

            <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "12px" }} />

            <div>
              <label className={labelClass} style={labelStyle}>
                Requested Pickup Date
              </label>
              <input
                type="date"
                value={editPickupDate}
                min={getTodayStr()}
                onChange={(e) => setEditPickupDate(e.target.value)}
                className={inputClass}
                style={{ ...inputStyle, maxWidth: "220px" }}
              />
            </div>

            <div>
              <label className={labelClass} style={labelStyle}>
                Pickup Name
              </label>
              {editLoadingPickups ? (
                <div className="flex items-center gap-2 text-base py-1.5" style={{ color: "var(--color-text-muted)" }}>
                  <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  Loading...
                </div>
              ) : (
                <SearchableSelect
                  value={editPickupName}
                  onChange={handleEditPickupChange}
                  options={[
                    ...editPickupOptions.map((p) => ({ value: p.name, label: p.name })),
                    ...(editPickupName && !editPickupOptions.some((p) => p.name === editPickupName)
                      ? [{ value: editPickupName, label: editPickupName }]
                      : []),
                  ]}
                  placeholder="Select Pickup"
                  className={inputClass}
                  style={inputStyle}
                />
              )}
            </div>

            <div style={{ maxWidth: "160px" }}>
              <label className={labelClass} style={labelStyle}>
                Tank
              </label>
              <SearchableSelect
                value={editTankNumber}
                onChange={setEditTankNumber}
                disabled={editTankOptions.length === 0 && !editTankNumber}
                options={[
                  ...editTankOptions.map((t) => ({ value: t.tankNumber, label: t.tankNumber })),
                  ...(editTankNumber && !editTankOptions.some((t) => t.tankNumber === editTankNumber)
                    ? [{ value: editTankNumber, label: editTankNumber }]
                    : []),
                ]}
                placeholder={editTankOptions.length === 0 ? "No tanks" : "Select Tank"}
                className={`${inputClass} disabled:opacity-50`}
                style={inputStyle}
              />
            </div>

            <div>
              <label className={labelClass} style={labelStyle}>
                Drop Off Account
              </label>
              {editLoadingDropoffs ? (
                <div className="flex items-center gap-2 text-base py-1.5" style={{ color: "var(--color-text-muted)" }}>
                  <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  Loading...
                </div>
              ) : (
                <SearchableSelect
                  value={editDropoffAccountName}
                  onChange={(v) => {
                    setEditDropoffAccountName(v);
                    setEditDropoffName("");
                  }}
                  options={[
                    ...editDropoffAccountOptions.map((name) => ({ value: name, label: name })),
                    ...(editDropoffAccountName && !editDropoffAccountOptions.includes(editDropoffAccountName)
                      ? [{ value: editDropoffAccountName, label: editDropoffAccountName }]
                      : []),
                  ]}
                  placeholder="Select Account"
                  className={inputClass}
                  style={inputStyle}
                />
              )}
            </div>

            <div>
              <label className={labelClass} style={labelStyle}>
                Drop Off Name
              </label>
              <SearchableSelect
                value={editDropoffName}
                onChange={setEditDropoffName}
                disabled={!editDropoffAccountName}
                options={[
                  ...editDropoffNameOptions.map((name) => ({ value: name, label: name })),
                  ...(editDropoffName && !editDropoffNameOptions.includes(editDropoffName)
                    ? [{ value: editDropoffName, label: editDropoffName }]
                    : []),
                ]}
                placeholder={!editDropoffAccountName ? "Select account first" : "Select Drop Off"}
                className={`${inputClass} disabled:opacity-50`}
                style={inputStyle}
              />
            </div>

            <div>
              <label className={labelClass} style={labelStyle}>
                Load Instructions
              </label>
              <textarea
                value={editInstructions}
                onChange={(e) => setEditInstructions(e.target.value)}
                rows={3}
                className={`${inputClass} resize-y`}
                style={inputStyle}
              />
            </div>

            <div className="flex items-center gap-3 pt-2" style={{ borderTop: "1px solid var(--color-border)" }}>
              <button
                onClick={handleSaveEdit}
                disabled={editSubmitting}
                className="px-4 py-2 text-sm bg-green-600 hover:bg-green-500 text-white rounded transition-colors disabled:opacity-50"
              >
                {editSubmitting ? "Saving..." : "Save Changes"}
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setError(null);
                }}
                className="px-4 py-2 text-sm rounded transition-colors"
                style={{
                  background: "var(--color-input-bg)",
                  border: "1px solid var(--color-input-border)",
                  color: "var(--color-text-primary)",
                }}
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {/* Create mode */}
        {!isViewing && (
          <>
            {/* Day toggle + Req Pickup Date */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setDayToggle("today")}
                className="rounded px-4 py-2 text-base transition-colors"
                style={{
                  background: dayToggle === "today" ? "var(--color-accent, #3b82f6)" : "var(--color-input-bg)",
                  border: `1px solid ${dayToggle === "today" ? "var(--color-accent, #3b82f6)" : "var(--color-input-border)"}`,
                  color: dayToggle === "today" ? "#fff" : "var(--color-text-primary)",
                }}
              >
                Today
              </button>
              <button
                onClick={() => setDayToggle("tomorrow")}
                className="rounded px-4 py-2 text-base transition-colors"
                style={{
                  background: dayToggle === "tomorrow" ? "var(--color-accent, #3b82f6)" : "var(--color-input-bg)",
                  border: `1px solid ${dayToggle === "tomorrow" ? "var(--color-accent, #3b82f6)" : "var(--color-input-border)"}`,
                  color: dayToggle === "tomorrow" ? "#fff" : "var(--color-text-primary)",
                }}
              >
                Tomorrow
              </button>
              <div className="flex-1">
                <input
                  type="date"
                  value={requestedPickupDate}
                  min={getTodayStr()}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Terminal + PU Account on same line */}
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className={labelClass} style={labelStyle}>
                  Terminal *
                </label>
                <SearchableSelect
                  value={terminalName}
                  onChange={handleTerminalChange}
                  options={terminals.map((t) => ({ value: t.name, label: t.name }))}
                  placeholder="Select Terminal"
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>
                  Pickup Account *
                </label>
                <SearchableSelect
                  value={pickupAccountName}
                  onChange={handleAccountChange}
                  disabled={!terminalName}
                  options={accountOptions.map((name) => ({ value: name, label: name }))}
                  placeholder={
                    !terminalName
                      ? "Select terminal first"
                      : accountOptions.length === 0
                      ? "No accounts found"
                      : "Select Account"
                  }
                  className={`${inputClass} disabled:opacity-50`}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "12px" }} />

            {/* Two-column: Pickup (left) | Drop Off (right) */}
            <div className="grid gap-4 lg:grid-cols-[1fr_1px_1fr]">
              {/* LEFT: Pickup */}
              <div className="space-y-3">
                <h3
                  className={sectionHeaderClass}
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  Pickup
                </h3>

                {/* Pickup Name 1 */}
                <div>
                  <div>
                    <label className={labelClass} style={labelStyle}>
                      {splitPickups.length > 0 ? "Pickup Name 1 *" : "Pickup Name *"}
                    </label>
                    {loadingPickups ? (
                      <div className="flex items-center gap-2 text-base py-1.5" style={{ color: "var(--color-text-muted)" }}>
                        <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                        Loading...
                      </div>
                    ) : (
                      <SearchableSelect
                        value={selectedPickupName}
                        onChange={handlePickupChange}
                        disabled={!pickupAccountName || pickupOptions.length === 0}
                        options={pickupOptions.map((p) => ({ value: p.name, label: p.name }))}
                        placeholder={
                          !pickupAccountName
                            ? "Select account first"
                            : pickupOptions.length === 0
                            ? "No pickups found"
                            : "Select Pickup"
                        }
                        className={`${inputClass} disabled:opacity-50`}
                        style={inputStyle}
                      />
                    )}
                  </div>

                </div>

                <div style={{ maxWidth: "160px" }}>
                  <label className={labelClass} style={labelStyle}>
                    {splitPickups.length > 0 ? "Tank 1" : "Tank"}
                  </label>
                  <SearchableSelect
                    value={selectedTankNumber}
                    onChange={setSelectedTankNumber}
                    disabled={!selectedPickupName || tankOptions.length === 0}
                    options={tankOptions.map((t) => ({ value: t.tankNumber, label: t.tankNumber }))}
                    placeholder={tankOptions.length === 0 ? "No tanks" : "Select Tank"}
                    className={`${inputClass} disabled:opacity-50`}
                    style={inputStyle}
                  />
                </div>

                {/* Additional split pickups (Pickup Name 2, 3, ...) */}
                {splitPickups.map((sp, i) => {
                  const splitPickupData = pickupOptions.find((p) => p.name === sp.pickupName);
                  const splitTankOptions = splitPickupData?.tanks || [];
                  return (
                    <div key={i} className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className={labelClass} style={{ ...labelStyle, marginBottom: 0 }}>
                            Pickup Name {i + 2}
                          </label>
                          <button
                            onClick={() => removeSplitPickup(i)}
                            className="text-xs hover:opacity-80"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            &times; Remove
                          </button>
                        </div>
                        <SearchableSelect
                          value={sp.pickupName}
                          onChange={(v) => updateSplitPickup(i, "pickupName", v)}
                          options={pickupOptions.map((p) => ({ value: p.name, label: p.name }))}
                          placeholder="Select Pickup"
                          className={inputClass}
                          style={inputStyle}
                        />
                      </div>
                      <div style={{ maxWidth: "160px" }}>
                        <label className={labelClass} style={labelStyle}>
                          Tank {i + 2}
                        </label>
                        <SearchableSelect
                          value={sp.tankNumber}
                          onChange={(v) => updateSplitPickup(i, "tankNumber", v)}
                          disabled={!sp.pickupName || splitTankOptions.length === 0}
                          options={splitTankOptions.map((t) => ({ value: t.tankNumber, label: t.tankNumber }))}
                          placeholder={splitTankOptions.length === 0 ? "No tanks" : "Select Tank"}
                          className={`${inputClass} disabled:opacity-50`}
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  );
                })}

                {/* Urgent under pickup */}
                <div>
                  <label className={labelClass} style={labelStyle}>
                    Urgent
                  </label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-base cursor-pointer">
                      <input
                        type="radio"
                        checked={!isUrgent}
                        onChange={() => setIsUrgent(false)}
                        className="accent-blue-500"
                      />
                      <span style={{ color: "var(--color-text-primary)" }}>No</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-base cursor-pointer">
                      <input
                        type="radio"
                        checked={isUrgent}
                        onChange={() => setIsUrgent(true)}
                        className="accent-red-500"
                      />
                      <span style={{ color: "var(--color-text-primary)" }}>Yes</span>
                    </label>
                  </div>
                </div>

                {/* Split button under Urgent */}
                {selectedPickupName && splitPickups.length < 5 && (
                  <div>
                    <button
                      onClick={addSplitPickup}
                      className="text-sm px-3 py-1.5 rounded transition-colors"
                      style={{
                        background: "var(--color-input-bg)",
                        border: "1px solid var(--color-input-border)",
                        color: "var(--color-text-primary)",
                      }}
                    >
                      + Split
                    </button>
                  </div>
                )}
              </div>

              {/* Vertical divider */}
              <div className="hidden lg:block" style={{ background: "var(--color-border)" }} />

              {/* RIGHT: Drop Off */}
              <div className="space-y-3">
                <h3
                  className={sectionHeaderClass}
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  Drop Off
                </h3>

                <div>
                  <label className={labelClass} style={labelStyle}>
                    Drop Off Account
                  </label>
                  {loadingDropoffs ? (
                    <div className="flex items-center gap-2 text-base py-1.5" style={{ color: "var(--color-text-muted)" }}>
                      <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      Loading...
                    </div>
                  ) : (
                    <SearchableSelect
                      value={dropoffAccountName}
                      onChange={(v) => {
                        setDropoffAccountName(v);
                        setDropoffName("");
                      }}
                      disabled={!selectedPickupName}
                      options={dropoffAccountOptions.map((name) => ({ value: name, label: name }))}
                      placeholder={!selectedPickupName ? "Select pickup first" : "Select Account"}
                      className={`${inputClass} disabled:opacity-50`}
                      style={inputStyle}
                    />
                  )}
                </div>

                <div>
                  <label className={labelClass} style={labelStyle}>
                    Drop Off Name
                  </label>
                  <SearchableSelect
                    value={dropoffName}
                    onChange={setDropoffName}
                    disabled={!dropoffAccountName}
                    options={dropoffNameOptions.map((name) => ({ value: name, label: name }))}
                    placeholder={!dropoffAccountName ? "Select account first" : "Select Drop Off"}
                    className={`${inputClass} disabled:opacity-50`}
                    style={inputStyle}
                  />
                </div>

                {/* Loaded Miles under dropoff */}
                <div>
                  <label className={labelClass} style={labelStyle}>
                    Loaded Miles
                  </label>
                  {scenarioLoadedMiles != null ? (
                    <input
                      type="text"
                      value={String(scenarioLoadedMiles)}
                      readOnly
                      className={`${inputClass} cursor-default opacity-70`}
                      style={{ ...inputStyle, maxWidth: "120px" }}
                    />
                  ) : (
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={manualLoadedMiles}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "" || (Number(val) >= 1 && Number(val) <= 999)) {
                          setManualLoadedMiles(val);
                        }
                      }}
                      placeholder="1-999"
                      className={inputClass}
                      style={{ ...inputStyle, maxWidth: "120px", border: "1px solid #ef4444" }}
                    />
                  )}
                </div>
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "12px" }} />

            {/* Multi-load entries (left) + Load Instructions (right) */}
            <div className="grid gap-4 xl:grid-cols-2">
              {/* LEFT: Multi-load entries — highlighted */}
              <div
                className="space-y-2 rounded-lg p-3"
                style={{
                  background: "var(--color-bg-tertiary, rgba(59,130,246,0.06))",
                  border: "1px solid var(--color-accent, #3b82f6)",
                }}
              >
                <div className="flex items-center justify-end">
                  <button
                    onClick={addEntry}
                    className="text-sm px-2 py-0.5 rounded transition-colors"
                    style={{
                      background: "var(--color-input-bg)",
                      border: "1px solid var(--color-input-border)",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    + Add
                  </button>
                </div>

                {entries.map((entry, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span
                      className="text-sm w-5 text-center flex-shrink-0"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {idx + 1}.
                    </span>
                    <input
                      type="text"
                      value={entry.confirmationNo}
                      onChange={(e) => updateEntry(idx, e.target.value)}
                      placeholder="Conf # (optional)"
                      className={`${inputClass} flex-1`}
                      style={inputStyle}
                    />
                    {entries.length > 1 && (
                      <button
                        onClick={() => removeEntry(idx)}
                        className="text-sm px-1.5 flex-shrink-0 hover:opacity-80"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        &times;
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* RIGHT: Load Instructions */}
              <div>
                <label className={labelClass} style={labelStyle}>
                  Load Instructions
                </label>
                <textarea
                  value={loadInstructions}
                  onChange={(e) => setLoadInstructions(e.target.value)}
                  rows={4}
                  className={`${inputClass} resize-y`}
                  style={inputStyle}
                  placeholder="Optional instructions..."
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      {!isViewing && (
        <div
          className="px-4 py-3 flex items-center justify-end gap-3"
          style={{
            background: "var(--color-bg-secondary)",
            borderTop: "1px solid var(--color-border)",
          }}
        >
          {scenarioLoadedMiles == null && !manualLoadedMiles && selectedPickupName && dropoffName && (
            <span className="text-sm text-red-400 mr-auto">Mileage required</span>
          )}
          <button
            onClick={onCancel}
            className="px-4 py-2 text-base rounded transition-colors"
            style={{
              background: "var(--color-input-bg)",
              border: "1px solid var(--color-input-border)",
              color: "var(--color-text-primary)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || successCount === entries.length}
            className="px-4 py-2 text-base bg-green-600 hover:bg-green-500 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting
              ? `Creating ${successCount + 1}/${entries.length}...`
              : entries.length > 1
              ? `Create ${entries.length} Loads`
              : "Create Load"}
          </button>
        </div>
      )}

      {/* Snackbar notification for created confirmation numbers */}
      {showSnackbar && createdConfirmations.length > 0 && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-[slideUp_0.3s_ease-out]"
          style={{
            background: "rgba(34,197,94,0.95)",
            color: "#fff",
            minWidth: "320px",
            maxWidth: "600px",
          }}
        >
          <div className="flex-1">
            <div className="font-semibold text-sm">
              {createdConfirmations.length === 1 ? "Load Created" : `${createdConfirmations.length} Loads Created`}
            </div>
            <div className="text-sm mt-0.5 opacity-90">
              {createdConfirmations.join(", ")} — copied to clipboard
            </div>
          </div>
          <button
            onClick={() => setShowSnackbar(false)}
            className="text-white/80 hover:text-white text-lg leading-none"
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </div>
      <div className="text-sm truncate" style={{ color: "var(--color-text-primary)" }}>
        {value || "—"}
      </div>
    </div>
  );
}
