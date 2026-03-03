import {redirect} from 'next/navigation';
import {createClient} from '~/lib/supabase/server';
import {LoginForm} from './login-form';

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{error?: string; next?: string}>;
}) {
    const supabase = await createClient();
    const {
        data: {user},
    } = await supabase.auth.getUser();

    const {error, next} = await searchParams;

    if (user) {
        redirect(next ?? '/');
    }

    return (
        <div className="flex min-h-[calc(100vh-48px)] items-center justify-center px-4 lg:min-h-[calc(100vh-56px)]">
            <div className="w-full max-w-sm">
                <div className="lg:rounded-lg lg:border lg:border-border lg:bg-bg-card lg:p-8">
                    <div className="mb-8 text-center">
                        <div className="mb-3 flex items-center justify-center gap-2">
                            <div className="h-2.5 w-2.5 rounded-full bg-accent" />
                            <h1 className="font-lexend text-2xl font-bold text-text-primary">FinAgents</h1>
                        </div>
                        <p className="text-sm text-text-secondary">登录以使用完整功能</p>
                    </div>

                    {error && (
                        <div className="mb-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
                            登录失败：{decodeURIComponent(error)}
                        </div>
                    )}

                    <LoginForm />
                </div>
            </div>
        </div>
    );
}
