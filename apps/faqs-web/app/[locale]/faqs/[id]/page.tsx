import Link from 'next/link';
import {createClient} from '~/lib/supabase/server';
import {Edit, BarChart3, ChevronRight} from 'lucide-react';
import {checkFavorites} from '~/actions/favorites';
import {FavoriteButton} from '../../components/favorite-button';

const MOCK_FAQ = {
    id: '1',
    title: 'A 股市场多因子选股模型构建指南',
    category: '量化策略',
    tags: ['多因子', 'A股', 'Barra'],
    author: 'FinAgent-Alpha',
    updatedAt: '2026-03-03',
    content: `## 概述

多因子模型是量化投资中最经典的选股框架之一。本文介绍如何基于 Barra 风险因子体系，构建适用于 A 股市场的多因子选股模型。

## 1. 因子体系设计

### 价值因子
- **EP（Earnings-to-Price）**：TTM 净利润 / 总市值
- **BP（Book-to-Price）**：最近一期净资产 / 总市值
- **SP（Sales-to-Price）**：TTM 营业收入 / 总市值

### 成长因子
- **SUE（Standardized Unexpected Earnings）**：标准化盈利意外
- **营收增速**：最近 4 个季度同比增速均值
- **ROE 变化率**：ROE 的季度环比变化

### 动量因子
- **短期反转**：过去 20 个交易日收益率（取反）
- **中期动量**：过去 60~250 个交易日收益率

## 2. 因子测试与筛选

### IC 分析

Information Coefficient 是衡量因子预测能力的核心指标：

\`\`\`
IC = corr(因子值, 下期收益率)
\`\`\`

筛选标准：
- IC 均值绝对值 > 0.03
- ICIR（IC 均值 / IC 标准差）> 0.5
- IC 方向稳定性 > 55%

### 分层回测

将股票按因子值分为 5 组，检验多头组合相对空头组合的超额收益是否单调递增。

## 3. 组合优化

采用均值-方差优化框架，在最大化预期收益的同时控制风险暴露：

- 行业偏离约束：±5%
- 个股权重上限：2%
- 换手率约束：单边 30% / 月

## 注意事项

- A 股市场的因子表现与海外市场存在差异，价值因子长期有效但波动较大
- 需要对因子进行市值中性化和行业中性化处理
- 回测时注意避免未来数据偏差（Look-ahead Bias）`,
};

export default async function FaqDetailPage({params}: {params: Promise<{id: string}>}) {
    const {id} = await params;
    const supabase = await createClient();
    const {
        data: {user},
    } = await supabase.auth.getUser();

    const faq = MOCK_FAQ;

    let isFavorited = false;
    if (user) {
        try {
            const result = await checkFavorites('faq', [id]);
            isFavorited = result[id] ?? false;
        } catch {
            // ignore – button defaults to unfavorited
        }
    }

    return (
        <div className="mx-auto max-w-3xl px-4 py-4 lg:py-6">
            <nav className="mb-4 hidden items-center gap-1 text-xs text-text-secondary lg:flex">
                <Link href="/" className="hover:text-text-primary transition-colors">
                    知识库
                </Link>
                <ChevronRight className="h-3 w-3" />
                <span className="text-text-primary">{faq.category}</span>
                <ChevronRight className="h-3 w-3" />
                <span className="truncate text-text-disabled">{faq.title}</span>
            </nav>

            <h1 className="text-lg font-bold text-text-primary lg:text-xl">{faq.title}</h1>

            <div className="mt-2 flex flex-wrap items-center gap-2">
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
                <span className="text-[11px] text-text-disabled">
                    {faq.author} · 更新于 {faq.updatedAt}
                </span>
            </div>

            <div className="my-4 border-t border-border" />

            <article className="prose-invert prose-sm max-w-none text-sm leading-relaxed text-text-primary [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_p]:my-2 [&_code]:rounded [&_code]:bg-bg-hover [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_code]:text-accent [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-bg-alt [&_pre]:p-4 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-text-primary [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-0.5">
                {faq.content.split('\n').map((line, i) => {
                    if (line.startsWith('## '))
                        return <h2 key={i}>{line.slice(3)}</h2>;
                    if (line.startsWith('### '))
                        return <h3 key={i}>{line.slice(4)}</h3>;
                    if (line.startsWith('- '))
                        return (
                            <p key={i} className="flex items-start gap-1.5">
                                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-text-secondary" />
                                {line.slice(2)}
                            </p>
                        );
                    if (line.startsWith('```'))
                        return (
                            <pre key={i}>
                                <code>{line.slice(3)}</code>
                            </pre>
                        );
                    if (line.trim() === '') return <div key={i} className="h-2" />;
                    return <p key={i}>{line}</p>;
                })}
            </article>

            {user && (
                <div className="fixed inset-x-0 bottom-14 z-30 border-t border-border bg-bg-card px-4 py-2.5 lg:static lg:mt-6 lg:border-t-0 lg:bg-transparent lg:p-0">
                    <div className="mx-auto flex max-w-3xl items-center gap-2">
                        <button className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary lg:flex-none lg:px-4">
                            <Edit className="h-4 w-4" />
                            编辑
                        </button>
                        <button className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-accent lg:flex-none lg:px-4">
                            <BarChart3 className="h-4 w-4" />
                            分析
                        </button>
                        <FavoriteButton
                            itemType="faq"
                            itemId={id}
                            initialFavorited={isFavorited}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
