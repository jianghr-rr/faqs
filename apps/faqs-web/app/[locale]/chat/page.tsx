import {getCurrentUser} from '~/lib/supabase/server';
import {ChatView} from './chat-view';

export default async function ChatPage() {
    const user = await getCurrentUser();

    return <ChatView isLoggedIn={!!user} />;
}
