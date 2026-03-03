'use client';

import {ThemeProvider} from 'next-themes';
import NextTopLoader from 'nextjs-toploader';

export function Providers({children}: {children: React.ReactNode}) {
    return (
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
            <NextTopLoader color="#2962ff" showSpinner={false} />
            {children}
        </ThemeProvider>
    );
}
