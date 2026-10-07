# Налаштування Supabase для LingoUp

GitHub Pages хостить сторінки сайту, а Supabase забезпечує автентифікацію та базу профілів.

1. Створіть проєкт на [supabase.com](https://supabase.com/).
2. У Supabase відкрийте **SQL Editor**, вставте вміст `supabase/schema.sql` і виконайте запит.
3. Відкрийте **Project Settings → API**. Скопіюйте **Project URL** і **Publishable key** (або legacy `anon` key) у `supabase-config.js`.
   Цей ключ використовується у браузері й не є секретом. Ніколи не вставляйте `service_role` key у файли сайту.
4. У **Authentication → URL Configuration** додайте до **Site URL** адресу GitHub Pages:
   `https://musyakryslan-cyber.github.io/LingoUp/`
   За потреби додайте цю адресу і сторінки входу/реєстрації до **Redirect URLs**.
5. Зареєструйте акаунт адміністратора на сайті та підтвердьте електронну пошту, якщо підтвердження ввімкнене.
6. У SQL Editor призначте свій акаунт адміністратором, підставивши його email:

   ```sql
   update public.profiles
   set is_admin = true
   where id = (
       select id from auth.users
       where email = 'YOUR_ADMIN_EMAIL'
   );
   ```

7. Завантажте `supabase-config.js`, `supabase-client.js`, `supabase/schema.sql` і сторінки сайту до GitHub. Після завершення публікації перевірте вхід і адмінпанель.

Таблиця профілів захищена RLS: користувач читає власний профіль, адміністратор може читати всі профілі. Паролі зберігає Supabase Auth, вони не потрапляють до таблиці профілів. Старі акаунти з локального `users.json` автоматично не переносяться — їх потрібно створити заново через форму реєстрації.
