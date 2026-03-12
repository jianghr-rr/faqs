import type {Metadata, Viewport} from 'next';
import {Inter, Lexend, JetBrains_Mono} from 'next/font/google';
import {getCurrentUser} from '~/lib/supabase/server';
import {Providers} from './providers';
import {TopNavbar} from './components/top-navbar';
import {BottomTabs} from './components/bottom-tabs';
import {MobileHeader} from './components/mobile-header';
import './globals.css';

const inter = Inter({
    subsets: ['latin'],
    variable: '--font-inter',
});

const lexend = Lexend({
    subsets: ['latin'],
    variable: '--font-lexend',
});

const jetbrainsMono = JetBrains_Mono({
    subsets: ['latin'],
    variable: '--font-mono',
});

export const metadata: Metadata = {
    title: 'FinAgents OS',
    description: 'FinAgents Operating System',
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
};

export default async function RootLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{locale: string}>;
}) {
    const {locale} = await params;
    const user = await getCurrentUser();

    return (
        <html lang={locale} suppressHydrationWarning>
            <body
                className={`${inter.variable} ${lexend.variable} ${jetbrainsMono.variable} bg-bg-base font-inter text-text-primary antialiased`}
            >
                <Providers>
                    <TopNavbar user={user} className="hidden lg:block" />
                    <MobileHeader className="block lg:hidden" />

                    <main className="pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">{children}</main>

                    <BottomTabs user={user} className="block lg:hidden" />
                </Providers>
            </body>
        </html>
    );
}
