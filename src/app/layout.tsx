import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Checklist de Módulos",
  description:
    "Checklist colaborativo en tiempo real con Next.js, Prisma, PostgreSQL (Supabase) y Supabase Realtime.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
