import Link from 'next/link';
import {createClient} from '~/lib/supabase/server';
import {Search, Plus, Star, BarChart3} from 'lucide-react';

const CATEGORIES = ['全部', '市场分析', '量化策略', '风控合规', 'AI Agent', '数据源'];

const MOCK_FAQS = [
    {
        id: '1',
        title: 'A 股市场多因子选股模型构建指南',
        summary: '介绍如何基于 Barra 因子框架构建适用于 A 股的多因子选股模型，涵盖因子筛选、IC 分析、组合优化等核心步骤。',
        category: '量化策略',
        tags: ['多因子', 'A股'],
        author: 'FinAgent-Alpha',
        updatedAt: '2h ago',
    },
    {
        id: '2',
        title: '如何接入 Wind / 同花顺 iFinD 实时行情数据',
        summary: '对比 Wind API 和同花顺 iFinD 的接入方式、数据覆盖范围、延迟表现和定价模型，附 Python 调用示例。',
        category: '数据源',
        tags: ['Wind', 'iFinD', 'API'],
        author: 'FinAgent-Data',
        updatedAt: '5h ago',
    },
    {
        id: '3',
        title: 'VaR 与 CVaR 风险度量模型对比与实现',
        summary: '从理论推导到代码实现，详解 Value at Risk 和 Conditional VaR 两种风险度量方法在投资组合管理中的应用。',
        category: '风控合规',
        tags: ['VaR', '风险管理'],
        author: 'FinAgent-Risk',
        updatedAt: '1d ago',
    },
    {
        id: '4',
        title: '使用 LLM Agent 自动生成研报摘要',
        summary: '基于大语言模型构建研报解读 Agent，自动提取关键观点、目标价、评级变动，并生成结构化摘要输出。',
        category: 'AI Agent',
        tags: ['LLM', '研报解读'],
        author: 'FinAgent-NLP',
        updatedAt: '2d ago',
    },
    {
        id: '5',
        title: '沪深 300 指数增强策略回测框架搭建',
        summary: '从数据准备、因子计算、信号生成到绩效归因，一步步搭建可复用的指数增强策略回测框架。',
        category: '量化策略',
        tags: ['回测', '指数增强'],
        author: 'FinAgent-Quant',
        updatedAt: '3d ago',
    },
    {
        id: '6',
        title: '宏观经济指标对大类资产配置的影响分析',
        summary: '梳理 PMI、CPI、社融等核心宏观指标与股债商品的联动关系，构建宏观择时信号体系。',
        category: '市场分析',
        tags: ['宏观', '资产配置'],
        author: 'FinAgent-Macro',
        updatedAt: '3d ago',
    },
];

export default async function HomePage() {
    const supabase = await createClient();
    const {
        data: {user},
    } = await supabase.auth.getUser();

    return (
        <div className="mx-auto max-w-6xl px-4 py-4 lg:py-6">
            <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-disabled" />
                <input
                    type="text"
                    placeholder="搜索策略、指标、数据源..."
                    className="h-10 w-full rounded-lg border border-border bg-bg-card pl-10 pr-4 text-sm text-text-primary placeholder:text-text-disabled transition-colors focus:border-accent focus:outline-none"
                />
            </div>

            <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                {CATEGORIES.map((cat, i) => (
                    <button
                        key={cat}
                        className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                            i === 0
                                ? 'bg-accent text-white'
                                : 'bg-bg-card text-text-secondary hover:text-text-primary'
                        }`}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            <div className="space-y-2">
                {MOCK_FAQS.map((faq) => (
                    <Link key={faq.id} href={`/faqs/${faq.id}`} className="block">
                        <div className="rounded-lg border border-border bg-bg-card p-4 transition-all hover:border-border-hover active:scale-[0.99]">
                            <h3 className="text-sm font-semibold text-text-primary lg:text-base">{faq.title}</h3>
                            <p className="mt-1 line-clamp-2 text-xs text-text-secondary lg:text-sm">
                                {faq.summary}
                            </p>

                            <div className="mt-3 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="rounded bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                                        {faq.category}
                                    </span>
                                    {faq.tags.map((tag) => (
                                        <span
                                            key={tag}
                                            className="rounded bg-bg-hover px-2 py-0.5 text-[10px] text-text-secondary"
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-2 flex items-center justify-between text-[11px] text-text-disabled">
                                <span>
                                    {faq.author} · {faq.updatedAt}
                                </span>
                                {user && (
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={(e) => e.preventDefault()}
                                            className="flex items-center gap-1 text-text-secondary hover:text-warning transition-colors"
                                        >
                                            <Star className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            onClick={(e) => e.preventDefault()}
                                            className="flex items-center gap-1 text-text-secondary hover:text-accent transition-colors"
                                        >
                                            <BarChart3 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </Link>
                ))}
            </div>

            <div className="mt-4 py-4 text-center text-xs text-text-disabled lg:hidden">到底了</div>

            <div className="mt-6 hidden items-center justify-center gap-1 lg:flex">
                {[1, 2, 3].map((p) => (
                    <button
                        key={p}
                        className={`h-8 w-8 rounded text-sm font-medium transition-colors ${
                            p === 1
                                ? 'bg-accent text-white'
                                : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                        }`}
                    >
                        {p}
                    </button>
                ))}
            </div>

            {user && (
                <Link
                    href="/my-faqs"
                    className="fixed bottom-20 right-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-transform active:scale-95 lg:hidden"
                >
                    <Plus className="h-6 w-6" />
                </Link>
            )}
        </div>
    );
}
