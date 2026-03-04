'use client';

import {useState, useTransition} from 'react';
import {Star, Loader2} from 'lucide-react';
import {addFavorite, removeFavorite} from '~/actions/favorites';

interface FavoriteButtonProps {
    itemType: 'faq' | 'news';
    itemId: string;
    initialFavorited?: boolean;
    variant?: 'icon' | 'button';
    className?: string;
}

export function FavoriteButton({
    itemType,
    itemId,
    initialFavorited = false,
    variant = 'button',
    className = '',
}: FavoriteButtonProps) {
    const [favorited, setFavorited] = useState(initialFavorited);
    const [isPending, startTransition] = useTransition();

    function handleToggle() {
        if (isPending) return;

        const prev = favorited;
        setFavorited(!prev);

        startTransition(async () => {
            try {
                if (prev) {
                    await removeFavorite(itemType, itemId);
                } else {
                    const result = await addFavorite(itemType, itemId);
                    if (result.error) {
                        setFavorited(false);
                        alert(result.error);
                    }
                }
            } catch {
                setFavorited(prev);
            }
        });
    }

    if (variant === 'icon') {
        return (
            <button
                onClick={handleToggle}
                disabled={isPending}
                className={`flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-bg-hover disabled:opacity-50 ${className}`}
                aria-label={favorited ? '取消收藏' : '收藏'}
            >
                {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin text-text-secondary" />
                ) : (
                    <Star
                        className={`h-4 w-4 ${favorited ? 'fill-warning text-warning' : 'text-text-secondary'}`}
                    />
                )}
            </button>
        );
    }

    return (
        <button
            onClick={handleToggle}
            disabled={isPending}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-medium transition-colors disabled:opacity-50 lg:flex-none lg:px-4 ${
                favorited
                    ? 'border-warning/30 bg-warning/5 text-warning'
                    : 'text-text-secondary hover:bg-bg-hover hover:text-warning'
            } ${className}`}
        >
            {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
                <Star className={`h-4 w-4 ${favorited ? 'fill-warning' : ''}`} />
            )}
            {favorited ? '已收藏' : '收藏'}
        </button>
    );
}
