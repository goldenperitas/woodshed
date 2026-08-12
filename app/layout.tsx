import type { Metadata, Viewport } from "next";
import "./globals.css";
import RegisterSW from "@/components/RegisterSW";
import PullToRefresh from "@/components/PullToRefresh";

export const metadata: Metadata = {
  title: "Woodshed",
  description: "ジャズスタンダードを叩き込むための棚",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Woodshed" },
};

export const viewport: Viewport = {
  themeColor: "#16130E",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        <PullToRefresh />
        <div className="app-shell">{children}</div>
        <RegisterSW />
      </body>
    </html>
  );
}
