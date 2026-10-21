import type { Metadata } from 'next';
import { Montserrat } from 'next/font/google';
import './globals.css';

const montserrat = Montserrat({
  variable: '--font-montserrat',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://eventos.qualitycert.com.br'),
  title: 'Sorteio Qualitycert',
  description: 'Confirme sua participação nos sorteios da Qualitycert em eventos.',
  openGraph: {
    title: 'Sorteio Qualitycert',
    description: 'Participe. Conecte-se. Boa sorte!',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Sorteio Qualitycert' }],
    locale: 'pt_BR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sorteio Qualitycert',
    description: 'Participe. Conecte-se. Boa sorte!',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={montserrat.variable}
      >
        {children}
      </body>
    </html>
  );
}
