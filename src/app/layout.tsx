import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AUDIO CARDS",
  description: "Upload audio. Share on Twitter. Play inline.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
