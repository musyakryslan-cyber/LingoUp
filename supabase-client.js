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
            .select('name, surname, email, phone, user_type, is_admin, avatar_path')
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

    async function updateUserType(userId, userType) {
        if (!['student', 'teacher'].includes(userType)) {
            throw new Error('Оберіть тип користувача: студент або вчитель.');
        }

        const { data, error } = await getClient()
            .from('profiles')
            .update({ user_type: userType })
            .eq('id', userId)
            .select('user_type')
            .single();

        if (error) {
            throw error;
        }
        return data.user_type;
    }

    async function getAvatarUrl(path) {
        if (!path) {
            return null;
        }

        const { data } = getClient()
            .storage
            .from('lingoup-avatars')
            .getPublicUrl(path);
        return data.publicUrl;
    }

    async function uploadAvatar(file) {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!file || !allowedTypes.includes(file.type) || file.size > 2 * 1024 * 1024) {
            throw new Error('Виберіть зображення JPG, PNG або WebP розміром до 2 МБ.');
        }

        const user = await getCurrentUser();
        if (!user) {
            throw new Error('Увійдіть, щоб зберегти фото профілю.');
        }

        const path = `${user.id}/avatar`;
        const storage = getClient().storage.from('lingoup-avatars');
        const { error: uploadError } = await storage.upload(path, file, {
            cacheControl: '3600',
            contentType: file.type,
            upsert: true
        });

        if (uploadError) {
            throw uploadError;
        }

        const { error: profileError } = await getClient()
            .from('profiles')
            .update({ avatar_path: path })
            .eq('id', user.id);

        if (profileError) {
            throw profileError;
        }

        return getAvatarUrl(path);
    }

    async function uploadReadingImage(file) {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!file || !allowedTypes.includes(file.type) || file.size > 10 * 1024 * 1024) {
            throw new Error('Виберіть JPG, PNG, WebP або GIF розміром до 10 МБ.');
        }

        const user = await getCurrentUser();
        if (!user) {
            throw new Error('Увійдіть, щоб завантажити зображення на сервер.');
        }

        const extensions = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp',
            'image/gif': 'gif'
        };
        const path = `${user.id}/${crypto.randomUUID()}.${extensions[file.type]}`;
        const storage = getClient().storage.from('lingoup-reading-images');
        const { error } = await storage.upload(path, file, {
            cacheControl: '3600',
            contentType: file.type,
            upsert: false
        });

        if (error) {
            throw error;
        }

        return { path, userId: user.id };
    }

    async function getReadingImageUrl(path) {
        const user = await getCurrentUser();
        if (!user || typeof path !== 'string' || !path.startsWith(`${user.id}/`)) {
            throw new Error('Увійдіть в акаунт власника зображення, щоб переглянути його.');
        }

        const { data, error } = await getClient()
            .storage
            .from('lingoup-reading-images')
            .createSignedUrl(path, 3600);

        if (error) {
            throw error;
        }
        return data.signedUrl;
    }

    async function listReadingImages() {
        const user = await getCurrentUser();
        if (!user) {
            return [];
        }

        const storage = getClient().storage.from('lingoup-reading-images');
        const images = [];
        const pageSize = 100;

        for (let offset = 0; ; offset += pageSize) {
            const { data, error } = await storage.list(user.id, {
                limit: pageSize,
                offset,
                sortBy: { column: 'created_at', order: 'desc' }
            });

            if (error) {
                throw error;
            }

            const pageImages = (data || [])
                .filter((item) => item.id && item.name)
                .map((item) => ({
                    path: `${user.id}/${item.name}`,
                    userId: user.id,
                    name: item.name,
                    createdAt: item.created_at || null
                }));
            images.push(...pageImages);

            if (!data || data.length < pageSize) {
                return images;
            }
        }
    }

    async function deleteReadingImage(path) {
        const user = await getCurrentUser();
        if (!user || typeof path !== 'string' || !path.startsWith(`${user.id}/`)) {
            throw new Error('Видалити зображення може лише його власник.');
        }

        const { error } = await getClient()
            .storage
            .from('lingoup-reading-images')
            .remove([path]);

        if (error) {
            throw error;
        }
    }

    async function getReviews() {
        const { data, error } = await getClient()
            .from('reviews')
            .select('id, author_name, user_type, content, created_at')
            .order('created_at', { ascending: false });

        if (error) {
            throw error;
        }
        return data;
    }

    async function createReview(content) {
        const user = await getCurrentUser();
        if (!user) {
            throw new Error('Увійдіть, щоб залишити відгук.');
        }

        const { error } = await getClient()
            .from('reviews')
            .insert({ user_id: user.id, content: content.trim() });

        if (error) {
            throw error;
        }
    }

    async function getContacts() {
        const { data, error } = await getClient()
            .from('admin_contacts')
            .select('id, label, value, created_at')
            .order('created_at', { ascending: false });

        if (error) {
            throw error;
        }
        return data;
    }

    async function createContact(label, value) {
        const normalizedLabel = label.trim();
        const normalizedValue = value.trim();
        if (!normalizedLabel || normalizedLabel.length > 80 || !normalizedValue || normalizedValue.length > 500) {
            throw new Error('Вкажіть назву контакту (до 80 символів) і значення або посилання (до 500 символів).');
        }

        const { error } = await getClient()
            .from('admin_contacts')
            .insert({ label: normalizedLabel, value: normalizedValue });

        if (error) {
            throw error;
        }
    }

    window.LingoUp = {
        getClient,
        getProfile,
        getCurrentUser,
        updateUserType,
        getAvatarUrl,
        uploadAvatar,
        uploadReadingImage,
        getReadingImageUrl,
        listReadingImages,
        deleteReadingImage,
        getReviews,
        createReview,
        getContacts,
        createContact
    };
})();
