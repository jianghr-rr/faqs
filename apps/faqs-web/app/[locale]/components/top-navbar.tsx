'use client';

import Link from 'next/link';
import {usePathname, useRouter} from 'next/navigation';
import type {User} from '@supabase/supabase-js';
import {LogOut, Settings, Star, ChevronDown, Loader2} from 'lucide-react';
import {useState, useRef, useEffect, useTransition} from 'react';
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

function isModifiedEvent(event: React.MouseEvent<HTMLAnchorElement>) {
    return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

export function TopNavbar({user, className = ''}: {user: User | null; className?: string}) {
    const pathname = usePathname();
    const router = useRouter();
    const [menuOpen, setMenuOpen] = useState(false);
    const [pendingHref, setPendingHref] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
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

    useEffect(() => {
        setPendingHref(null);
    }, [pathname]);

    const visibleItems = navItems.filter((item) => !item.requireAuth || user);

    function handleRouteClick(event: React.MouseEvent<HTMLAnchorElement>, href: string, closeMenu = false) {
        if (closeMenu) {
            setMenuOpen(false);
        }
        if (event.defaultPrevented || isModifiedEvent(event) || isActive(pathname, href)) {
            return;
        }
        event.preventDefault();
        setPendingHref(href);
        startTransition(() => {
            router.push(href);
        });
    }

    return (
        <header className={`sticky top-0 z-50 h-14 border-b border-border bg-bg-card ${className}`}>
            <div className="mx-auto flex h-full max-w-6xl items-center px-6">
                <Link
                    href="/"
                    onClick={(event) => handleRouteClick(event, '/')}
                    aria-busy={pendingHref === '/' && isPending}
                    className="flex items-center gap-2"
                >
                    <div className="h-2 w-2 rounded-full bg-accent" />
                    <span
                        className={`font-lexend text-lg font-semibold text-text-primary ${
                            pendingHref === '/' && isPending ? 'animate-pulse' : ''
                        }`}
                    >
                        FinAgents
                    </span>
                </Link>

                <nav className="ml-10 flex items-center gap-1">
                    {visibleItems.map((item) => {
                        const active = isActive(pathname, item.href);
                        const pending = pendingHref === item.href && isPending;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={(event) => handleRouteClick(event, item.href)}
                                aria-busy={pending}
                                className={`relative px-4 py-4 text-[13px] font-medium transition-colors ${
                                    active || pending
                                        ? 'text-text-primary'
                                        : 'text-text-secondary hover:text-text-primary'
                                }`}
                            >
                                <span className="flex items-center gap-1.5">
                                    {item.label}
                                    {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />}
                                </span>
                                {(active || pending) && (
                                    <span
                                        className={`absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-accent ${
                                            pending ? 'animate-pulse' : ''
                                        }`}
                                    />
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
                                        onClick={(event) => handleRouteClick(event, '/favorites', true)}
                                        aria-busy={pendingHref === '/favorites' && isPending}
                                        className="flex w-full items-center gap-2 px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                                    >
                                        <Star className="h-4 w-4" />
                                        我的收藏
                                    </Link>
                                    <Link
                                        href="/settings"
                                        onClick={(event) => handleRouteClick(event, '/settings', true)}
                                        aria-busy={pendingHref === '/settings' && isPending}
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
                            onClick={(event) => handleRouteClick(event, '/login')}
                            aria-busy={pendingHref === '/login' && isPending}
                            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
                        >
                            <span className="flex items-center gap-1.5">
                                登录
                                {pendingHref === '/login' && isPending && (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                )}
                            </span>
                        </Link>
                    )}
                </div>
            </div>
        </header>
    );
}
