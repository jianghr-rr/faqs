import {createClient} from '~/lib/supabase/server';
import {ChatView} from './chat-view';

export default async function ChatPage() {
    const supabase = await createClient();
    const {
        data: {user},
    } = await supabase.auth.getUser();

    return <ChatView isLoggedIn={!!user} />;
}
