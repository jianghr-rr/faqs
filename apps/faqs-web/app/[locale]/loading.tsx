import {NewsFeedSkeleton} from './components/news';

function ChipSkeleton() {
    return <div className="h-7 w-14 shrink-0 animate-pulse rounded-md bg-bg-hover" aria-hidden="true" />;
}

export default function LocaleLoading() {
    return (
        <div className="mx-auto max-w-6xl px-4 py-4 lg:py-6">
            <div className="mb-4 h-10 animate-pulse rounded-lg bg-bg-card" aria-hidden="true" />

            <div className="mb-4 rounded-lg border border-border bg-bg-card px-3 py-2.5" aria-hidden="true">
                <div className="flex items-center gap-2">
                    <div className="h-4 w-12 animate-pulse rounded bg-bg-hover" />
                    <div className="h-3 w-px bg-border" />
                    <div className="flex flex-1 gap-4 overflow-hidden">
                        <div className="h-3 w-32 animate-pulse rounded bg-bg-hover" />
                        <div className="h-3 w-40 animate-pulse rounded bg-bg-hover" />
                        <div className="h-3 w-28 animate-pulse rounded bg-bg-hover" />
                    </div>
                </div>
            </div>

            <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                <ChipSkeleton />
                <ChipSkeleton />
                <ChipSkeleton />
                <ChipSkeleton />
                <ChipSkeleton />
            </div>

            <NewsFeedSkeleton />
        </div>
    );
}
