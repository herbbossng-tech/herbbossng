import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'COD Commerce',
  description: 'Multi-country cash-on-delivery commerce platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
