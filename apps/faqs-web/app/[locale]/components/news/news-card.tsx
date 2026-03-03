import {ExternalLink, Clock, TrendingUp, TrendingDown, Minus} from 'lucide-react';

interface NewsCardProps {
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
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins}分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}天前`;
    return new Date(dateStr).toLocaleDateString('zh-CN');
}

const sentimentConfig = {
    positive: {icon: TrendingUp, label: '利好', className: 'text-success bg-success/10'},
    negative: {icon: TrendingDown, label: '利空', className: 'text-danger bg-danger/10'},
    neutral: {icon: Minus, label: '中性', className: 'text-text-secondary bg-bg-hover'},
} as const;

export function NewsCard({
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
}: NewsCardProps) {
    const sentimentInfo = sentiment ? sentimentConfig[sentiment as keyof typeof sentimentConfig] : null;
    const SentimentIcon = sentimentInfo?.icon;

    const card = (
        <div
            className={`group rounded-lg border bg-bg-card p-4 transition-all hover:border-border-hover active:scale-[0.995] ${
                importance === 1 ? 'border-accent/30' : 'border-border'
            }`}
        >
            <div className="flex items-start justify-between gap-3">
                <h3 className="flex-1 text-sm font-semibold text-text-primary lg:text-base">
                    {importance === 1 && (
                        <span className="mr-1.5 inline-block rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-bold text-danger">
                            热
                        </span>
                    )}
                    {title}
                </h3>
                {sourceUrl && (
                    <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-disabled opacity-0 transition-opacity group-hover:opacity-100" />
                )}
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
                    {timeAgo(publishedAt)}
                </span>
                {relatedCount > 0 && (
                    <>
                        <span>·</span>
                        <span className="text-text-secondary">同事件 {relatedCount} 条</span>
                    </>
                )}
            </div>
        </div>
    );

    if (sourceUrl) {
        return (
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="block">
                {card}
            </a>
        );
    }

    return card;
}
