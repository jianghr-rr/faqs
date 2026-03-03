import Link from 'next/link';
import {createClient} from '~/lib/supabase/server';
import {FileText, Star, BarChart3, Key, Globe, ChevronRight, MessageCircle} from 'lucide-react';
import {SignOutButton} from '../sign-out-button';
import {ThemeMenuRow} from './theme-menu-row';

type MenuItem = {
    icon: React.ElementType;
    label: string;
    href?: string;
};

const authMenuItems: MenuItem[] = [
    {icon: FileText, label: '我的 FAQ', href: '/my-faqs'},
    {icon: Star, label: '我的收藏', href: '/my-faqs'},
    {icon: BarChart3, label: '分析历史', href: '/analysis'},
];

const publicMenuItems: MenuItem[] = [
    {icon: FileText, label: '浏览 FAQ', href: '/'},
    {icon: MessageCircle, label: '开始聊天', href: '/chat'},
    {icon: Globe, label: '语言设置', href: '/settings'},
];

function MenuGroup({items, children}: {items?: MenuItem[]; children?: React.ReactNode}) {
    return (
        <div className="overflow-hidden rounded-lg border border-border bg-bg-card">
            {items?.map((item, i) => (
                <Link
                    key={item.label}
                    href={item.href ?? '#'}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-hover active:bg-bg-hover ${
                        i > 0 ? 'border-t border-border' : ''
                    }`}
                >
                    <item.icon className="h-5 w-5 text-text-secondary" />
                    <span className="flex-1 text-sm text-text-primary">{item.label}</span>
                    <ChevronRight className="h-4 w-4 text-text-disabled" />
                </Link>
            ))}
            {children}
        </div>
    );
}

export default async function ProfilePage() {
    const supabase = await createClient();
    const {
        data: {user},
    } = await supabase.auth.getUser();

    if (!user) {
        return (
            <div className="mx-auto max-w-lg px-4 py-8">
                <div className="mb-8 flex flex-col items-center gap-3">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bg-card text-text-disabled">
                        <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                        </svg>
                    </div>
                    <p className="text-sm text-text-secondary">登录以使用完整功能</p>
                    <Link
                        href="/login"
                        className="w-full rounded-lg bg-accent px-6 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-accent-hover active:scale-[0.98]"
                    >
                        登录 / 注册
                    </Link>
                </div>

                <div className="space-y-3">
                    <MenuGroup items={publicMenuItems} />
                    <MenuGroup>
                        <ThemeMenuRow />
                    </MenuGroup>
                </div>
            </div>
        );
    }

    const displayName =
        user.user_metadata?.name ?? user.user_metadata?.full_name ?? user.email?.split('@')[0];

    return (
        <div className="mx-auto max-w-lg px-4 py-6">
            <div className="mb-6 flex items-center gap-3 rounded-lg border border-border bg-bg-card p-4">
                {user.user_metadata?.avatar_url ? (
                    <img src={user.user_metadata.avatar_url} alt="" className="h-12 w-12 rounded-full" />
                ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-lg font-semibold text-white">
                        {(displayName?.[0] ?? 'U').toUpperCase()}
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-primary">{displayName}</p>
                    <p className="truncate text-xs text-text-secondary">{user.email}</p>
                </div>
            </div>

            <div className="space-y-3">
                <MenuGroup items={authMenuItems} />

                <MenuGroup>
                    <Link
                        href="/settings"
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-hover active:bg-bg-hover"
                    >
                        <Key className="h-5 w-5 text-text-secondary" />
                        <span className="flex-1 text-sm text-text-primary">API Key 管理</span>
                        <ChevronRight className="h-4 w-4 text-text-disabled" />
                    </Link>
                    <Link
                        href="/settings"
                        className="flex items-center gap-3 border-t border-border px-4 py-3 transition-colors hover:bg-bg-hover active:bg-bg-hover"
                    >
                        <Globe className="h-5 w-5 text-text-secondary" />
                        <span className="flex-1 text-sm text-text-primary">语言设置</span>
                        <ChevronRight className="h-4 w-4 text-text-disabled" />
                    </Link>
                    <div className="border-t border-border">
                        <ThemeMenuRow />
                    </div>
                </MenuGroup>

                <div className="overflow-hidden rounded-lg border border-border bg-bg-card">
                    <SignOutButton />
                </div>
            </div>
        </div>
    );
}
