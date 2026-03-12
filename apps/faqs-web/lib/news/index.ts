export {FinnhubAdapter, EastMoneyAdapter, ClsAdapter} from './adapters';
export {ingestFromAdapters, queryNews, queryTopNews, queryRecentNews, getNewsById, purgeOldNews} from './service';
export {computeSloMetrics} from './metrics';
export {shouldFetchNow, markFetched, getScheduleInfo} from './scheduler';
export {getHealthStatus} from './health';
export type {NewsQueryOptions, PurgeResult} from './service';
export type {NewsAdapter, NewsCategory, NewsSentiment, RawNewsItem, NewsFetchOptions} from './types';
