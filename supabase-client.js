(() => {
    let client;

    function getClient() {
        if (!window.LINGOUP_SUPABASE_URL || window.LINGOUP_SUPABASE_URL.includes('YOUR_PROJECT_ID')) {
            throw new Error('Спочатку додайте URL і ключ проєкту Supabase у файл supabase-config.js.');
        }
        if (!window.LINGOUP_SUPABASE_ANON_KEY || window.LINGOUP_SUPABASE_ANON_KEY.includes('YOUR_SUPABASE_')) {
            throw new Error('Спочатку додайте URL і ключ проєкту Supabase у файл supabase-config.js.');
        }
        if (!window.supabase || typeof window.supabase.createClient !== 'function') {
            throw new Error('Не вдалося завантажити бібліотеку Supabase. Перевірте з’єднання та спробуйте ще раз.');
        }

        client ??= window.supabase.createClient(
            window.LINGOUP_SUPABASE_URL,
            window.LINGOUP_SUPABASE_ANON_KEY
        );
        return client;
    }

    async function getProfile(userId) {
        const { data, error } = await getClient()
            .from('profiles')
            .select('name, surname, email, phone, is_admin')
            .eq('id', userId)
            .single();

        if (error) {
            throw error;
        }
        return data;
    }

    async function getCurrentUser() {
        const { data, error } = await getClient().auth.getSession();
        if (error) {
            throw error;
        }
        return data.session?.user ?? null;
    }

    window.LingoUp = { getClient, getProfile, getCurrentUser };
})();
