import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Speech App — TTS & STT",
  description: "Text-to-speech and speech-to-text powered by Azure Cognitive Services",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
