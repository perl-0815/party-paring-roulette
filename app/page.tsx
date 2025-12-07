"use client";

import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(244,114,182,0.25),_rgba(2,6,23,1))] pb-16 text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 pt-12 lg:px-8">
        <header className="rounded-3xl border border-white/10 bg-black/50 p-8 text-white shadow-[0_40px_140px_rgba(3,7,18,0.8)]">
          <p className="text-sm uppercase tracking-[0.4em] text-pink-200">PARTY TOOL</p>
          <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight md:text-5xl">
            パーティルーレット
          </h1>
          <p className="mt-3 text-lg text-white/80">
            ペアリングルーレットとプレゼントリレーが行えます。
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <Link
            href="/pairing"
            className="group flex h-full flex-col justify-between rounded-3xl border border-emerald-200/30 bg-gradient-to-br from-emerald-500/20 via-emerald-400/10 to-slate-900/60 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.4)] transition hover:-translate-y-1 hover:border-emerald-200"
          >
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-emerald-100">Pairing</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">ペアリングルーレット</h2>
              <p className="mt-3 text-sm text-white/80">
                優先組み合わせと同属性回避を使ってペア/トリオを決定できます。
              </p>
            </div>
            <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-emerald-50">
              ペアリングページへ
              <span aria-hidden className="transition group-hover:translate-x-1">→</span>
            </span>
          </Link>

          <Link
            href="/gift"
            className="group flex h-full flex-col justify-between rounded-3xl border border-indigo-200/30 bg-gradient-to-br from-indigo-500/20 via-indigo-400/10 to-slate-900/60 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.4)] transition hover:-translate-y-1 hover:border-indigo-200"
          >
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-indigo-100">Gift Relay</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">プレゼントリレールーレット</h2>
              <p className="mt-3 text-sm text-white/80">
                最初の人を決めてから1人ずつ抽選し、新しく選ばれた人が直前の人へプレゼントを渡します。
              </p>
            </div>
            <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-indigo-50">
              プレゼントリレーページへ
              <span aria-hidden className="transition group-hover:translate-x-1">→</span>
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
