import Link from 'next/link';
import {ExternalLink, Clock, TrendingUp, TrendingDown, Minus} from 'lucide-react';
import {FavoriteButton} from '../favorite-button';

interface NewsCardProps {
    id?: string;
    title: string;
    summary?: string | null;
    category: string;
    source: string;
    sourceUrl?: string | null;
    publishedAt: string;
    sentiment?: string | null;
    tickers?: string[] | null;
    tags?: string[] | null;
    importance: number;
    isAiGenerated: boolean;
    relatedCount?: number;
    isLoggedIn?: boolean;
    initialFavorited?: boolean;
}

function formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();

    const pad = (n: number) => String(n).padStart(2, '0');
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());

    const isToday =
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate();

    if (isToday) return `今天 ${hours}:${minutes}`;

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday =
        date.getFullYear() === yesterday.getFullYear() &&
        date.getMonth() === yesterday.getMonth() &&
        date.getDate() === yesterday.getDate();

    if (isYesterday) return `昨天 ${hours}:${minutes}`;

    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());

    if (date.getFullYear() === now.getFullYear()) {
        return `${month}-${day} ${hours}:${minutes}`;
    }

    return `${date.getFullYear()}-${month}-${day} ${hours}:${minutes}`;
}

const sentimentConfig = {
    positive: {icon: TrendingUp, label: '利好', className: 'text-success bg-success/10'},
    negative: {icon: TrendingDown, label: '利空', className: 'text-danger bg-danger/10'},
    neutral: {icon: Minus, label: '中性', className: 'text-text-secondary bg-bg-hover'},
} as const;

export function NewsCard({
    id,
    title,
    summary,
    category,
    source,
    sourceUrl,
    publishedAt,
    sentiment,
    tickers,
    tags,
    importance,
    isAiGenerated,
    relatedCount = 0,
    isLoggedIn = false,
    initialFavorited = false,
}: NewsCardProps) {
    const sentimentInfo = sentiment ? sentimentConfig[sentiment as keyof typeof sentimentConfig] : null;
    const SentimentIcon = sentimentInfo?.icon;
    const analysisHref = id
        ? isLoggedIn
            ? `/analysis?mode=news&newsId=${id}`
            : `/login?next=${encodeURIComponent(`/analysis?mode=news&newsId=${id}`)}`
        : null;

    return (
        <div
            className={`group rounded-lg border bg-bg-card p-4 transition-all hover:border-border-hover active:scale-[0.995] ${
                importance === 1 ? 'border-accent/30' : 'border-border'
            }`}
        >
            <div className="flex items-start justify-between gap-2">
                <h3 className="flex-1 text-sm font-semibold text-text-primary lg:text-base">
                    {importance === 1 && (
                        <span className="mr-1.5 inline-block rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-bold text-danger">
                            热
                        </span>
                    )}
                    {title}
                </h3>
                <div className="flex shrink-0 items-center gap-1">
                    {isLoggedIn && id && (
                        <FavoriteButton
                            itemType="news"
                            itemId={id}
                            initialFavorited={initialFavorited}
                            variant="icon"
                        />
                    )}
                    {sourceUrl && (
                        <a
                            href={sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded p-1 text-text-disabled transition-colors hover:bg-bg-hover hover:text-text-primary"
                            title="打开原始新闻"
                        >
                            <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                    )}
                </div>
            </div>

            {summary && (
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-text-secondary lg:text-sm">
                    {summary}
                </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                    {category}
                </span>

                {isAiGenerated && (
                    <span className="rounded bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                        AI
                    </span>
                )}

                {sentimentInfo && SentimentIcon && (
                    <span
                        className={`flex items-center gap-0.5 rounded px-2 py-0.5 text-[10px] font-medium ${sentimentInfo.className}`}
                    >
                        <SentimentIcon className="h-2.5 w-2.5" />
                        {sentimentInfo.label}
                    </span>
                )}

                {tickers?.slice(0, 3).map((ticker) => (
                    <span
                        key={ticker}
                        className="rounded bg-bg-hover px-2 py-0.5 text-[10px] font-mono text-text-secondary"
                    >
                        {ticker}
                    </span>
                ))}

                {tags?.slice(0, 2).map((tag) => (
                    <span key={tag} className="rounded bg-bg-hover px-2 py-0.5 text-[10px] text-text-secondary">
                        {tag}
                    </span>
                ))}
            </div>

            <div className="mt-2 flex items-center gap-2 text-[11px] text-text-disabled">
                <span>{source}</span>
                <span>·</span>
                <span className="flex items-center gap-0.5">
                    <Clock className="h-3 w-3" />
                    {formatTime(publishedAt)}
                </span>
                {relatedCount > 0 && (
                    <>
                        <span>·</span>
                        <span className="text-text-secondary">同事件 {relatedCount} 条</span>
                    </>
                )}
            </div>

            {analysisHref && (
                <div className="mt-3">
                    <Link
                        href={analysisHref}
                        className="inline-flex items-center rounded-md bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
                    >
                        智能分析这条新闻
                    </Link>
                </div>
            )}
        </div>
    );
}
