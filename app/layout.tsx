import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ink AFK Tracker V2",
  description: "Suivi automatique de l'AFK World Ink Game pour Ilan, Ruben et Naïm",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
