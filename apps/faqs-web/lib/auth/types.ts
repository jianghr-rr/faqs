export type AppUser = {
    id: string;
    email: string;
    name: string;
    avatar?: string;
    role: 'admin' | 'viewer';
    authSource: 'local' | 'supabase';
    phone?: string;
};
