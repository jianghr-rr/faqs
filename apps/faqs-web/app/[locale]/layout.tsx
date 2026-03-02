import type {Metadata} from 'next';
import {Inter, Lexend} from 'next/font/google';
import {ThemeProvider} from 'next-themes';
import NextTopLoader from 'nextjs-toploader';
import './globals.css';

const inter = Inter({
    subsets: ['latin'],
    variable: '--font-inter',
});

const lexend = Lexend({
    subsets: ['latin'],
    variable: '--font-lexend',
});

export const metadata: Metadata = {
    title: 'FAQs',
    description: 'FAQs Application',
};

export default async function RootLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{locale: string}>;
}) {
    const {locale} = await params;

    return (
        <html lang={locale} suppressHydrationWarning>
            <body className={`${inter.variable} ${lexend.variable} antialiased`}>
                <NextTopLoader showSpinner={false} />
                <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                    {children}
                </ThemeProvider>
            </body>
        </html>
    );
}
