'use client';

import {useState, useTransition} from 'react';
import Link from 'next/link';
import {Star, Loader2, Trash2, ExternalLink} from 'lucide-react';
import {removeFavorite} from '~/actions/favorites';

interface FaqItem {
    id: number;
    question: string;
    status: string;
    categoryName: string | null;
    updatedAt: string;
}

interface NewsItem {
    id: string;
    title: string;
    source: string;
    sourceUrl: string | null;
    category: string;
    publishedAt: string;
}

interface FavoriteItem {
    id: string;
    itemType: string;
    itemId: string;
    createdAt: string;
    item: FaqItem | NewsItem | null;
}

function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin}分钟前`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}小时前`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 30) return `${diffD}天前`;
    return date.toLocaleDateString('zh-CN');
}

export function FavoriteListItem({
    favorite,
    onRemoved,
}: {
    favorite: FavoriteItem;
    onRemoved?: () => void;
}) {
    const [removed, setRemoved] = useState(false);
    const [isPending, startTransition] = useTransition();

    function handleRemove() {
        if (isPending) return;
        startTransition(async () => {
            await removeFavorite(favorite.itemType as 'faq' | 'news', favorite.itemId);
            setRemoved(true);
            onRemoved?.();
        });
    }

    if (removed) return null;

    const {item} = favorite;

    if (!item) {
        return (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-bg-card p-4 opacity-60">
                <Star className="h-4 w-4 shrink-0 fill-warning text-warning" />
                <div className="min-w-0 flex-1">
                    <p className="text-sm text-text-disabled">内容已删除</p>
                    <p className="mt-0.5 text-[11px] text-text-disabled">
                        收藏于 {formatRelativeTime(favorite.createdAt)}
                    </p>
                </div>
                <button
                    onClick={handleRemove}
                    disabled={isPending}
                    className="flex h-8 w-8 items-center justify-center rounded text-text-secondary transition-colors hover:bg-bg-hover hover:text-danger disabled:opacity-50"
                >
                    {isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Trash2 className="h-4 w-4" />
                    )}
                </button>
            </div>
        );
    }

    if (favorite.itemType === 'news') {
        const n = item as NewsItem;
        const content = (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-bg-card p-4 transition-all hover:border-border-hover">
                <Star className="h-4 w-4 shrink-0 fill-warning text-warning" />
                <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-medium text-text-primary">{n.title}</h3>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-text-disabled">
                        <span className="rounded bg-accent/10 px-1.5 py-0.5 text-accent">
                            {n.category}
                        </span>
                        <span>{n.source}</span>
                        <span>收藏于 {formatRelativeTime(favorite.createdAt)}</span>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    {n.sourceUrl && (
                        <a
                            href={n.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex h-8 w-8 items-center justify-center rounded text-text-secondary transition-colors hover:bg-bg-hover hover:text-accent"
                        >
                            <ExternalLink className="h-4 w-4" />
                        </a>
                    )}
                    <button
                        onClick={handleRemove}
                        disabled={isPending}
                        className="flex h-8 w-8 items-center justify-center rounded text-text-secondary transition-colors hover:bg-bg-hover hover:text-danger disabled:opacity-50"
                    >
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                </div>
            </div>
        );
        return content;
    }

    const faq = item as FaqItem;
    return (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-bg-card p-4 transition-all hover:border-border-hover">
            <Star className="h-4 w-4 shrink-0 fill-warning text-warning" />
            <div className="min-w-0 flex-1">
                <Link href={`/faqs/${faq.id}`} className="block">
                    <h3 className="truncate text-sm font-medium text-text-primary">{faq.question}</h3>
                </Link>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-text-disabled">
                    {faq.categoryName && (
                        <span className="rounded bg-accent/10 px-1.5 py-0.5 text-accent">
                            {faq.categoryName}
                        </span>
                    )}
                    <span>收藏于 {formatRelativeTime(favorite.createdAt)}</span>
                </div>
            </div>
            <button
                onClick={handleRemove}
                disabled={isPending}
                className="flex h-8 w-8 items-center justify-center rounded text-text-secondary transition-colors hover:bg-bg-hover hover:text-danger disabled:opacity-50"
            >
                {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <Trash2 className="h-4 w-4" />
                )}
            </button>
        </div>
    );
}
