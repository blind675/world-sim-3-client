import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Life Simulation v3 — Viewer',
  description: 'Terrain viewer for Life Simulation v3',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-mono">{children}</body>
    </html>
  );
}
