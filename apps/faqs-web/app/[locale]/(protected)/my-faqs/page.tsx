import Link from 'next/link';
import {createClient} from '~/lib/supabase/server';
import {Plus, Edit, Trash2} from 'lucide-react';

const MOCK_MY_FAQS = [
    {
        id: '1',
        title: 'A 股市场多因子选股模型构建指南',
        category: '量化策略',
        status: '已发布',
        updatedAt: '2h ago',
    },
    {
        id: '3',
        title: 'VaR 与 CVaR 风险度量模型对比与实现',
        category: '风控合规',
        status: '草稿',
        updatedAt: '1d ago',
    },
    {
        id: '4',
        title: '使用 LLM Agent 自动生成研报摘要',
        category: 'AI Agent',
        status: '已发布',
        updatedAt: '3d ago',
    },
];

export default async function MyFaqsPage() {
    const supabase = await createClient();
    const {
        data: {user},
    } = await supabase.auth.getUser();

    return (
        <div className="mx-auto max-w-3xl px-4 py-4 lg:py-6">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="font-lexend text-lg font-semibold text-text-primary">我的知识条目</h2>
                <button className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover active:scale-[0.98]">
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">新建</span>
                </button>
            </div>

            <div className="space-y-2">
                {MOCK_MY_FAQS.map((faq) => (
                    <div
                        key={faq.id}
                        className="flex items-center gap-3 rounded-lg border border-border bg-bg-card p-4 transition-all hover:border-border-hover"
                    >
                        <div className="min-w-0 flex-1">
                            <Link href={`/faqs/${faq.id}`} className="block">
                                <h3 className="truncate text-sm font-medium text-text-primary">{faq.title}</h3>
                            </Link>
                            <div className="mt-1 flex items-center gap-2 text-[11px] text-text-disabled">
                                <span className="rounded bg-accent/10 px-1.5 py-0.5 text-accent">
                                    {faq.category}
                                </span>
                                <span
                                    className={`rounded px-1.5 py-0.5 ${
                                        faq.status === '已发布'
                                            ? 'bg-success/10 text-success'
                                            : 'bg-warning/10 text-warning'
                                    }`}
                                >
                                    {faq.status}
                                </span>
                                <span>{faq.updatedAt}</span>
                            </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                            <button className="flex h-8 w-8 items-center justify-center rounded text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary">
                                <Edit className="h-4 w-4" />
                            </button>
                            <button className="flex h-8 w-8 items-center justify-center rounded text-text-secondary transition-colors hover:bg-bg-hover hover:text-danger">
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {MOCK_MY_FAQS.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-16 text-text-secondary">
                    <p className="text-sm">还没有创建任何知识条目</p>
                    <button className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
                        创建第一条
                    </button>
                </div>
            )}
        </div>
    );
}
