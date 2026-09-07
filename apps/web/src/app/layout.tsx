import type { Metadata } from "next";
import type { ReactNode } from "react";

import { content } from "../lib/content";
import "./globals.css";

export const metadata: Metadata = {
  title: content.appName,
  description: content.tagline,
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
