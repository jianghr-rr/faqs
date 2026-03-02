import Link from 'next/link';
import {createClient} from '~/lib/supabase/server';
import {SignOutButton} from './sign-out-button';

export default async function HomePage() {
    const supabase = await createClient();
    const {
        data: {user},
    } = await supabase.auth.getUser();

    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-6">
            <h1 className="text-4xl font-bold">FAQs</h1>
            <p className="text-lg text-gray-600 dark:text-gray-400">Welcome to FAQs Application</p>

            {user ? (
                <div className="flex flex-col items-center gap-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                    <div className="flex items-center gap-3">
                        {user.user_metadata?.avatar_url && (
                            <img
                                src={user.user_metadata.avatar_url}
                                alt="avatar"
                                className="h-10 w-10 rounded-full"
                            />
                        )}
                        <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                                {user.user_metadata?.name ??
                                    user.user_metadata?.full_name ??
                                    user.email?.split('@')[0]}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                        </div>
                    </div>
                    <SignOutButton />
                </div>
            ) : (
                <Link
                    href="/login"
                    className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                >
                    登录
                </Link>
            )}
        </main>
    );
}
