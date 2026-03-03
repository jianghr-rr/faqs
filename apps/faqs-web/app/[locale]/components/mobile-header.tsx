'use client';

import {usePathname, useRouter} from 'next/navigation';
import {ArrowLeft, Search} from 'lucide-react';

const titleMap: Record<string, string> = {
    '/': 'FinAgents',
    '/chat': '聊天',
    '/analysis': '分析',
    '/profile': '我的',
    '/login': '登录',
    '/settings': '设置',
    '/my-faqs': '我的 FAQ',
};

function getTitle(pathname: string) {
    const stripped = pathname.replace(/^\/(zh|en)/, '') || '/';
    return titleMap[stripped] ?? 'FinAgents';
}

function isTabRoot(pathname: string) {
    const stripped = pathname.replace(/^\/(zh|en)/, '') || '/';
    return ['/', '/chat', '/analysis', '/profile'].includes(stripped);
}

export function MobileHeader({className = ''}: {className?: string}) {
    const pathname = usePathname();
    const router = useRouter();
    const showBack = !isTabRoot(pathname);
    const title = getTitle(pathname);
    const isHome = (pathname.replace(/^\/(zh|en)/, '') || '/') === '/';

    return (
        <header className={`sticky top-0 z-40 h-12 border-b border-border bg-bg-card ${className}`}>
            <div className="flex h-full items-center px-4">
                <div className="flex w-10 items-center">
                    {showBack && (
                        <button
                            onClick={() => router.back()}
                            className="flex h-10 w-10 items-center justify-center text-text-primary"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                    )}
                </div>

                <h1 className="flex-1 text-center font-lexend text-base font-semibold text-text-primary">
                    {title}
                </h1>

                <div className="flex w-10 items-center justify-end">
                    {isHome && (
                        <button className="flex h-10 w-10 items-center justify-center text-text-secondary">
                            <Search className="h-5 w-5" />
                        </button>
                    )}
                </div>
            </div>
        </header>
    );
}
