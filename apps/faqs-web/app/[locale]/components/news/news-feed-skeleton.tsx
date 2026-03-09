'use client';

export function NewsFeedSkeleton({count = 6}: {count?: number}) {
    return (
        <div className="space-y-2">
            {Array.from({length: count}).map((_, index) => (
                <div
                    key={index}
                    className="rounded-lg border border-border bg-bg-card p-4"
                    aria-hidden="true"
                >
                    <div className="animate-pulse space-y-3">
                        <div className="flex items-start justify-between gap-3">
                            <div className="space-y-2">
                                <div className="h-4 w-16 rounded bg-bg-hover" />
                                <div className="h-4 w-56 rounded bg-bg-hover lg:w-80" />
                                <div className="h-4 w-40 rounded bg-bg-hover lg:w-64" />
                            </div>
                            <div className="h-8 w-8 rounded-full bg-bg-hover" />
                        </div>

                        <div className="space-y-2">
                            <div className="h-3 w-full rounded bg-bg-hover" />
                            <div className="h-3 w-5/6 rounded bg-bg-hover" />
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <div className="h-5 w-12 rounded bg-bg-hover" />
                            <div className="h-5 w-14 rounded bg-bg-hover" />
                            <div className="h-5 w-16 rounded bg-bg-hover" />
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="h-3 w-14 rounded bg-bg-hover" />
                            <div className="h-3 w-3 rounded-full bg-bg-hover" />
                            <div className="h-3 w-20 rounded bg-bg-hover" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
