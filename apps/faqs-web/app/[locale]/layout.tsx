import type {Metadata} from 'next';
import {Inter, Lexend, JetBrains_Mono} from 'next/font/google';
import {ThemeProvider} from 'next-themes';
import NextTopLoader from 'nextjs-toploader';
import {createClient} from '~/lib/supabase/server';
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
    viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
};

export default async function RootLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{locale: string}>;
}) {
    const {locale} = await params;

    const supabase = await createClient();
    const {
        data: {user},
    } = await supabase.auth.getUser();

    return (
        <html lang={locale} suppressHydrationWarning>
            <body
                className={`${inter.variable} ${lexend.variable} ${jetbrainsMono.variable} bg-bg-base font-inter text-text-primary antialiased`}
            >
                <NextTopLoader color="#2962ff" showSpinner={false} />
                <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
                    <TopNavbar user={user} className="hidden lg:flex" />
                    <MobileHeader className="flex lg:hidden" />

                    <main className="pb-14 lg:pb-0">{children}</main>

                    <BottomTabs user={user} className="flex lg:hidden" />
                </ThemeProvider>
            </body>
        </html>
    );
}
