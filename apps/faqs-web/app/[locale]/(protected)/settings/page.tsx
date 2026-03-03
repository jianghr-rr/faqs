import {createClient} from '~/lib/supabase/server';
import {Key, Globe, Palette, Shield} from 'lucide-react';
import {ThemeToggle} from '../../components/theme-toggle';

export default async function SettingsPage() {
    const supabase = await createClient();
    const {
        data: {user},
    } = await supabase.auth.getUser();

    return (
        <div className="mx-auto max-w-2xl px-4 py-4 lg:py-6">
            <h2 className="mb-6 font-lexend text-lg font-semibold text-text-primary lg:text-xl">设置</h2>

            <div className="space-y-4">
                {/* API Key 管理 */}
                <section className="rounded-lg border border-border bg-bg-card p-4">
                    <div className="mb-3 flex items-center gap-2">
                        <Key className="h-5 w-5 text-accent" />
                        <h3 className="text-sm font-semibold text-text-primary">API Key 管理</h3>
                    </div>
                    <p className="mb-3 text-xs text-text-secondary">
                        配置三方服务的 API Key，用于分析等高级功能。Key 将安全存储在服务器端。
                    </p>
                    <div className="space-y-2">
                        <div>
                            <label className="mb-1 block text-xs text-text-secondary">OpenAI API Key</label>
                            <input
                                type="password"
                                placeholder="sk-..."
                                className="h-9 w-full rounded-md border border-border bg-bg-base px-3 font-mono text-sm text-text-primary placeholder:text-text-disabled focus:border-accent focus:outline-none"
                            />
                        </div>
                    </div>
                    <button className="mt-3 rounded-md bg-accent px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover active:scale-[0.98]">
                        保存
                    </button>
                </section>

                {/* 语言设置 */}
                <section className="rounded-lg border border-border bg-bg-card p-4">
                    <div className="mb-3 flex items-center gap-2">
                        <Globe className="h-5 w-5 text-accent" />
                        <h3 className="text-sm font-semibold text-text-primary">语言设置</h3>
                    </div>
                    <div className="flex gap-2">
                        <button className="rounded-md bg-accent px-4 py-2 text-xs font-medium text-white">
                            中文
                        </button>
                        <button className="rounded-md border border-border px-4 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover">
                            English
                        </button>
                    </div>
                </section>

                {/* 主题设置 */}
                <section className="rounded-lg border border-border bg-bg-card p-4">
                    <div className="mb-3 flex items-center gap-2">
                        <Palette className="h-5 w-5 text-accent" />
                        <h3 className="text-sm font-semibold text-text-primary">主题设置</h3>
                    </div>
                    <ThemeToggle />
                </section>

                {/* 账户 */}
                <section className="rounded-lg border border-border bg-bg-card p-4">
                    <div className="mb-3 flex items-center gap-2">
                        <Shield className="h-5 w-5 text-accent" />
                        <h3 className="text-sm font-semibold text-text-primary">账户信息</h3>
                    </div>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-text-secondary">邮箱</span>
                            <span className="font-mono text-text-primary">{user?.email}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-text-secondary">用户 ID</span>
                            <span className="truncate pl-4 font-mono text-xs text-text-disabled">
                                {user?.id}
                            </span>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
