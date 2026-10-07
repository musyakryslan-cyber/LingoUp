import json
import os
import secrets
import time
from http.cookies import SimpleCookie
from wsgiref.simple_server import make_server

DB_FILE = os.path.join(os.path.dirname(__file__), 'users.json')
SESSION_TTL = 8 * 60 * 60
SESSIONS = {}

def create_session(phone):
    now = time.time()
    for token, session in list(SESSIONS.items()):
        if session['expires_at'] <= now:
            del SESSIONS[token]

    token = secrets.token_urlsafe(32)
    SESSIONS[token] = {'phone': phone, 'expires_at': now + SESSION_TTL}
    return token

def get_session_token(environ):
    cookies = SimpleCookie()
    cookies.load(environ.get('HTTP_COOKIE', ''))
    session_cookie = cookies.get('lingoup_session')
    return session_cookie.value if session_cookie else None

def get_session_phone(environ):
    token = get_session_token(environ)
    session = SESSIONS.get(token)
    if not session or session['expires_at'] <= time.time():
        if token:
            SESSIONS.pop(token, None)
        return None
    return session['phone']

def session_cookie(token, environ):
    cookie = f'lingoup_session={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age={SESSION_TTL}'
    if environ.get('HTTPS') == 'on':
        cookie += '; Secure'
    return cookie

def load_users():
    if not os.path.exists(DB_FILE):
        return []
    with open(DB_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_users(users):
    with open(DB_FILE, 'w', encoding='utf-8') as f:
        json.dump(users, f, ensure_ascii=False, indent=4)

def application(environ, start_response):
    path = environ.get('PATH_INFO', '')
    method = environ.get('REQUEST_METHOD', 'GET')

    if method == 'GET' and path == '/api/users':
        if get_session_phone(environ) != '0970553310':
            start_response('403 Forbidden', [('Content-Type', 'application/json; charset=utf-8')])
            return ['{"error": "Доступ заборонено"}'.encode('utf-8')]

        try:
            users = load_users()
            if not isinstance(users, list):
                raise ValueError('Файл користувачів має некоректний формат')

            public_users = [
                {key: user.get(key, '') for key in ('name', 'surname', 'email', 'phone')}
                for user in users
                if isinstance(user, dict)
            ]
            response_data = json.dumps(public_users, ensure_ascii=False)
            start_response('200 OK', [('Content-Type', 'application/json; charset=utf-8')])
            return [response_data.encode('utf-8')]
        except (OSError, json.JSONDecodeError, ValueError) as e:
            start_response('500 Internal Server Error', [('Content-Type', 'application/json; charset=utf-8')])
            return [json.dumps({"error": str(e)}, ensure_ascii=False).encode('utf-8')]

    if method == 'POST':
        if path == '/api/logout':
            token = get_session_token(environ)
            if token:
                SESSIONS.pop(token, None)
            cookie = 'lingoup_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'
            if environ.get('HTTPS') == 'on':
                cookie += '; Secure'
            start_response('200 OK', [
                ('Content-Type', 'application/json; charset=utf-8'),
                ('Set-Cookie', cookie),
            ])
            return [b'{"success": true}']

        try:
            content_length = int(environ.get('CONTENT_LENGTH', 0))
            post_data = environ['wsgi.input'].read(content_length)

            if path == '/api/register':
                data = json.loads(post_data.decode('utf-8'))
                users = load_users()

                if any(u.get('phone') == data.get('phone') for u in users):
                    start_response('400 Bad Request', [('Content-Type', 'application/json')])
                    return ['{"error": "Користувач з таким номером вже існує"}'.encode('utf-8')]

                users.append(data)
                save_users(users)

                token = create_session(data.get('phone'))
                start_response('200 OK', [
                    ('Content-Type', 'application/json'),
                    ('Set-Cookie', session_cookie(token, environ)),
                ])
                return [b'{"success": true}']

            if path == '/api/login':
                data = json.loads(post_data.decode('utf-8'))
                users = load_users()
                phone = data.get('phone')
                password = data.get('password')

                for u in users:
                    if u.get('phone') == phone and u.get('password') == password:
                        user_data = {"name": u.get("name"), "surname": u.get("surname"), "phone": u.get("phone"), "email": u.get("email")}
                        response_data = json.dumps({"success": True, "user": user_data})
                        token = create_session(phone)
                        start_response('200 OK', [
                            ('Content-Type', 'application/json'),
                            ('Set-Cookie', session_cookie(token, environ)),
                        ])
                        return [response_data.encode('utf-8')]

                start_response('401 Unauthorized', [('Content-Type', 'application/json')])
                return ['{"error": "Невірний номер телефону або пароль"}'.encode('utf-8')]

        except Exception as e:
            start_response('500 Internal Server Error', [('Content-Type', 'application/json')])
            return [json.dumps({"error": str(e)}).encode('utf-8')]

    # GET requests (serving static files: html, css, images)
    if method == 'GET':
        if path == '/' or path == '':
            path = '/index.html'

        if '..' in path:
            start_response('403 Forbidden', [('Content-Type', 'text/plain')])
            return [b'Forbidden']

        file_path = os.path.join(os.path.dirname(__file__), path.lstrip('/'))

        if os.path.exists(file_path) and os.path.isfile(file_path):
            ext = os.path.splitext(file_path)[1].lower()
            content_type = 'text/html; charset=utf-8'
            if ext == '.css': content_type = 'text/css'
            elif ext == '.js': content_type = 'application/javascript'
            elif ext in ['.png', '.jpg', '.jpeg', '.gif']: content_type = f'image/{ext[1:]}'
            elif ext == '.json': content_type = 'application/json'

            with open(file_path, 'rb') as f:
                content = f.read()
                start_response('200 OK', [('Content-Type', content_type)])
                return [content]
        else:
            start_response('404 Not Found', [('Content-Type', 'text/plain')])
            return [b'Not Found']

if __name__ == '__main__':
    httpd = make_server('', 8000, application)
    print("WSGI Server running on http://localhost:8000")
    httpd.serve_forever()
