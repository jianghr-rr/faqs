'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {Home, MessageCircle, BarChart3, User} from 'lucide-react';
import type {User as SupabaseUser} from '@supabase/supabase-js';

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

export function BottomTabs({user, className = ''}: {user: SupabaseUser | null; className?: string}) {
    const pathname = usePathname();

    return (
        <nav
            className={`fixed inset-x-0 bottom-0 z-50 border-t border-border bg-bg-card pb-[env(safe-area-inset-bottom)] ${className}`}
        >
            <div className="flex h-14">
                {tabs.map((tab) => {
                    const active = isActive(pathname, tab.href);
                    const needsAuth = tab.key === 'analysis' && !user;
                    const href = needsAuth ? '/login?next=/analysis' : tab.href;

                    return (
                        <Link
                            key={tab.key}
                            href={href}
                            className={`flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors ${
                                active ? 'text-accent' : 'text-text-secondary'
                            }`}
                        >
                            <tab.icon className="h-6 w-6" strokeWidth={active ? 2 : 1.5} />
                            <span className="text-[10px] font-medium">{tab.label}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
