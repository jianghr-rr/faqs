'use client';

import {signOut} from '~/actions/auth';

export function SignOutButton() {
    return (
        <button
            onClick={() => signOut()}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
            退出登录
        </button>
    );
}
