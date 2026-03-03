'use client';

import {useTheme} from 'next-themes';
import {Sun, Moon, Palette} from 'lucide-react';
import {useEffect, useState} from 'react';

export function ThemeMenuRow() {
    const {resolvedTheme, setTheme} = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    const isDark = mounted && resolvedTheme === 'dark';

    return (
        <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="flex w-full items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-hover active:bg-bg-hover"
        >
            <Palette className="h-5 w-5 text-text-secondary" />
            <span className="flex-1 text-left text-sm text-text-primary">主题</span>
            <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                {mounted ? (
                    <>
                        {isDark ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
                        {isDark ? '深色' : '浅色'}
                    </>
                ) : (
                    <span className="h-4 w-8 animate-pulse rounded bg-bg-hover" />
                )}
            </span>
        </button>
    );
}
