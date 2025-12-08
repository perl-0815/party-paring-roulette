"use client";

import { ChangeEvent, MutableRefObject, startTransition, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { GiftRouletteModal } from "./GiftRouletteModal";

export type Participant = {
  id: string;
  attribute: string;
  name: string;
};

type PairGroup = {
  id: string;
  members: Participant[];
  createdAt: number;
  isTrio: boolean;
};

type Preference = {
  id: string;
  from: string;
  to: string;
};

type Settings = {
  avoidSameAttribute: boolean;
  preferredCombos: Preference[];
  preferredHitRate: number; // 0-100%
};

type ViewMode = "setup" | "roulette";

const STORAGE_KEYS = {
  pair: "party-pairing-roulette-state",
  gift: "party-gift-roulette-state",
} as const;
const FALLBACK_SPOTLIGHTS = ["Ready", "Set", "Go"];

const gradientPool = [
  "from-fuchsia-500/80 via-rose-500/80 to-amber-400/80",
  "from-sky-500/80 via-cyan-400/80 to-emerald-400/80",
  "from-purple-500/80 via-indigo-500/80 to-blue-500/80",
  "from-orange-500/80 via-amber-400/80 to-lime-400/80",
];

const glowPool = [
  "shadow-[0_0_45px_rgba(244,114,182,0.45)]",
  "shadow-[0_0_40px_rgba(14,165,233,0.4)]",
  "shadow-[0_0_45px_rgba(129,140,248,0.35)]",
  "shadow-[0_0_45px_rgba(251,191,36,0.45)]",
];

const generateId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2, 10)}`;
};

const shuffleList = <T,>(list: T[]) => {
  const array = [...list];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

const normalize = (value: string) => value.trim().toLowerCase();

const parseCsv = (raw: string): Participant[] => {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const firstRow = lines[0].split(",").map((cell) => cell.replace(/^"|"$/g, "").trim());
  const hasHeader = firstRow.some((cell) => normalize(cell) === "attribute");

  const participants: Participant[] = [];
  for (let i = hasHeader ? 1 : 0; i < lines.length; i += 1) {
    const cells = lines[i].split(",").map((cell) => cell.replace(/^"|"$/g, "").trim());
    const [attribute, name] = cells;
    if (!attribute || !name) continue;
    participants.push({ id: generateId(), attribute, name });
  }

  return participants;
};

export function RouletteApp({ mode = "pair" }: { mode?: "pair" | "gift" }) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [pairs, setPairs] = useState<PairGroup[]>([]);
  const [availableIds, setAvailableIds] = useState<string[]>([]);
  const storageKey = mode === "gift" ? STORAGE_KEYS.gift : STORAGE_KEYS.pair;
  const [settings, setSettings] = useState<Settings>({
    avoidSameAttribute: true,
    preferredCombos: [],
    preferredHitRate: 100,
  });
  const [view, setView] = useState<ViewMode>("setup");
  const [newParticipant, setNewParticipant] = useState({ attribute: "", name: "" });
  const [newPreference, setNewPreference] = useState({ from: "", to: "" });
  const [hasHydrated, setHasHydrated] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spotlights, setSpotlights] = useState<string[]>(FALLBACK_SPOTLIGHTS);
  const [latestHighlight, setLatestHighlight] = useState<PairGroup | null>(null);
  const [statusText, setStatusText] = useState("準備完了！");
  const [giftStatusText, setGiftStatusText] = useState("準備完了！");
  const [giftSpotlights, setGiftSpotlights] = useState<string[]>(FALLBACK_SPOTLIGHTS);
  const [giftChainIds, setGiftChainIds] = useState<string[]>([]);
  const [isGiftSpinning, setIsGiftSpinning] = useState(false);
  const [isGiftModalOpen, setIsGiftModalOpen] = useState(false);
  const pairSlotIntervalRef = useRef<number | null>(null);
  const pairSlotTimeoutsRef = useRef<number[]>([]);
  const giftSlotIntervalRef = useRef<number | null>(null);
  const giftSlotTimeoutsRef = useRef<number[]>([]);
  const pairSpinRef = useRef<() => void>(() => {});
  const giftSpinRef = useRef<() => void>(() => {});
  const [pairSlotStopped, setPairSlotStopped] = useState(false);
  const [giftSlotStopped, setGiftSlotStopped] = useState(false);
  const [pairSlotResultName, setPairSlotResultName] = useState<string | null>(null);
  const [giftSlotResultName, setGiftSlotResultName] = useState<string | null>(null);
  const [showSparkle, setShowSparkle] = useState(false);
  const [showPairResultPanel, setShowPairResultPanel] = useState(false);
  const overlayBursts = useMemo(() => {
    if (!showSparkle) return [];
    return Array.from({ length: 26 }).map((_, index) => ({
      id: index,
      rotate: Math.random() * 360,
      distance: 320 + Math.random() * 240,
      delay: Math.random() * 0.25,
    }));
  }, [showSparkle]);
  const giftChainEdges = useMemo(() => {
    const edges: { from: Participant; to: Participant }[] = [];
    if (giftChainIds.length < 2) return edges;
    const mapped = giftChainIds
      .map((id) => participants.find((entry) => entry.id === id) || null)
      .filter((entry): entry is Participant => Boolean(entry));
    for (let i = 1; i < mapped.length; i += 1) {
      edges.push({ from: mapped[i], to: mapped[i - 1] });
    }
    return edges;
  }, [giftChainIds, participants]);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showGiftResetConfirm, setShowGiftResetConfirm] = useState(false);
  const [isRouletteModalOpen, setIsRouletteModalOpen] = useState(false);

  const appendAvailableEntries = (entries: Participant[]) => {
    if (!entries.length) return;
    setAvailableIds((current) => {
      const next = [...current];
      const seen = new Set(current);
      entries.forEach((entry) => {
        if (!seen.has(entry.id)) {
          next.push(entry.id);
          seen.add(entry.id);
        }
      });
      return next;
    });
  };

  const prependAvailableEntries = (entries: Participant[]) => {
    if (!entries.length) return;
    setAvailableIds((current) => {
      const existing = new Set(current);
      const fresh = entries
        .map((entry) => entry.id)
        .filter((id) => !existing.has(id));
      if (!fresh.length) return current;
      return [...fresh, ...current];
    });
  };

  const availableParticipants = useMemo(() => {
    return availableIds
      .map((id) => participants.find((entry) => entry.id === id) || null)
      .filter((entry): entry is Participant => Boolean(entry));
  }, [availableIds, participants]);

  const giftChain = useMemo(() => {
    return giftChainIds
      .map((id) => participants.find((entry) => entry.id === id) || null)
      .filter((entry): entry is Participant => Boolean(entry));
  }, [giftChainIds, participants]);
  const giftRemainingParticipants = useMemo(() => {
    const chainSet = new Set(giftChainIds);
    return participants.filter((entry) => !chainSet.has(entry.id));
  }, [giftChainIds, participants]);

  const remainingCount = availableParticipants.length;
  const totalParticipants = participants.length;
  useEffect(() => {
    if (typeof window === "undefined") return;
    const cached = window.localStorage.getItem(storageKey);
    if (!cached) {
      startTransition(() => setHasHydrated(true));
      return;
    }
    try {
      const parsed = JSON.parse(cached);
      startTransition(() => {
        if (Array.isArray(parsed.participants)) setParticipants(parsed.participants);
        if (Array.isArray(parsed.pairs)) setPairs(parsed.pairs);
        if (Array.isArray(parsed.availableIds)) setAvailableIds(parsed.availableIds);
        if (parsed.settings) {
          setSettings({
            avoidSameAttribute: parsed.settings.avoidSameAttribute ?? true,
            preferredCombos: (parsed.settings.preferredCombos || []).map((combo: Preference) => ({
              id: combo.id || generateId(),
              from: combo.from,
              to: combo.to,
            })),
            preferredHitRate: parsed.settings.preferredHitRate ?? 100,
          });
        }
        if (Array.isArray(parsed.giftChainIds)) setGiftChainIds(parsed.giftChainIds);
        if (typeof parsed.giftStatusText === "string") setGiftStatusText(parsed.giftStatusText);
        if (parsed.view) setView(parsed.view);
        setHasHydrated(true);
      });
    } catch (error) {
      console.error("Failed to load cache", error);
      startTransition(() => setHasHydrated(true));
    }
  }, [storageKey]);

  useEffect(() => {
    if (!hasHydrated) return;
    if (typeof window === "undefined") return;
    const payload = {
      participants,
      pairs,
      availableIds,
      settings,
      giftChainIds,
      giftStatusText,
      view,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [participants, pairs, availableIds, settings, view, giftChainIds, giftStatusText, hasHydrated, storageKey]);

  const updatePairSpotlights = () => {
    const pool = availableParticipants.length ? availableParticipants : participants;
    if (!pool.length) {
      setSpotlights(FALLBACK_SPOTLIGHTS);
      return;
    }
    const shuffled = shuffleList(pool);
    setSpotlights(shuffled.map((entry) => entry.name));
  };

  const updateGiftSpotlights = () => {
    const pool = participants.length ? participants : [];
    if (!pool.length) {
      setGiftSpotlights(FALLBACK_SPOTLIGHTS);
      return;
    }
    const shuffled = shuffleList(pool);
    setGiftSpotlights(shuffled.map((entry) => entry.name));
  };

  const stopSlotAnimation = (intervalRef: MutableRefObject<number | null>, timeoutsRef: MutableRefObject<number[]>) => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    timeoutsRef.current = [];
  };

  const startSlotAnimation = (
    updateFn: () => void,
    intervalRef: MutableRefObject<number | null>,
    timeoutsRef: MutableRefObject<number[]>
  ) => {
    stopSlotAnimation(intervalRef, timeoutsRef);
    updateFn();
    intervalRef.current = window.setInterval(updateFn, 45);
    const slowdownStarter = window.setTimeout(() => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      const slowdownSteps = [80, 120, 160, 210, 270, 340, 430, 540, 680, 840, 1020, 1220];
      let accumulated = 0;
      slowdownSteps.forEach((delay) => {
        accumulated += delay;
        const id = window.setTimeout(() => updateFn(), accumulated);
        timeoutsRef.current.push(id);
      });
    }, 1100);
    timeoutsRef.current.push(slowdownStarter);
  };

  useEffect(() => {
    return () => {
      stopSlotAnimation(pairSlotIntervalRef, pairSlotTimeoutsRef);
      stopSlotAnimation(giftSlotIntervalRef, giftSlotTimeoutsRef);
    };
  }, []);

  const handleCsvUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result?.toString() || "";
      const parsed = parseCsv(text);
      if (!parsed.length) {
        setCsvError("CSVに有効な行が見つかりませんでした");
        return;
      }
      setCsvError(null);
      setParticipants((prev) => [...prev, ...parsed]);
      appendAvailableEntries(parsed);
    };
    reader.onerror = () => setCsvError("CSVの読み込みに失敗しました");
    reader.readAsText(file, "utf-8");
    event.target.value = "";
  };

  const handleAddParticipant = () => {
    if (!newParticipant.attribute.trim() || !newParticipant.name.trim()) return;
    const entry: Participant = {
      id: generateId(),
      attribute: newParticipant.attribute.trim(),
      name: newParticipant.name.trim(),
    };
    setParticipants((prev) => [...prev, entry]);
    appendAvailableEntries([entry]);
    setNewParticipant({ attribute: "", name: "" });
  };

  const handleNewParticipantFieldChange = (field: "attribute" | "name", value: string) => {
    setNewParticipant((prev) => ({ ...prev, [field]: value }));
  };

  const handleParticipantUpdate = (id: string, key: keyof Participant, value: string) => {
    setParticipants((prev) =>
      prev.map((participant) =>
        participant.id === id ? { ...participant, [key]: value } : participant
      )
    );
  };

  const handleRemoveParticipant = (id: string) => {
    setParticipants((prev) => prev.filter((participant) => participant.id !== id));
    setPairs((prev) => prev.filter((group) => !group.members.some((member) => member.id === id)));
    setAvailableIds((prev) => prev.filter((entry) => entry !== id));
  };

  const handleAddPreference = () => {
    if (!newPreference.from.trim() || !newPreference.to.trim()) return;
    setSettings((prev) => ({
      ...prev,
      preferredCombos: [
        ...prev.preferredCombos,
        { id: generateId(), from: newPreference.from.trim(), to: newPreference.to.trim() },
      ],
    }));
    setNewPreference({ from: "", to: "" });
  };

  const handlePreferenceFieldChange = (field: "from" | "to", value: string) => {
    setNewPreference((prev) => ({ ...prev, [field]: value }));
  };

  const handleRemovePreference = (id: string) => {
    setSettings((prev) => ({
      ...prev,
      preferredCombos: prev.preferredCombos.filter((pref) => pref.id !== id),
    }));
  };

  const handlePreferredHitRateChange = (value: number) => {
    const clamped = Math.min(100, Math.max(0, value));
    setSettings((prev) => ({ ...prev, preferredHitRate: clamped }));
  };

  const buildTrio = (pool: Participant[]): PairGroup => {
    const trioMembers = shuffleList(pool).slice(0, 3);
    return {
      id: generateId(),
      members: trioMembers,
      createdAt: Date.now(),
      isTrio: true,
    };
  };

  const pickPreferredPair = (pool: Participant[]): Participant[] | null => {
    if (!settings.preferredCombos.length) return null;
    for (const pref of settings.preferredCombos) {
      const groupA = pool.filter((member) => normalize(member.attribute) === normalize(pref.from));
      const groupB = pool.filter((member) => normalize(member.attribute) === normalize(pref.to));
      if (!groupA.length || !groupB.length) continue;
      const first = groupA[Math.floor(Math.random() * groupA.length)];
      const candidates = groupB.filter((member) => member.id !== first.id);
      if (!candidates.length) continue;
      const second = candidates[Math.floor(Math.random() * candidates.length)];
      return [first, second];
    }
    return null;
  };

  const pickDifferentAttributePair = (pool: Participant[]): Participant[] | null => {
    if (!settings.avoidSameAttribute) return null;
    const shuffled = shuffleList(pool);
    for (let i = 0; i < shuffled.length; i += 1) {
      for (let j = i + 1; j < shuffled.length; j += 1) {
        if (normalize(shuffled[i].attribute) !== normalize(shuffled[j].attribute)) {
          return [shuffled[i], shuffled[j]];
        }
      }
    }
    return null;
  };

  const pickPreferredGiver = (recipient: Participant, pool: Participant[]): Participant | null => {
    if (!settings.preferredCombos.length) return null;
    const recipientAttr = normalize(recipient.attribute);
    const matchingCombos = settings.preferredCombos.filter(
      (pref) => normalize(pref.to) === recipientAttr
    );
    if (!matchingCombos.length) return null;
    const candidates: Participant[] = [];
    matchingCombos.forEach((pref) => {
      const targetAttr = normalize(pref.from);
      const hits = pool.filter((member) => normalize(member.attribute) === targetAttr);
      candidates.push(...hits);
    });
    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  };

  const pickDifferentAttributeGiver = (recipient: Participant, pool: Participant[]): Participant | null => {
    if (!settings.avoidSameAttribute) return null;
    const candidates = pool.filter(
      (member) => normalize(member.attribute) !== normalize(recipient.attribute)
    );
    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  };

  const createNextGroup = () => {
    if (availableParticipants.length < 2) return null;
    if (availableParticipants.length === 3) {
      return buildTrio(availableParticipants);
    }
    const shouldUsePreferred =
      settings.preferredCombos.length > 0 && Math.random() * 100 < settings.preferredHitRate;
    const preferred = shouldUsePreferred ? pickPreferredPair(availableParticipants) : null;
    const different = pickDifferentAttributePair(availableParticipants);
    const fallbackPair = shuffleList(availableParticipants).slice(0, 2);
    const members = preferred || different || fallbackPair;
    return {
      id: generateId(),
      members,
      createdAt: Date.now(),
      isTrio: false,
    };
  };

  const handleSpin = () => {
    if (isSpinning || availableParticipants.length < 2) return;
    setPairSlotStopped(false);
    setShowPairResultPanel(false);
    startSlotAnimation(updatePairSpotlights, pairSlotIntervalRef, pairSlotTimeoutsRef);
    setIsSpinning(true);
    setStatusText("ルーレット回転中…");
    setLatestHighlight(null);
    setTimeout(() => {
      const nextGroup = createNextGroup();
      if (!nextGroup) {
        setStatusText("参加者が不足しています");
        setIsSpinning(false);
        stopSlotAnimation(pairSlotIntervalRef, pairSlotTimeoutsRef);
        return;
      }
      setPairs((prev) => [...prev, nextGroup]);
      setAvailableIds((prev) => prev.filter((id) => !nextGroup.members.some((member) => member.id === id)));
      stopSlotAnimation(pairSlotIntervalRef, pairSlotTimeoutsRef);
      setPairSlotResultName(nextGroup.members[0]?.name || null);
      setSpotlights(Array(20).fill(nextGroup.members[0]?.name || ""));
      setPairSlotStopped(true);
      setShowSparkle(true);
      const revealDelay = 3000;
      window.setTimeout(() => {
        setLatestHighlight(nextGroup);
        setStatusText(nextGroup.isTrio ? "スペシャルトリオが決定！" : "新しいペアが決定！");
        setIsSpinning(false);
        setPairSlotResultName(null);
        setShowPairResultPanel(true);
        window.setTimeout(() => setPairSlotStopped(false), 300);
        window.setTimeout(() => setShowSparkle(false), 1600);
      }, revealDelay);
    }, 2300);
  };

  const handleGiftSpin = () => {
    if (isGiftSpinning || participants.length < 2) return;
    const cleanedChain = giftChainIds.filter((id) => participants.some((entry) => entry.id === id));
    const cleanedRemaining = participants
      .map((entry) => entry.id)
      .filter((id) => !cleanedChain.includes(id));
    setGiftChainIds(cleanedChain);
    if (cleanedChain.length && cleanedRemaining.length === 0) {
      if (cleanedChain.length > 1) {
        const latest = participants.find((entry) => entry.id === cleanedChain[cleanedChain.length - 1]);
        const receiver = participants.find((entry) => entry.id === cleanedChain[cleanedChain.length - 2]);
        if (latest && receiver) {
          setGiftStatusText(
            `受け渡し順が確定済みです。最後は最新に選ばれた ${latest.name} から ${receiver.name} へプレゼントが渡ります。結果をクリアして再抽選できます！`
          );
        } else {
          setGiftStatusText("受け渡し順がすでに確定しています！結果をクリアして再抽選できます！");
        }
      } else {
        setGiftStatusText("受け渡し順がすでに確定しています！結果をクリアして再抽選できます！");
      }
      return;
    }
    setGiftSlotStopped(false);
    setGiftSlotResultName(null);
    startSlotAnimation(updateGiftSpotlights, giftSlotIntervalRef, giftSlotTimeoutsRef);
    setIsGiftSpinning(true);
    setGiftStatusText("プレゼント抽選中…");
    setGiftSpotlights(FALLBACK_SPOTLIGHTS);
    setTimeout(() => {
      const baseChain = cleanedChain;
      const baseRemaining = participants
        .map((entry) => entry.id)
        .filter((id) => !baseChain.includes(id));
      if (!baseChain.length) {
        const starter = participants[Math.floor(Math.random() * participants.length)];
        setGiftChainIds([starter.id]);
        setGiftStatusText(`${starter.name} が最初に受け取る人として選ばれました。次の人を抽選して、渡す役を決めましょう。`);
        setIsGiftSpinning(false);
        return;
      }
      const recipientId = baseChain[baseChain.length - 1];
      const recipient = participants.find((member) => member.id === recipientId);
      if (!recipient) {
        setGiftStatusText("参加者が更新されたため抽選を中断しました。リセット後に再抽選してください。");
        setIsGiftSpinning(false);
        stopSlotAnimation(giftSlotIntervalRef, giftSlotTimeoutsRef);
        return;
      }
      const availablePool = participants.filter((member) => baseRemaining.includes(member.id));
      if (!availablePool.length) {
        setGiftStatusText("残りの参加者が見つかりませんでした。リセットして再抽選してください。");
        setIsGiftSpinning(false);
        stopSlotAnimation(giftSlotIntervalRef, giftSlotTimeoutsRef);
        return;
      }
      const shouldUsePreferred =
        settings.preferredCombos.length > 0 && Math.random() * 100 < settings.preferredHitRate;
      const preferredGiver = shouldUsePreferred ? pickPreferredGiver(recipient, availablePool) : null;
      const differentAttrGiver = pickDifferentAttributeGiver(recipient, availablePool);
      const fallbackGiver = availablePool[Math.floor(Math.random() * availablePool.length)];
      const giver = preferredGiver || differentAttrGiver || fallbackGiver;
      if (!giver) {
        setGiftStatusText("抽選できませんでした。もう一度お試しください。");
        setIsGiftSpinning(false);
        stopSlotAnimation(giftSlotIntervalRef, giftSlotTimeoutsRef);
        return;
      }
      const newChain = [...baseChain, giver.id];
      const newRemaining = baseRemaining.filter((id) => id !== giver.id);
      setGiftChainIds(newChain);
      setGiftSlotResultName(giver.name);
      setGiftSpotlights(Array(20).fill(giver.name));
      setGiftStatusText(
        newRemaining.length === 0
          ? `${giver.name} が ${recipient.name} にプレゼントを渡します。全員の受け渡し順が確定しました。`
          : `${giver.name} が ${recipient.name} にプレゼントを渡します！残り ${newRemaining.length} 人`
      );
      stopSlotAnimation(giftSlotIntervalRef, giftSlotTimeoutsRef);
      setGiftSlotStopped(true);
      setShowSparkle(true);
      const revealDelay = 3000;
      window.setTimeout(() => {
        setIsGiftSpinning(false);
        setGiftSlotStopped(false);
        setGiftSlotResultName(null);
        window.setTimeout(() => setShowSparkle(false), 1600);
      }, revealDelay);
    }, 2300);
  };

  const handleReset = () => {
    setShowResetConfirm(false);
    setIsRouletteModalOpen(false);
    setIsSpinning(false);
    stopSlotAnimation(pairSlotIntervalRef, pairSlotTimeoutsRef);
    stopSlotAnimation(giftSlotIntervalRef, giftSlotTimeoutsRef);
    setPairSlotStopped(false);
    setGiftSlotStopped(false);
    setPairSlotResultName(null);
    setGiftSlotResultName(null);
    setShowPairResultPanel(false);
    setParticipants([]);
    setPairs([]);
    setAvailableIds([]);
    setSettings({ avoidSameAttribute: true, preferredCombos: [], preferredHitRate: 100 });
    setView("setup");
    setLatestHighlight(null);
    setSpotlights(FALLBACK_SPOTLIGHTS);
    setStatusText("リセットしました");
    setGiftChainIds([]);
    setGiftSpotlights(FALLBACK_SPOTLIGHTS);
    setGiftStatusText("準備完了！");
    setIsGiftSpinning(false);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(storageKey);
    }
  };

const requestFullReset = () => setShowResetConfirm(true);
const cancelResetRequest = () => setShowResetConfirm(false);

  const requestGiftReset = () => {
    if (isGiftSpinning) return;
    setShowGiftResetConfirm(true);
  };

  const cancelGiftResetRequest = () => setShowGiftResetConfirm(false);

  const handleGiftReset = () => {
    if (isGiftSpinning) {
      setShowGiftResetConfirm(false);
      return;
    }
    stopSlotAnimation(giftSlotIntervalRef, giftSlotTimeoutsRef);
    setGiftChainIds([]);
    setGiftSpotlights(FALLBACK_SPOTLIGHTS);
    setGiftStatusText("結果をクリアしました");
    setIsGiftModalOpen(false);
    setShowGiftResetConfirm(false);
    setShowSparkle(false);
  };

  useEffect(() => {
    pairSpinRef.current = handleSpin;
    giftSpinRef.current = handleGiftSpin;
  });

  const disableSpinButton = isSpinning || availableParticipants.length < 2;
  const giftComplete = giftChainIds.length > 0 && giftRemainingParticipants.length === 0;
  const disableGiftSpinButton = isGiftSpinning || participants.length < 2 || giftComplete;
  const disableGiftRerollButton = isGiftSpinning || giftChainIds.length === 0;
  const showTrioHint = availableParticipants.length === 3;
  const toggleAvoidSame = () => {
    setSettings((prev) => ({
      ...prev,
      avoidSameAttribute: !prev.avoidSameAttribute,
    }));
  };
  const handleCloseRouletteModal = () => {
    if (isSpinning) return;
    setIsRouletteModalOpen(false);
  };
  const handleGoToRoulette = () => {
    if (participants.length < 2) return;
    setView("roulette");
  };

  const handleOpenRouletteModal = () => {
    if (isSpinning || availableParticipants.length < 2) return;
    setIsRouletteModalOpen(true);
    handleSpin();
  };

  const handleRerollLatest = () => {
    if (isSpinning) return;
    const lastPair = pairs[pairs.length - 1];
    if (!lastPair) return;
    const restoredMembers = lastPair.members.filter((member) =>
      participants.some((entry) => entry.id === member.id)
    );
    if (!restoredMembers.length) return;
    setPairs((prev) => prev.slice(0, -1));
    prependAvailableEntries(restoredMembers);
    setLatestHighlight(null);
    setShowPairResultPanel(false);
    setPairSlotResultName(null);
    setPairSlotStopped(false);
    setSpotlights(FALLBACK_SPOTLIGHTS);
    setShowSparkle(false);
    setStatusText("最後の抽選をやり直します");
    setIsRouletteModalOpen(true);
    window.setTimeout(() => {
      pairSpinRef.current();
    }, 0);
  };

  const handleOpenGiftModal = () => {
    if (participants.length < 2 || isGiftSpinning) return;
    setView("roulette");
    setIsGiftModalOpen(true);
    handleGiftSpin();
  };

  const handleGiftReroll = () => {
    if (isGiftSpinning) return;
    if (!giftChainIds.length) return;
    const lastId = giftChainIds[giftChainIds.length - 1];
    const lastParticipant = participants.find((entry) => entry.id === lastId);
    if (!lastParticipant) return;
    const updatedChain = giftChainIds.slice(0, -1);
    setGiftChainIds(updatedChain);
    setGiftSlotResultName(null);
    setGiftSlotStopped(false);
    setGiftSpotlights(FALLBACK_SPOTLIGHTS);
    setShowSparkle(false);
    setGiftStatusText(`${lastParticipant.name} を再抽選します`);
    setIsGiftModalOpen(true);
    window.setTimeout(() => {
      giftSpinRef.current();
    }, 0);
  };

  const handleReleasePair = (pairId: string) => {
    const target = pairs.find((group) => group.id === pairId);
    if (!target) return;
    setPairs((prev) => prev.filter((group) => group.id !== pairId));
    prependAvailableEntries(target.members);
    setStatusText("選択したペアを解除しました");
    setLatestHighlight((prev) => (prev && prev.id === pairId ? null : prev));
  };

  const theme = mode === "pair"
    ? {
        bg: "bg-gradient-to-b from-emerald-950 via-slate-950 to-black",
        card: "border-emerald-200/30 bg-emerald-900/40",
        accent: "text-emerald-200",
        button:
          participants.length < 2
            ? "cursor-not-allowed bg-emerald-200/20 text-emerald-100/60"
            : "bg-emerald-300 text-emerald-950 shadow-lg shadow-emerald-300/40",
      }
    : {
        bg: "bg-gradient-to-b from-indigo-950 via-slate-950 to-black",
        card: "border-indigo-200/30 bg-indigo-900/40",
        accent: "text-indigo-200",
        button:
          participants.length < 2
            ? "cursor-not-allowed bg-indigo-200/20 text-indigo-100/60"
            : "bg-indigo-300 text-indigo-950 shadow-lg shadow-indigo-300/40",
      };

  return (
    <div className={`min-h-screen ${theme.bg} pb-16 text-white`}>
      {showSparkle && (
        <div className="pointer-events-none fixed inset-0 z-[80] overflow-hidden">
          {overlayBursts.map((particle) => (
            <span
              key={particle.id}
              className="sparkle-burst-outer"
              style={
                {
                  "--sparkle-transform": `translate(-50%, -50%) rotate(${particle.rotate}deg) translateY(-${particle.distance}px)`,
                  animationDelay: `${particle.delay}s`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 pt-12 lg:px-8">
        <header className={`rounded-3xl border border-white/10 bg-black/50 p-8 text-white shadow-[0_40px_140px_rgba(3,7,18,0.8)] ${theme.card}`}>
          <p className={`text-sm uppercase tracking-[0.4em] ${theme.accent}`}>PARTY TOOL</p>
          <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight md:text-5xl">
            {mode === "pair" ? "ペアリングルーレット" : "プレゼントリレールーレット"}
          </h1>
          <p className="mt-3 text-lg text-white/80">
            {mode === "pair"
              ? "CSVインポート・属性バランス・優先組み合わせに対応した二人組を作るためのルーレット。"
              : "最初の人を決めてから1人ずつ抽選し、新しく選ばれた人が一つ前に選ばれた人へプレゼントをリレー。"}
          </p>
          <div className="mt-6 flex flex-wrap gap-4 text-sm text-white/80">
            <span className="rounded-full border border-white/20 px-4 py-1">参加者 {totalParticipants} 名</span>
            <span className="rounded-full border border-white/20 px-4 py-1">未ペア {remainingCount} 名</span>
            <span className="rounded-full border border-white/20 px-4 py-1">確定 {pairs.length} 組</span>
          </div>
          <div className="mt-8 flex flex-wrap gap-4">
            <button
              type="button"
              onClick={handleGoToRoulette}
              disabled={participants.length < 2}
              className={`rounded-full px-8 py-3 text-lg font-semibold transition ${theme.button}`}
            >
              ルーレットページへ移動
            </button>
          </div>
        </header>

        {view === "setup" ? (
          <SetupView
            participants={participants}
            totalParticipants={totalParticipants}
            remainingCount={remainingCount}
            pairCount={pairs.length}
            newParticipant={newParticipant}
            onNewParticipantChange={handleNewParticipantFieldChange}
            onAddParticipant={handleAddParticipant}
            onParticipantUpdate={handleParticipantUpdate}
            onRemoveParticipant={handleRemoveParticipant}
            onCsvUpload={handleCsvUpload}
            csvError={csvError}
            onReset={requestFullReset}
            settings={settings}
            onToggleAvoidSame={toggleAvoidSame}
            onPreferredHitRateChange={handlePreferredHitRateChange}
            newPreference={newPreference}
            onPreferenceChange={handlePreferenceFieldChange}
            onAddPreference={handleAddPreference}
            onRemovePreference={handleRemovePreference}
            cardToneClass={theme.card}
          />
        ) : (
          <RouletteView
            statusText={statusText}
            showTrioHint={showTrioHint}
            onOpenRouletteModal={handleOpenRouletteModal}
            onOpenGiftModal={handleOpenGiftModal}
            onReleasePair={handleReleasePair}
            disableSpinButton={disableSpinButton}
            pairs={pairs}
            totalParticipants={totalParticipants}
            availableParticipants={availableParticipants}
            remainingCount={remainingCount}
            onBackToSetup={() => setView("setup")}
            onReset={requestFullReset}
            isSpinning={isSpinning}
            giftChain={giftChain}
            giftStatusText={giftStatusText}
            onGiftReset={requestGiftReset}
            disableGiftSpinButton={disableGiftSpinButton}
            isGiftSpinning={isGiftSpinning}
            giftRemainingParticipants={giftRemainingParticipants}
            mode={mode}
          />
        )}
      </div>
      <RouletteModal
        isOpen={isRouletteModalOpen}
        onClose={handleCloseRouletteModal}
        onReroll={handleRerollLatest}
        isSpinning={isSpinning}
        spotlights={spotlights}
        latestHighlight={latestHighlight}
        statusText={statusText}
        disableClose={isSpinning}
        disableReroll={isSpinning || pairs.length === 0}
        slotStopped={pairSlotStopped}
        slotResultName={pairSlotResultName}
        showSparkle={showSparkle}
        showPairResultPanel={showPairResultPanel}
      />
      <ResetConfirmDialog
        open={showResetConfirm}
        onCancel={cancelResetRequest}
        onConfirm={handleReset}
      />
      <GiftResetConfirmDialog
        open={showGiftResetConfirm}
        onCancel={cancelGiftResetRequest}
        onConfirm={handleGiftReset}
        disableConfirm={isGiftSpinning}
      />
      <GiftRouletteModal
        isOpen={isGiftModalOpen}
        onClose={() => {
          if (isGiftSpinning) return;
          setIsGiftModalOpen(false);
        }}
        onReroll={handleGiftReroll}
        isSpinning={isGiftSpinning}
        spotlights={giftSpotlights}
        statusText={giftStatusText}
        chain={giftChain}
        remainingParticipants={giftRemainingParticipants}
        onSpin={handleGiftSpin}
        disableSpin={disableGiftSpinButton}
        disableReroll={disableGiftRerollButton}
        onReset={requestGiftReset}
        edges={giftChainEdges}
        slotStopped={giftSlotStopped}
        slotResultName={giftSlotResultName}
        showSparkle={showSparkle}
      />
    </div>
  );
}

type SetupViewProps = {
  participants: Participant[];
  totalParticipants: number;
  remainingCount: number;
  pairCount: number;
  newParticipant: { attribute: string; name: string };
  onNewParticipantChange: (field: "attribute" | "name", value: string) => void;
  onAddParticipant: () => void;
  onParticipantUpdate: (id: string, key: keyof Participant, value: string) => void;
  onRemoveParticipant: (id: string) => void;
  onCsvUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  csvError: string | null;
  onReset: () => void;
  settings: Settings;
  onToggleAvoidSame: () => void;
  onPreferredHitRateChange: (value: number) => void;
  newPreference: { from: string; to: string };
  onPreferenceChange: (field: "from" | "to", value: string) => void;
  onAddPreference: () => void;
  onRemovePreference: (id: string) => void;
  cardToneClass: string;
};

function SetupView({
  participants,
  totalParticipants,
  remainingCount,
  pairCount,
  newParticipant,
  onNewParticipantChange,
  onAddParticipant,
  onParticipantUpdate,
  onRemoveParticipant,
  onCsvUpload,
  csvError,
  onReset,
  settings,
  onToggleAvoidSame,
  onPreferredHitRateChange,
  newPreference,
  onPreferenceChange,
  onAddPreference,
  onRemovePreference,
  cardToneClass,
}: SetupViewProps) {
  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-fuchsia-200">ROSTER</p>
            <h2 className="text-2xl font-semibold text-white">参加者リスト</h2>
          </div>
          <div className="flex gap-3 text-sm text-white/80">
            <span className="rounded-full border border-white/20 px-4 py-1">総人数: {totalParticipants}</span>
            <span className="rounded-full border border-white/20 px-4 py-1">未ペア: {remainingCount}</span>
            <span className="rounded-full border border-white/20 px-4 py-1">確定済: {pairCount}</span>
          </div>
        </header>
        <div className="mt-6 flex flex-col gap-4">
          {participants.length === 0 && (
            <p className="rounded-2xl border border-dashed border-white/20 bg-black/20 p-6 text-center text-white/70">
              CSVインポートまたはフォームから参加者を追加してください。
            </p>
          )}
          {participants.map((participant) => (
            <div
              key={participant.id}
              className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/40 p-4 text-white shadow-lg shadow-black/30 lg:flex-row lg:items-center"
            >
              <div className="flex w-full flex-col gap-2 sm:flex-row">
                <label className="flex flex-1 flex-col text-sm text-white/60">
                  属性
                  <input
                    value={participant.attribute}
                    onChange={(event) => onParticipantUpdate(participant.id, "attribute", event.target.value)}
                    className="mt-1 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-white outline-none transition focus:border-fuchsia-300"
                  />
                </label>
                <label className="flex flex-1 flex-col text-sm text-white/60">
                  名前
                  <input
                    value={participant.name}
                    onChange={(event) => onParticipantUpdate(participant.id, "name", event.target.value)}
                    className="mt-1 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-white outline-none transition focus:border-fuchsia-300"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => onRemoveParticipant(participant.id)}
                className="w-full rounded-xl border border-red-400/40 px-4 py-2 text-sm text-red-200 transition hover:border-red-300 hover:text-red-50 lg:w-auto"
              >
                削除
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className={`rounded-3xl border border-white/10 ${cardToneClass} p-5 shadow-lg backdrop-blur lg:col-span-2`}>
          <p className="text-sm uppercase tracking-[0.3em] text-sky-200">INPUT</p>
          <h3 className="text-xl font-semibold text-white">参加者を追加</h3>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              placeholder="例: B1"
              value={newParticipant.attribute}
              onChange={(event) => onNewParticipantChange("attribute", event.target.value)}
              className="flex-1 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-white outline-none focus:border-emerald-300"
            />
            <input
              placeholder="例: 山田さん"
              value={newParticipant.name}
              onChange={(event) => onNewParticipantChange("name", event.target.value)}
              className="flex-1 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-white outline-none focus:border-emerald-300"
            />
            <button
              type="button"
              onClick={onAddParticipant}
              className="rounded-xl bg-emerald-400/80 px-6 py-2 font-semibold text-slate-950 transition hover:bg-emerald-300"
            >
              追加
            </button>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <label className="relative cursor-pointer rounded-2xl border border-dashed border-white/30 px-4 py-3 text-sm text-white/80">
              CSVインポート
              <input type="file" accept=".csv" onChange={onCsvUpload} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            </label>
            {csvError && <span className="text-sm text-amber-200">{csvError}</span>}
            <span className="text-xs text-white/60">ヘッダ: attribute,name</span>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-5 text-white shadow-2xl">
          <p className="text-sm uppercase tracking-[0.3em] text-amber-200">CACHE</p>
          <h3 className="text-xl font-semibold">ローカル保存</h3>
          <p className="mt-3 text-sm text-white/80">
            名簿・設定・確定ペアはブラウザの localStorage に暗号化せず保存されます。イベントが終わったらリセットしてください。
          </p>
          <button
            type="button"
            onClick={onReset}
            className="mt-4 w-full rounded-xl border border-white/20 px-4 py-2 text-sm text-white transition hover:border-white"
          >
            全データをクリア
          </button>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-lg lg:col-span-2">
          <p className="text-sm uppercase tracking-[0.3em] text-purple-200">PREFERENCES</p>
          <h3 className="text-xl font-semibold text-white">優先組み合わせ</h3>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              placeholder="例: B1"
              value={newPreference.from}
              onChange={(event) => onPreferenceChange("from", event.target.value)}
              className="flex-1 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-white outline-none focus:border-purple-300"
            />
            <span className="flex items-center justify-center text-white/60">×</span>
            <input
              placeholder="例: M1"
              value={newPreference.to}
              onChange={(event) => onPreferenceChange("to", event.target.value)}
              className="flex-1 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-white outline-none focus:border-purple-300"
            />
            <button
              type="button"
              onClick={onAddPreference}
              className="rounded-xl bg-purple-400/80 px-6 py-2 font-semibold text-slate-950 transition hover:bg-purple-300"
            >
              保存
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {settings.preferredCombos.length === 0 && (
              <p className="text-sm text-white/70">優先ルールはまだありません。</p>
            )}
            {settings.preferredCombos.map((pref) => (
              <span
                key={pref.id}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm text-white"
              >
                {pref.from} × {pref.to}
                <button
                  type="button"
                  onClick={() => onRemovePreference(pref.id)}
                  className="text-xs text-white/60 transition hover:text-white"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-white">優先組み合わせが選ばれる確率</p>
                <p className="text-sm text-white/70">0%で無効、100%で必ず適用します。</p>
              </div>
              <span className="text-lg font-semibold text-purple-100">{settings.preferredHitRate}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={settings.preferredHitRate}
              onChange={(event) => onPreferredHitRateChange(Number(event.target.value))}
              className="mt-3 w-full accent-purple-300"
            />
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-black/40 p-5 text-white shadow-lg">
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-200">RULES</p>
          <h3 className="text-xl font-semibold">同属性回避</h3>
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <div>
              <p className="font-medium">同じ属性のペアを避ける</p>
              <p className="text-sm text-white/70">人数バランスで不可能な場合のみ許容します。</p>
            </div>
            <button
              type="button"
              onClick={onToggleAvoidSame}
              className={`relative h-10 w-16 rounded-full transition ${
                settings.avoidSameAttribute ? "bg-emerald-400" : "bg-white/20"
              }`}
            >
              <span
                className={`absolute top-1 h-8 w-8 rounded-full bg-white transition ${
                  settings.avoidSameAttribute ? "right-1" : "left-1"
                }`}
              />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

type RouletteViewProps = {
  statusText: string;
  showTrioHint: boolean;
  onOpenRouletteModal: () => void;
  onOpenGiftModal: () => void;
  onReleasePair: (pairId: string) => void;
  disableSpinButton: boolean;
  pairs: PairGroup[];
  totalParticipants: number;
  availableParticipants: Participant[];
  remainingCount: number;
  onBackToSetup: () => void;
  onReset: () => void;
  isSpinning: boolean;
  giftChain: Participant[];
  giftStatusText: string;
  onGiftReset: () => void;
  disableGiftSpinButton: boolean;
  isGiftSpinning: boolean;
  giftRemainingParticipants: Participant[];
  mode: "pair" | "gift";
};

function RouletteView({
  statusText,
  showTrioHint,
  onOpenRouletteModal,
  onOpenGiftModal,
  onReleasePair,
  disableSpinButton,
  pairs,
  totalParticipants,
  availableParticipants,
  remainingCount,
  onBackToSetup,
  onReset,
  isSpinning,
  giftChain,
  giftStatusText,
  onGiftReset,
  disableGiftSpinButton,
  isGiftSpinning,
  giftRemainingParticipants,
  mode,
}: RouletteViewProps) {
  const giftComplete = giftChain.length > 0 && giftRemainingParticipants.length === 0;
  const heroStatus = mode === "pair" ? statusText : giftStatusText;
  const heroButtonDisabled =
    mode === "pair" ? disableSpinButton : isGiftSpinning || totalParticipants < 2;
  const heroButtonLabel =
    mode === "pair"
      ? "ルーレット開始"
      : giftChain.length === 0
      ? "最初の人を抽選する"
      : giftComplete
      ? "全員決定済み"
      : "次の人を抽選する";
  const heroOnClick = mode === "pair" ? onOpenRouletteModal : onOpenGiftModal;
  const relayDisplayChain = [...giftChain].reverse();
  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/80 via-fuchsia-900/50 to-amber-900/40 p-8 text-white shadow-[0_40px_120px_rgba(0,0,0,0.55)]">
        <div className="pointer-events-none absolute inset-0 opacity-40">
          <div className="roulette-grid h-full w-full" />
        </div>
        <div className="relative z-10 flex flex-col items-center text-center">
          <p className="text-sm uppercase tracking-[0.4em] text-fuchsia-200">ROULETTE</p>
          <h2 className="mt-2 text-3xl font-semibold">
            {mode === "pair" ? "ペアリングルーレット" : "プレゼントリレールーレット"}
          </h2>
          <p className="mt-3 text-sm text-white/80">{heroStatus}</p>
          {mode === "pair" && showTrioHint && (
            <p className="mt-2 rounded-full border border-amber-200/40 px-3 py-1 text-xs text-amber-200">
              残り3名のため、自動的にトリオが形成されます。
            </p>
          )}
          <p className="mt-4 text-sm text-white/70">
            {mode === "pair"
              ? "ルーレット開始ボタンを押すと、モーダル内で抽選演出が始まります。"
              : "最初の人を決めてから1人ずつ抽選し、新しく当たった人が直前の当選者へプレゼントを渡します。"}
          </p>
          <button
            type="button"
            onClick={heroOnClick}
            disabled={heroButtonDisabled}
            className={`mt-6 flex items-center gap-3 rounded-full px-8 py-3 text-lg font-semibold transition ${
              heroButtonDisabled
                ? "cursor-not-allowed bg-white/20 text-white/40"
                : "bg-white text-slate-900 shadow-lg shadow-white/40"
            }`}
          >
            {heroButtonLabel}
          </button>
        </div>
      </section>

      {mode === "gift" && (
        <section className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/80 via-indigo-900/40 to-fuchsia-900/40 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.55)] lg:col-span-2">
            <p className="text-sm uppercase tracking-[0.3em] text-indigo-200">GIFT RELAY</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">プレゼントリレールーレット</h3>
            <p className="mt-1 text-sm text-white/80">{giftStatusText}</p>
          {mode === "gift" && (
            <>
              {!isGiftSpinning && (
                <div className="mt-6 flex flex-col gap-4">
                  {giftChain.length === 0 && (
                    <p className="rounded-2xl border border-dashed border-white/25 bg-black/30 p-4 text-center text-white/70">
                      参加者からランダムに最初の人を決め、優先設定を加味しながら順番をつなげます。抽選で新しく当たった人が、直前に当たった人へプレゼントを渡していきます。
                    </p>
                  )}
                  {giftChain.length > 0 && (
                    <>
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        {relayDisplayChain.map((member, index) => {
                          const isLast = index === relayDisplayChain.length - 1;
                          return (
                            <div key={member.id} className="flex items-center gap-3">
                              <div className="min-w-[160px] rounded-2xl border border-white/15 bg-white/10 px-4 py-3 shadow-lg shadow-black/30">
                                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
                                  {index === 0
                                    ? "最新の人"
                                    : isLast
                                    ? "最初に選ばれた人"
                                    : `ステップ ${relayDisplayChain.length - index}`}
                                </p>
                                <p className="text-lg font-bold text-white">{member.name}</p>
                                <p className="text-sm text-white/70">{member.attribute}</p>
                              </div>
                              {!isLast && <span className="text-2xl text-white/60">→</span>}
                            </div>
                          );
                        })}
                      </div>
                      {giftChain.length > 1 && (
                        <div className="flex items-center justify-center gap-2 text-sm text-amber-100">
                          <span className="rounded-full border border-amber-200/50 px-3 py-1 text-xs uppercase tracking-[0.25em]">
                            RELAY
                          </span>
                          <span>
                            {giftComplete
                              ? "全員の受け渡し順が決まりました。"
                              : "新しく当たった人が、直前に当たった人へプレゼントを渡していきます。"}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              {giftChain.length > 0 && giftRemainingParticipants.length > 0 && !isGiftSpinning && (
                <p className="mt-2 text-center text-xs text-white/70">
                  残り {giftRemainingParticipants.length} 人:{" "}
                  {giftRemainingParticipants.map((member) => member.name).join(" / ")}
                </p>
              )}
            </>
          )}
            <div className="mt-6 flex flex-wrap gap-3">
              {(() => {
                const label =
                    giftChain.length === 0
                      ? "最初の人を抽選する"
                      : giftComplete
                      ? "全員決定済み"
                      : "次の人を抽選する";
                return (
                  <button
                    type="button"
                    onClick={onOpenGiftModal}
                    disabled={disableGiftSpinButton}
                    className={`rounded-full px-6 py-3 text-sm font-semibold transition ${
                      disableGiftSpinButton
                        ? "cursor-not-allowed bg-white/10 text-white/50"
                        : "bg-white text-slate-900 shadow-lg shadow-white/30"
                    }`}
                  >
                    {label}
                  </button>
                );
              })()}
              <button
                type="button"
                onClick={onGiftReset}
                disabled={isGiftSpinning || giftChain.length === 0}
                className={`rounded-full border px-6 py-3 text-sm font-semibold transition ${
                  isGiftSpinning || giftChain.length === 0
                    ? "cursor-not-allowed border-white/15 text-white/40"
                    : "border-white/30 text-white hover:border-white hover:text-white"
                }`}
              >
                抽選結果をクリア
              </button>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white shadow-lg">
            <p className="text-sm uppercase tracking-[0.3em] text-fuchsia-200">GUIDE</p>
            <h4 className="mt-2 text-xl font-semibold">優先度付きの順番抽選</h4>
            <ul className="mt-3 space-y-2 text-sm text-white/80">
              <li>最初に「最初の人」を全員からランダム選出。</li>
              <li>次の人をボタンで1人ずつ抽選し、新しく当たった人が直前の人へ渡す。</li>
            </ul>
            <p className="mt-4 rounded-2xl border border-white/15 bg-black/30 p-4 text-xs text-white/60">
              参加者が2名未満のときは開始できません。名簿を増やしてからお試しください。
            </p>
          </div>
        </section>
      )}

      {mode === "pair" && (
        <section className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl lg:col-span-2">
            <div className="flex flex-col gap-2 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-cyan-200">PAIRS</p>
                <h3 className="text-2xl font-semibold text-white">確定済みペア一覧</h3>
              </div>
              <span className="text-sm text-white/70">{pairs.length} 組 / {totalParticipants} 名</span>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {pairs.length === 0 && (
                <p className="rounded-2xl border border-dashed border-white/20 bg-black/20 p-6 text-center text-white/70">
                  まだペアはありません！
                </p>
              )}
              {pairs.map((group, index) => (
                <div
                  key={group.id}
                  className={`relative rounded-2xl border border-white/10 bg-gradient-to-br ${
                    gradientPool[index % gradientPool.length]
                  } p-5 text-slate-900 ${glowPool[index % glowPool.length]}`}
                >
                  <button
                    type="button"
                    onClick={() => onReleasePair(group.id)}
                    disabled={isSpinning}
                    className={`absolute right-4 top-4 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      isSpinning
                        ? "cursor-not-allowed border-slate-900/20 text-slate-900/30"
                        : "border-slate-900/40 text-slate-900/80 hover:border-slate-900/80 hover:text-slate-900"
                    }`}
                  >
                    解除
                  </button>
                  <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-900/70">
                    {group.isTrio ? "TRIO" : "PAIR"} #{index + 1}
                  </p>
                  <p className="mt-2 text-xl font-bold">
                    {group.members.map((member) => member.name).join(" × ")}
                  </p>
                  <p className="text-sm text-slate-900/80">
                    {group.members.map((member) => member.attribute).join(" / ")}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-black/40 p-6 text-white shadow-2xl">
            <p className="text-sm uppercase tracking-[0.3em] text-pink-200">WAITING</p>
            <h3 className="text-2xl font-semibold">未ペア参加者</h3>
            <p className="text-sm text-white/70">残り {remainingCount} 名</p>
            <div className="mt-4 flex flex-col gap-3">
              {availableParticipants.length === 0 && (
                <p className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-4 text-center text-white/70">
                  すべてのペアが決定しました！
                </p>
              )}
              {availableParticipants.map((participant) => (
                <div
                  key={participant.id}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-2"
                >
                  <div>
                    <p className="font-semibold">{participant.name}</p>
                    <p className="text-xs text-white/60">{participant.attribute}</p>
                  </div>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">待機中</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="flex flex-col gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onBackToSetup}
          className="rounded-full border border-white/30 px-6 py-3 text-sm font-semibold text-white transition hover:border-white"
        >
          名簿の編集に戻る
        </button>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onReset}
            className="rounded-full border border-red-400/40 px-6 py-3 text-sm font-semibold text-red-200 transition hover:border-red-300 hover:text-red-50"
          >
            全リセット
          </button>
        </div>
      </div>

    </div>
  );
}
type RouletteModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onReroll: () => void;
  isSpinning: boolean;
  spotlights: string[];
  latestHighlight: PairGroup | null;
  statusText: string;
  disableClose: boolean;
  disableReroll: boolean;
  slotStopped: boolean;
  slotResultName: string | null;
  showSparkle: boolean;
  showPairResultPanel: boolean;
};

function RouletteModal({
  isOpen,
  onClose,
  onReroll,
  isSpinning,
  spotlights,
  latestHighlight,
  statusText,
  disableClose,
  disableReroll,
  slotStopped,
  slotResultName,
  showSparkle,
  showPairResultPanel,
}: RouletteModalProps) {
  if (!isOpen) return null;
  const displaySpotlights = spotlights.length ? spotlights : FALLBACK_SPOTLIGHTS;
  const slotItems = displaySpotlights.length
    ? [...displaySpotlights, ...displaySpotlights, ...displaySpotlights, ...displaySpotlights, ...displaySpotlights, ...displaySpotlights]
    : [...FALLBACK_SPOTLIGHTS, ...FALLBACK_SPOTLIGHTS, ...FALLBACK_SPOTLIGHTS, ...FALLBACK_SPOTLIGHTS];
  const slotHighlight = slotStopped && slotResultName ? slotResultName : slotItems[0] ?? FALLBACK_SPOTLIGHTS[0];
  const burstParticles = useMemo(
    () =>
      Array.from({ length: 18 }).map((_, index) => ({
        id: index,
        rotate: Math.random() * 360,
        distance: 180 + Math.random() * 200,
        delay: Math.random() * 0.25,
      })),
    [showSparkle]
  );
  const showSlotPanel = isSpinning || slotStopped;
  const showResultPanel = showPairResultPanel && Boolean(latestHighlight);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-10">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-4xl overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-br from-slate-950 via-purple-950/70 to-rose-900/70 p-8 text-white shadow-[0_20px_140px_rgba(0,0,0,0.65)]">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.4em] text-fuchsia-200">LIVE ROULETTE</p>
            <p className="text-3xl font-semibold">{statusText}</p>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <button
              type="button"
              onClick={onClose}
              disabled={disableClose}
              className={`rounded-full border px-4 py-2 text-sm transition ${
                disableClose
                  ? "cursor-not-allowed border-white/10 text-white/30"
                  : "border-white/30 text-white/90 hover:border-white hover:text-white"
              }`}
            >
              閉じる
            </button>
            <button
              type="button"
              onClick={onReroll}
              disabled={disableReroll}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                disableReroll
                  ? "cursor-not-allowed border-white/10 text-white/30"
                  : "border-amber-200/70 text-amber-50 hover:border-amber-100 hover:text-white"
              }`}
            >
              再抽選
            </button>
          </div>
        </div>
        <div className="relative mt-8 min-h-[280px] w-full text-center">
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center gap-6 transition-opacity duration-500 ${
              showSlotPanel ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
            aria-hidden={!showSlotPanel}
          >
            <div className="relative flex w-full justify-center overflow-visible">
              <div
                className={`slot-window slot-slide ${
                  slotStopped ? "slot-stop" : ""
                } flex h-[96px] w-[220px] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/15 px-0 text-2xl font-bold shadow-[0_0_40px_rgba(236,72,153,0.35)]`}
              >
                {slotStopped ? (
                  <div className="slot-cell text-2xl font-bold">{slotHighlight}</div>
                ) : (
                  <div className="slot-track">
                    {slotItems.map((item, itemIndex) => (
                      <div key={`pair-slot-item-${itemIndex}`} className="slot-cell">
                        {item}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <p className="mt-4 text-lg text-white/80">ドキドキ...！</p>
          </div>
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center gap-6 transition-opacity duration-500 ${
              showResultPanel ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
            aria-hidden={!showResultPanel}
          >
            {latestHighlight && (
              <div className="w-full rounded-3xl border border-white/20 bg-black/30 p-8 shadow-[0_0_80px_rgba(251,191,36,0.4)]">
                <p className="text-sm uppercase tracking-[0.4em] text-amber-200">RESULT</p>
                <p className="mt-4 text-4xl font-black tracking-wide">
                  {latestHighlight.isTrio ? "スペシャルトリオ" : "ペア"} 決定！
                </p>
                <p className="mt-6 text-5xl font-bold">
                  {latestHighlight.members.map((member) => member.name).join(" × ")}
                </p>
                <p className="mt-3 text-lg text-white/80">
                  {latestHighlight.members.map((member) => member.attribute).join(" / ")}
                </p>
              </div>
            )}
          </div>
          {!showSlotPanel && !showResultPanel && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-lg text-white/80">参加者の準備ができたらルーレットをスタートしましょう。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type ResetConfirmDialogProps = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function ResetConfirmDialog({ open, onCancel, onConfirm }: ResetConfirmDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/20 bg-slate-950/90 p-6 text-white shadow-2xl">
        <p className="text-sm uppercase tracking-[0.4em] text-amber-200">Warning</p>
        <h3 className="mt-3 text-2xl font-semibold">全データをリセットしますか？</h3>
        <p className="mt-2 text-sm text-white/70">
          参加者リスト、確定済みペア、設定、キャッシュが完全に削除されます。元に戻すことはできません。
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-white/30 px-5 py-2 text-sm text-white/80 transition hover:text-white"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full border border-red-400/60 px-5 py-2 text-sm font-semibold text-red-100 transition hover:border-red-300 hover:text-white"
          >
            全データを削除
          </button>
        </div>
      </div>
    </div>
  );
}

type GiftResetConfirmDialogProps = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  disableConfirm: boolean;
};

function GiftResetConfirmDialog({ open, onCancel, onConfirm, disableConfirm }: GiftResetConfirmDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/20 bg-slate-950/90 p-6 text-white shadow-2xl">
        <p className="text-sm uppercase tracking-[0.4em] text-indigo-200">Confirm</p>
        <h3 className="mt-3 text-2xl font-semibold">抽選結果をクリアしますか？</h3>
        <p className="mt-2 text-sm text-white/70">
          現在の受け渡し順がすべて削除されます。あとから元に戻すことはできません。
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-white/30 px-5 py-2 text-sm text-white/80 transition hover:text-white"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={disableConfirm}
            className={`rounded-full border px-5 py-2 text-sm font-semibold transition ${
              disableConfirm
                ? "cursor-not-allowed border-white/15 text-white/40"
                : "border-indigo-300/70 text-indigo-50 hover:border-indigo-200 hover:text-white"
            }`}
          >
            抽選結果をクリア
          </button>
        </div>
      </div>
    </div>
  );
}

export default RouletteApp;
