import {Search, TrendingUp, TrendingDown, Minus} from 'lucide-react';

const MOCK_RESULTS = [
    {keyword: '沪深300', count: 42, change: 8.5, trend: 'up' as const},
    {keyword: '多因子模型', count: 36, change: 12.3, trend: 'up' as const},
    {keyword: 'VaR', count: 28, change: 0.0, trend: 'stable' as const},
    {keyword: '研报解读', count: 21, change: -3.2, trend: 'down' as const},
    {keyword: '宏观择时', count: 18, change: 5.7, trend: 'up' as const},
    {keyword: 'LLM Agent', count: 15, change: 22.1, trend: 'up' as const},
];

export default function AnalysisPage() {
    return (
        <div className="mx-auto max-w-3xl px-4 py-4 lg:py-6">
            <h2 className="mb-4 font-lexend text-lg font-semibold text-text-primary lg:text-xl">智能分析</h2>

            <div className="space-y-3 lg:flex lg:items-end lg:gap-3 lg:space-y-0">
                <div className="flex-1">
                    <label className="mb-1 block text-xs text-text-secondary">分析类型</label>
                    <select className="h-10 w-full rounded-lg border border-border bg-bg-card px-3 text-sm text-text-primary focus:border-accent focus:outline-none">
                        <option>关键词热度分析</option>
                        <option>研报观点提取</option>
                        <option>因子有效性检验</option>
                        <option>持仓相似度分析</option>
                    </select>
                </div>
                <div className="flex-1">
                    <label className="mb-1 block text-xs text-text-secondary">目标内容</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-disabled" />
                        <input
                            type="text"
                            placeholder="输入关键词或选择知识条目..."
                            className="h-10 w-full rounded-lg border border-border bg-bg-card pl-10 pr-4 text-sm text-text-primary placeholder:text-text-disabled focus:border-accent focus:outline-none"
                        />
                    </div>
                </div>
                <button className="h-10 w-full rounded-lg bg-accent px-6 text-sm font-medium text-white transition-colors hover:bg-accent-hover active:scale-[0.98] lg:w-auto">
                    执行分析
                </button>
            </div>

            <div className="mt-6">
                <h3 className="mb-3 text-xs font-medium uppercase text-text-secondary">分析结果 · 知识库热词 TOP 6</h3>
                <div className="overflow-hidden rounded-lg border border-border bg-bg-card">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border">
                                <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase text-text-secondary">
                                    关键词
                                </th>
                                <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase text-text-secondary">
                                    出现次数
                                </th>
                                <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase text-text-secondary">
                                    周变化
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {MOCK_RESULTS.map((item, i) => (
                                <tr
                                    key={item.keyword}
                                    className={`border-b border-border last:border-0 ${
                                        i % 2 === 0 ? 'bg-bg-card' : 'bg-bg-alt'
                                    }`}
                                >
                                    <td className="px-4 py-3 text-sm text-text-primary">{item.keyword}</td>
                                    <td className="px-4 py-3 text-right font-mono text-sm text-text-primary">
                                        {item.count}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <span
                                            className={`inline-flex items-center gap-1 font-mono text-xs font-medium ${
                                                item.trend === 'up'
                                                    ? 'text-success'
                                                    : item.trend === 'down'
                                                      ? 'text-danger'
                                                      : 'text-text-secondary'
                                            }`}
                                        >
                                            {item.trend === 'up' && <TrendingUp className="h-3 w-3" />}
                                            {item.trend === 'down' && <TrendingDown className="h-3 w-3" />}
                                            {item.trend === 'stable' && <Minus className="h-3 w-3" />}
                                            {item.change > 0 ? '+' : ''}
                                            {item.change}%
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
