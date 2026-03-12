'use client';

import {useState} from 'react';
import Link from 'next/link';
import {Star} from 'lucide-react';
import {FavoriteListItem, type FavoriteItem} from './favorite-list-item';

interface FavoriteData {
    items: FavoriteItem[];
    total: number;
    page: number;
    totalPages: number;
}

export function FavoritesList({initialData}: {initialData: FavoriteData}) {
    const [total, setTotal] = useState(initialData.total);
    const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

    const visibleItems = initialData.items.filter((item) => !removedIds.has(item.id));
    const {page, totalPages} = initialData;

    function handleRemoved(id: string) {
        setRemovedIds((prev) => new Set(prev).add(id));
        setTotal((prev) => Math.max(0, prev - 1));
    }

    if (visibleItems.length === 0 && total === 0) {
        return (
            <div className="flex flex-col items-center gap-3 py-16 text-text-secondary">
                <Star className="h-10 w-10 text-text-disabled" />
                <p className="text-sm">还没有收藏任何内容</p>
                <p className="text-xs text-text-disabled">去浏览 FAQ 或新闻，收藏感兴趣的内容</p>
                <Link
                    href="/"
                    className="mt-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
                >
                    去首页看看
                </Link>
            </div>
        );
    }

    return (
        <>
            <div className="mb-4 flex items-center justify-between">
                <h2 className="font-lexend text-lg font-semibold text-text-primary">
                    我的收藏
                    <span className="ml-2 text-sm font-normal text-text-secondary">({total})</span>
                </h2>
            </div>

            <div className="space-y-2">
                {visibleItems.map((fav) => (
                    <FavoriteListItem
                        key={fav.id}
                        favorite={fav}
                        onRemoved={() => handleRemoved(fav.id)}
                    />
                ))}
            </div>

            {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-center gap-2">
                    {page > 1 && (
                        <Link
                            href={`/favorites?page=${page - 1}`}
                            className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-hover"
                        >
                            上一页
                        </Link>
                    )}
                    <span className="text-xs text-text-disabled">
                        {page} / {totalPages}
                    </span>
                    {page < totalPages && (
                        <Link
                            href={`/favorites?page=${page + 1}`}
                            className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-hover"
                        >
                            下一页
                        </Link>
                    )}
                </div>
            )}
        </>
    );
}
