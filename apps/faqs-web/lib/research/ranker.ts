import type {CandidateStock} from '~/lib/kg/types';

type RankOptions = {
    tickers?: string[];
};

export function rankCandidateStocks(stocks: CandidateStock[], options: RankOptions = {}) {
    const tickerSet = new Set((options.tickers ?? []).map((ticker) => ticker.toUpperCase()));

    return stocks
        .map((stock) => {
            let score = stock.score;
            let reason = stock.reason;

            if (tickerSet.has(stock.stockCode.toUpperCase())) {
                score = Math.min(score + 0.15, 1);
                reason = `${reason}，且新闻已直接命中该证券代码`;
            }

            return {
                ...stock,
                score: Number(score.toFixed(2)),
                reason,
            };
        })
        .sort((a, b) => b.score - a.score);
}
