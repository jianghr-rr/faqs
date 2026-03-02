import {redirect} from 'next/navigation';
import {createClient} from '~/lib/supabase/server';
import {LoginForm} from './login-form';

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{error?: string}>;
}) {
    const supabase = await createClient();
    const {
        data: {user},
    } = await supabase.auth.getUser();

    if (user) {
        redirect('/');
    }

    const {error} = await searchParams;

    return (
        <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
            <div className="w-full max-w-sm space-y-8">
                <div className="text-center">
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                        登录 FAQs
                    </h1>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        选择一种方式继续
                    </p>
                </div>

                {error && (
                    <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                        登录失败：{decodeURIComponent(error)}
                    </div>
                )}

                <LoginForm />
            </div>
        </main>
    );
}
