import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Competitor Monitoring · Meta Ad Library',
  description: 'Veille concurrentielle via la Meta Ad Library',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
