# CommonGround

CommonGround uses a Next.js frontend and a PHP/MySQL API intended to run with XAMPP. Users, posts, comments, likes, friendships, groups, conversations, bookmarks, and uploaded images are stored by the backend. There are no seeded demo accounts or browser-side data fallbacks.

## Requirements

- XAMPP with Apache, MySQL, PHP 8.1 or later, PDO MySQL, and Fileinfo enabled
- Node.js 20 or later

## XAMPP Setup

1. Start **Apache** and **MySQL** from the XAMPP Control Panel.
2. Copy the repository's `backend` folder to `C:\xampp\htdocs\commonground`. The API must be available at `http://localhost/commonground/api.php`.
3. Open `http://localhost/phpmyadmin`, choose **Import**, and import `backend/schema.sql`. This creates the `commonground` database and all tables.
4. The default PHP connection targets `127.0.0.1`, database `commonground`, user `root`, and an empty password, matching a standard local XAMPP install. If your MySQL credentials differ, set `CG_DB_HOST`, `CG_DB_NAME`, `CG_DB_USER`, and `CG_DB_PASSWORD` in the Apache/PHP environment. To use a different frontend origin, set `CG_ALLOWED_ORIGIN` (default `http://localhost:3000`).
5. Ensure Apache can write to `C:\xampp\htdocs\commonground\uploads`. The upload endpoint creates this directory if needed and accepts JPG, PNG, WEBP, and GIF images up to 8 MB.

Use `localhost` consistently for both the frontend and backend. PHP session cookies are required for authentication and API writes, and the API permits the default frontend origin `http://localhost:3000`.

## Run the Frontend

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, create an account with a valid email and a password of at least 8 characters, then sign in. The PHP session cookie keeps the account signed in across page reloads.

To change the API address, create `.env.local` in the project root:

```env
NEXT_PUBLIC_API_URL=http://localhost/commonground/api.php
```

Restart the Next.js development server after changing environment values. Both XAMPP services must remain running while using the app.

## Backend Files

- `backend/api.php` is the JSON API and session-authentication entry point.
- `backend/schema.sql` creates the MySQL schema.
- `backend/uploads/.htaccess` disables execution of uploaded scripts.