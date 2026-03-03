'use client';

import {useTheme} from 'next-themes';
import {Sun, Moon, Monitor} from 'lucide-react';
import {useEffect, useState} from 'react';

const themes = [
    {key: 'light', label: '浅色', icon: Sun},
    {key: 'dark', label: '深色', icon: Moon},
    {key: 'system', label: '系统', icon: Monitor},
] as const;

export function ThemeToggle() {
    const {theme, setTheme} = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    if (!mounted) {
        return (
            <div className="flex gap-2">
                {themes.map((t) => (
                    <div key={t.key} className="h-8 w-16 animate-pulse rounded-md bg-bg-hover" />
                ))}
            </div>
        );
    }

    return (
        <div className="flex gap-2">
            {themes.map((t) => {
                const active = theme === t.key;
                return (
                    <button
                        key={t.key}
                        onClick={() => setTheme(t.key)}
                        className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                            active
                                ? 'bg-accent text-white'
                                : 'border border-border text-text-secondary hover:bg-bg-hover'
                        }`}
                    >
                        <t.icon className="h-3.5 w-3.5" />
                        {t.label}
                    </button>
                );
            })}
        </div>
    );
}

export function ThemeToggleCompact() {
    const {theme, setTheme, resolvedTheme} = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    if (!mounted) {
        return <div className="h-8 w-8 animate-pulse rounded-md bg-bg-hover" />;
    }

    const isDark = resolvedTheme === 'dark';

    return (
        <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            title={isDark ? '切换到浅色' : '切换到深色'}
        >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
    );
}
