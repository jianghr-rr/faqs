'use client';

import Link from 'next/link';
import {usePathname, useRouter} from 'next/navigation';
import {Home, MessageCircle, BarChart3, User, Loader2} from 'lucide-react';
import type {AppUser} from '~/lib/auth/types';
import {useEffect, useState, useTransition} from 'react';

const tabs = [
    {key: 'home', href: '/', icon: Home, label: '首页'},
    {key: 'chat', href: '/chat', icon: MessageCircle, label: '聊天'},
    {key: 'analysis', href: '/analysis', icon: BarChart3, label: '分析'},
    {key: 'profile', href: '/profile', icon: User, label: '我的'},
];

function isActive(pathname: string, href: string) {
    const stripped = pathname.replace(/^\/(zh|en)/, '') || '/';
    if (href === '/') return stripped === '/';
    return stripped.startsWith(href);
}

function isModifiedEvent(event: React.MouseEvent<HTMLAnchorElement>) {
    return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

export function BottomTabs({user, className = ''}: {user: AppUser | null; className?: string}) {
    const pathname = usePathname();
    const router = useRouter();
    const [pendingHref, setPendingHref] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        setPendingHref(null);
    }, [pathname]);

    function handleRouteClick(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
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
        <nav
            className={`fixed inset-x-0 bottom-0 z-50 border-t border-border bg-bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur ${className}`}
        >
            <div className="flex h-14 w-full">
                {tabs.map((tab) => {
                    const active = isActive(pathname, tab.href);
                    const needsAuth = tab.key === 'analysis' && !user;
                    const href = needsAuth ? '/login?next=/analysis' : tab.href;
                    const pending = pendingHref === href && isPending;

                    return (
                        <Link
                            key={tab.key}
                            href={href}
                            onClick={(event) => handleRouteClick(event, href)}
                            aria-busy={pending}
                            className={`flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors ${
                                active || pending ? 'text-accent' : 'text-text-secondary'
                            }`}
                        >
                            {pending ? (
                                <Loader2 className="h-6 w-6 animate-spin" strokeWidth={2} />
                            ) : (
                                <tab.icon className="h-6 w-6" strokeWidth={active ? 2 : 1.5} />
                            )}
                            <span className="text-[10px] font-medium">{tab.label}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
