import {AnalysisView} from './analysis-view';

export default async function AnalysisPage({
    searchParams,
}: {
    searchParams: Promise<{mode?: string; newsId?: string; newsTitle?: string; q?: string}>;
}) {
    const params = await searchParams;
    const initialMode = params.mode === 'query' ? 'query' : params.newsId ? 'news' : 'query';

    return (
        <AnalysisView
            initialMode={initialMode}
            initialNewsId={params.newsId}
            initialNewsTitle={params.newsTitle}
            initialQuery={params.q}
        />
    );
}
