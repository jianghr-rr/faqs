import {getFavorites} from '~/actions/favorites';
import {FavoritesList} from './favorites-list';

export default async function FavoritesPage({
    searchParams,
}: {
    searchParams: Promise<{page?: string}>;
}) {
    const {page: pageStr} = await searchParams;
    const page = Math.max(1, Number(pageStr) || 1);
    const data = await getFavorites({page, pageSize: 20});

    return (
        <div className="mx-auto max-w-3xl px-4 py-4 lg:py-6">
            <FavoritesList initialData={data} />
        </div>
    );
}
