import {redirect} from 'next/navigation';
import {getCurrentUser} from '~/lib/supabase/server';
import {LoginForm} from './login-form';

const selectableAccounts = [
    {id: 'admin-1', name: '管理员 1', email: 'admin1@finagents.app'},
    {id: 'admin-2', name: '管理员 2', email: 'admin2@finagents.app'},
    {id: 'admin-3', name: '管理员 3', email: 'admin3@finagents.app'},
    {id: 'admin-4', name: '管理员 4', email: 'admin4@finagents.app'},
];

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{error?: string; next?: string}>;
}) {
    const user = await getCurrentUser();

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
                        <p className="text-sm text-text-secondary">使用账号密码登录以继续</p>
                    </div>

                    {error && (
                        <div className="mb-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
                            登录失败：{decodeURIComponent(error)}
                        </div>
                    )}

                    <LoginForm next={next} selectableAccounts={selectableAccounts} />
                </div>
            </div>
        </div>
    );
}
