"use client";

import type { Participant } from "../page";

type GiftRouletteModalProps = {
  isOpen: boolean;
  onClose: () => void;
  isSpinning: boolean;
  spotlights: string[];
  statusText: string;
  chain: Participant[];
  remainingParticipants: Participant[];
  onSpin: () => void;
  disableSpin: boolean;
  onReset: () => void;
  edges: { from: Participant; to: Participant }[];
};

const FALLBACK_SPOTLIGHTS = ["Ready", "Set", "Go"];

export function GiftRouletteModal({
  isOpen,
  onClose,
  isSpinning,
  spotlights,
  statusText,
  chain,
  remainingParticipants,
  onSpin,
  disableSpin,
  onReset,
  edges,
}: GiftRouletteModalProps) {
  if (!isOpen) return null;
  const displaySpotlights = spotlights.length ? spotlights : FALLBACK_SPOTLIGHTS;
  const primarySpotlight = displaySpotlights[0];
  const latestEdge = edges.length ? edges[edges.length - 1] : null;
  const isComplete = chain.length > 1 && remainingParticipants.length === 0;
  const finalHandoff = isComplete && edges.length ? edges[edges.length - 1] : null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-10">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-4xl overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-br from-slate-950 via-indigo-950/70 to-rose-900/60 p-8 text-white shadow-[0_20px_140px_rgba(0,0,0,0.65)]">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.4em] text-indigo-200">Gift Relay</p>
            <p className="text-3xl font-semibold">{statusText}</p>
            <p className="text-sm text-white/70">抽選を1回ずつ進め、新しく当たった人が直前の人へプレゼントを渡します。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSpinning}
            className={`rounded-full border px-4 py-2 text-sm transition ${
              isSpinning
                ? "cursor-not-allowed border-white/10 text-white/30"
                : "border-white/30 text-white/90 hover:border-white hover:text-white"
            }`}
          >
            閉じる
          </button>
        </div>
        <div className="mt-8 flex flex-col gap-6">
          {isSpinning && (
            <div className="flex flex-col items-center gap-4">
              <div className="animate-pulse rounded-[24px] border border-indigo-300/50 bg-white/10 px-10 py-8 text-4xl font-black tracking-wide text-white shadow-[0_0_60px_rgba(99,102,241,0.35)]">
                {primarySpotlight}
              </div>
              <p className="text-lg text-white/80">次の1人を抽選中…</p>
            </div>
          )}
          {!isSpinning && (
            <div className="space-y-6">
              {chain.length === 0 && (
                <p className="rounded-2xl border border-dashed border-white/15 bg-black/30 p-4 text-center text-white/70">
                  ボタンを押して最初の人を決定しましょう。決まったら、次に当たった人が1つ前の人へ渡す順番を1人ずつ抽選できます。
                </p>
              )}
              {latestEdge && (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-full max-w-3xl rounded-3xl border border-indigo-200/60 bg-gradient-to-r from-indigo-500/25 via-purple-500/20 to-pink-500/25 px-6 py-6 text-white shadow-[0_0_50px_rgba(99,102,241,0.35)]">
                    <p className="text-xs uppercase tracking-[0.3em] text-indigo-100/80">最新の受け渡し</p>
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-2xl font-black">
                      <span className="rounded-2xl border border-white/30 bg-white/15 px-4 py-2">{latestEdge.from.name}</span>
                      <span className="text-white/70">が</span>
                      <span className="rounded-2xl border border-white/30 bg-white/15 px-4 py-2">{latestEdge.to.name}</span>
                    </div>
                    <p className="mt-2 text-sm text-white/70">
                      属性: {latestEdge.from.attribute} → {latestEdge.to.attribute}
                    </p>
                  </div>
                </div>
              )}
              {isComplete && (
                <div className="flex items-center justify-center gap-2 text-sm text-amber-100">
                  <span className="rounded-full border border-amber-200/50 px-3 py-1 text-xs uppercase tracking-[0.25em]">
                    RELAY
                  </span>
                  <span>すべての受け渡し順が確定しました！</span>
                </div>
              )}
              {finalHandoff && (
                <div className="rounded-2xl border border-indigo-200/50 bg-white/5 p-4 text-center shadow-[0_0_50px_rgba(99,102,241,0.25)]">
                  <p className="text-xs uppercase tracking-[0.3em] text-indigo-100/80">最終の受け渡し</p>
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-xl font-bold">
                    <span className="rounded-xl border border-white/25 bg-white/10 px-3 py-1">{finalHandoff.from.name}</span>
                    <span className="text-white/70">が</span>
                    <span className="rounded-xl border border-white/25 bg-white/10 px-3 py-1">{finalHandoff.to.name}</span>
                    <span className="text-white/70">へ渡します！</span>
                  </div>
                  <p className="mt-1 text-xs text-white/60">
                    属性: {finalHandoff.from.attribute} → {finalHandoff.to.attribute}
                  </p>
                </div>
              )}
              {remainingParticipants.length > 0 && (
                <p className="text-center text-sm text-white/70">
                  残り {remainingParticipants.length} 人: {remainingParticipants.map((member) => member.name).join(" / ")}
                </p>
              )}
            </div>
          )}
          <div className="flex flex-wrap justify-between gap-3">
            <button
              type="button"
              onClick={onSpin}
              disabled={disableSpin}
              className={`rounded-full px-6 py-3 text-sm font-semibold transition ${
                disableSpin
                  ? "cursor-not-allowed bg-white/10 text-white/50"
                  : "bg-white text-slate-900 shadow-lg shadow-white/30"
              }`}
            >
              {disableSpin && chain.length > 0 && remainingParticipants.length === 0
                ? "全員決定済み"
                : chain.length === 0
                ? "最初の人を抽選する"
                : "次の人を抽選する"}
            </button>
            <button
              type="button"
              onClick={onReset}
              disabled={isSpinning || chain.length === 0}
              className={`rounded-full border px-6 py-3 text-sm font-semibold transition ${
                isSpinning || chain.length === 0
                  ? "cursor-not-allowed border-white/15 text-white/40"
                  : "border-white/30 text-white hover:border-white hover:text-white"
              }`}
            >
              抽選結果をクリア
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
