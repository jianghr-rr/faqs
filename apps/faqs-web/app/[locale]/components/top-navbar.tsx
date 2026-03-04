'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import type {User} from '@supabase/supabase-js';
import {LogOut, Settings, Star, ChevronDown} from 'lucide-react';
import {useState, useRef, useEffect} from 'react';
import {signOut} from '~/actions/auth';
import {ThemeToggleCompact} from './theme-toggle';

type NavItem = {
    href: string;
    label: string;
    requireAuth?: boolean;
};

const navItems: NavItem[] = [
    {href: '/', label: '知识库'},
    {href: '/chat', label: '聊天'},
    {href: '/analysis', label: '分析', requireAuth: true},
    {href: '/my-faqs', label: '我的', requireAuth: true},
];

function isActive(pathname: string, href: string) {
    const stripped = pathname.replace(/^\/(zh|en)/, '') || '/';
    if (href === '/') return stripped === '/';
    return stripped.startsWith(href);
}

export function TopNavbar({user, className = ''}: {user: User | null; className?: string}) {
    const pathname = usePathname();
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const visibleItems = navItems.filter((item) => !item.requireAuth || user);

    return (
        <header className={`sticky top-0 z-50 h-14 border-b border-border bg-bg-card ${className}`}>
            <div className="mx-auto flex h-full max-w-6xl items-center px-6">
                <Link href="/" className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-accent" />
                    <span className="font-lexend text-lg font-semibold text-text-primary">FinAgents</span>
                </Link>

                <nav className="ml-10 flex items-center gap-1">
                    {visibleItems.map((item) => {
                        const active = isActive(pathname, item.href);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`relative px-4 py-4 text-[13px] font-medium transition-colors ${
                                    active
                                        ? 'text-text-primary'
                                        : 'text-text-secondary hover:text-text-primary'
                                }`}
                            >
                                {item.label}
                                {active && (
                                    <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-accent" />
                                )}
                            </Link>
                        );
                    })}
                </nav>

                <div className="ml-auto flex items-center gap-2">
                    <ThemeToggleCompact />
                    {user ? (
                        <div className="relative" ref={menuRef}>
                            <button
                                onClick={() => setMenuOpen(!menuOpen)}
                                className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-bg-hover"
                            >
                                {user.user_metadata?.avatar_url ? (
                                    <img
                                        src={user.user_metadata.avatar_url}
                                        alt=""
                                        className="h-8 w-8 rounded-full"
                                    />
                                ) : (
                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-medium text-white">
                                        {(user.email?.[0] ?? 'U').toUpperCase()}
                                    </div>
                                )}
                                <ChevronDown className="h-4 w-4 text-text-secondary" />
                            </button>

                            {menuOpen && (
                                <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-border bg-bg-card py-1 shadow-lg">
                                    <div className="border-b border-border px-4 py-2">
                                        <p className="truncate text-sm font-medium text-text-primary">
                                            {user.user_metadata?.name ?? user.email?.split('@')[0]}
                                        </p>
                                        <p className="truncate text-xs text-text-secondary">{user.email}</p>
                                    </div>
                                    <Link
                                        href="/favorites"
                                        onClick={() => setMenuOpen(false)}
                                        className="flex w-full items-center gap-2 px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                                    >
                                        <Star className="h-4 w-4" />
                                        我的收藏
                                    </Link>
                                    <Link
                                        href="/settings"
                                        onClick={() => setMenuOpen(false)}
                                        className="flex w-full items-center gap-2 px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                                    >
                                        <Settings className="h-4 w-4" />
                                        设置
                                    </Link>
                                    <button
                                        onClick={() => signOut()}
                                        className="flex w-full items-center gap-2 px-4 py-2 text-sm text-danger transition-colors hover:bg-bg-hover"
                                    >
                                        <LogOut className="h-4 w-4" />
                                        退出登录
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <Link
                            href="/login"
                            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
                        >
                            登录
                        </Link>
                    )}
                </div>
            </div>
        </header>
    );
}
