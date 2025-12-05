import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "パーティペアリングルーレット",
  description:
    "属性バランスと優先ルールに対応した Next.js 製のパーティ向けルーレットツール。ブラウザのみで完結します。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
