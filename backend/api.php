<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
$allowedOrigin = getenv('CG_ALLOWED_ORIGIN') ?: 'http://localhost:3000';
header('Access-Control-Allow-Origin: ' . $allowedOrigin);
header('Vary: Origin');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function respond(mixed $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function body(): array
{
    $value = json_decode(file_get_contents('php://input') ?: '{}', true);
    return is_array($value) ? $value : [];
}

function database(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    $host = getenv('CG_DB_HOST') ?: '127.0.0.1';
    $name = getenv('CG_DB_NAME') ?: 'commonground';
    $user = getenv('CG_DB_USER') ?: 'root';
    $password = getenv('CG_DB_PASSWORD') ?: '';
    $pdo = new PDO("mysql:host=$host;dbname=$name;charset=utf8mb4", $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}

function query(string $sql, array $params = []): PDOStatement
{
    $statement = database()->prepare($sql);
    $statement->execute($params);
    return $statement;
}

function currentUserId(): string
{
    if (session_status() !== PHP_SESSION_ACTIVE) session_start();
    $id = $_SESSION['user_id'] ?? null;
    if (!is_string($id) || $id === '') respond(['error' => 'Authentication required'], 401);
    return $id;
}

function userById(string $id): ?array
{
    $user = query('SELECT id, email, user_name AS userName, profile_img AS profileImg, banner, f_name AS fName, l_name AS lName, bio FROM users WHERE id = ?', [$id])->fetch();
    return $user ?: null;
}

function postById(int $id, ?string $viewer = null): ?array
{
    $post = query('SELECT p.id, p.author_id AS userId, p.author_id AS authorId, u.user_name AS authorName, u.profile_img AS authorImage, p.title, p.subject, p.content, p.is_anonymous AS isAnonymous, p.created_at AS createdAt, p.group_id AS groupId, p.status, (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS likesCount, (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS commentsCount FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = ?', [$id])->fetch();
    if (!$post) return null;
    $post['id'] = (int)$post['id'];
    $post['groupId'] = $post['groupId'] === null ? null : (int)$post['groupId'];
    $post['likesCount'] = (int)$post['likesCount'];
    $post['commentsCount'] = (int)$post['commentsCount'];
    $post['isAnonymous'] = (bool)$post['isAnonymous'];
    $post['isLiked'] = $viewer !== null && (bool)query('SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?', [$id, $viewer])->fetchColumn();
    $post['author'] = ['userName' => $post['authorName'], 'profileImg' => $post['authorImage']];
    unset($post['authorName'], $post['authorImage']);
    $post['images'] = array_column(query('SELECT image_url FROM post_images WHERE post_id = ? ORDER BY position', [$id])->fetchAll(), 'image_url');
    $post['tags'] = array_column(query('SELECT tag FROM post_tags WHERE post_id = ? ORDER BY tag', [$id])->fetchAll(), 'tag');
    return $post;
}

function groupById(int $id, ?string $viewer = null): ?array
{
    $group = query('SELECT id, group_name AS groupName, description, group_img AS groupImg, banner_img AS bannerImg, allow_anonymity AS allowAnonymity, created_by AS createdBy, created_at AS createdAt FROM groups WHERE id = ?', [$id])->fetch();
    if (!$group) return null;
    $group['id'] = (int)$group['id'];
    $group['allowAnonymity'] = (bool)$group['allowAnonymity'];
    $group['groupThemes'] = array_column(query('SELECT theme FROM group_themes WHERE group_id = ? ORDER BY theme', [$id])->fetchAll(), 'theme');
    $group['populationCount'] = (int)query('SELECT COUNT(*) FROM group_members WHERE group_id = ?', [$id])->fetchColumn();
    $membership = $viewer ? query('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?', [$id, $viewer])->fetchColumn() : false;
    $group['isFollowed'] = $membership !== false;
    $group['isAdmin'] = in_array($membership, ['OWNER', 'ADMIN'], true);
    $group['posts'] = ['id' => $id];
    $group['groupMembers'] = query('SELECT u.id, u.user_name AS userName, u.profile_img AS profileImg FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ? ORDER BY gm.joined_at LIMIT 6', [$id])->fetchAll();
    return $group;
}

function commentTree(int $postId, ?string $viewer): array
{
    $rows = query('SELECT c.id, c.post_id AS postId, c.user_id AS commenterId, u.user_name AS userName, u.profile_img AS profileImg, c.content, c.created_at AS createdAt, c.parent_id AS parentId, (SELECT COUNT(*) FROM comment_likes cl WHERE cl.comment_id = c.id) AS likesCount FROM comments c JOIN users u ON u.id = c.user_id WHERE c.post_id = ? ORDER BY c.created_at', [$postId])->fetchAll();
    $byParent = [];
    foreach ($rows as $row) {
        $row['id'] = (int)$row['id'];
        $row['postId'] = (int)$row['postId'];
        $row['parentId'] = $row['parentId'] === null ? null : (int)$row['parentId'];
        $row['likesCount'] = (int)$row['likesCount'];
        $row['commenter'] = ['userName' => $row['userName'], 'profileImg' => $row['profileImg']];
        $row['isLiked'] = $viewer !== null && (bool)query('SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_id = ?', [$row['id'], $viewer])->fetchColumn();
        unset($row['userName'], $row['profileImg']);
        $byParent[$row['parentId'] ?? 0][] = $row;
    }
    $build = function (int $parent) use (&$build, &$byParent): array {
        $items = $byParent[$parent] ?? [];
        foreach ($items as &$item) $item['replies'] = $build($item['id']);
        return $items;
    };
    return $build(0);
}

function conversationById(int $id, string $viewer): ?array
{
    $allowed = query('SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?', [$id, $viewer])->fetchColumn();
    if (!$allowed) return null;
    $conversation = query('SELECT id, is_group AS isGroup FROM conversations WHERE id = ?', [$id])->fetch();
    if (!$conversation) return null;
    $conversation['id'] = (int)$conversation['id'];
    $participants = query('SELECT u.id AS participantId, u.user_name AS userName, u.profile_img AS profileImg FROM conversation_participants cp JOIN users u ON u.id = cp.user_id WHERE cp.conversation_id = ?', [$id])->fetchAll();
    $conversation['participants'] = array_map(fn($p) => ['participantId' => $p['participantId'], 'participant' => ['id' => $p['participantId'], 'userName' => $p['userName'], 'profileImg' => $p['profileImg']]], $participants);
    $messages = query('SELECT m.id, m.conversation_id AS conversationId, m.sender_id AS senderId, u.user_name AS userName, u.profile_img AS profileImg, m.content, m.created_at AS createdAt FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.conversation_id = ? ORDER BY m.created_at, m.id', [$id])->fetchAll();
    $conversation['messages'] = array_map(function ($m) {
        return ['id' => (int)$m['id'], 'conversation' => (int)$m['conversationId'], 'conversationId' => (int)$m['conversationId'], 'senderId' => $m['senderId'], 'sender' => ['userName' => $m['userName'], 'profileImg' => $m['profileImg']], 'content' => $m['content'], 'createdAt' => $m['createdAt'], 'replies' => []];
    }, $messages);
    return $conversation;
}

try {
    $action = $_GET['action'] ?? '';
    $input = body();

    if (str_starts_with($action, 'auth.')) {
        if ($action === 'auth.register') {
            $username = trim((string)($input['userName'] ?? ''));
            $email = strtolower(trim((string)($input['email'] ?? '')));
            $password = (string)($input['password'] ?? '');
            if ($username === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 8) respond(['error' => 'Enter a username, valid email, and password of at least 8 characters'], 422);
            $id = bin2hex(random_bytes(16));
            query('INSERT INTO users (id, email, user_name, password_hash, f_name, l_name, profile_img, banner, bio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [$id, $email, $username, password_hash($password, PASSWORD_DEFAULT), trim((string)($input['fName'] ?? '')), trim((string)($input['lName'] ?? '')), '', '', '']);
            session_start();
            session_regenerate_id(true);
            $_SESSION['user_id'] = $id;
            respond(['user' => userById($id)], 201);
        }
        if ($action === 'auth.login') {
            $email = strtolower(trim((string)($input['email'] ?? '')));
            $user = query('SELECT id, password_hash FROM users WHERE email = ?', [$email])->fetch();
            if (!$user || !password_verify((string)($input['password'] ?? ''), $user['password_hash'])) respond(['error' => 'Email or password is incorrect'], 401);
            session_start();
            session_regenerate_id(true);
            $_SESSION['user_id'] = $user['id'];
            respond(['user' => userById($user['id'])]);
        }
        if ($action === 'auth.me') {
            session_start();
            $id = $_SESSION['user_id'] ?? null;
            respond(['user' => is_string($id) ? userById($id) : null]);
        }
        if ($action === 'auth.logout') {
            session_start();
            $_SESSION = [];
            session_destroy();
            respond(['success' => true]);
        }
        respond(['error' => 'Unknown auth action'], 404);
    }

    if ($action === 'media.upload') {
        currentUserId();
        $file = $_FILES['file'] ?? null;
        if (!$file || $file['error'] !== UPLOAD_ERR_OK || $file['size'] > 8 * 1024 * 1024) respond(['error' => 'Choose an image smaller than 8 MB'], 422);
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
        $extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
        if (!isset($extensions[$mime])) respond(['error' => 'Only JPG, PNG, WEBP, and GIF images are supported'], 422);
        $directory = __DIR__ . '/uploads';
        if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) respond(['error' => 'Image storage is unavailable'], 500);
        $filename = bin2hex(random_bytes(20)) . '.' . $extensions[$mime];
        if (!move_uploaded_file($file['tmp_name'], $directory . '/' . $filename)) respond(['error' => 'Could not store the uploaded image'], 500);
        $scheme = ($_SERVER['HTTPS'] ?? '') !== '' ? 'https://' : 'http://';
        $basePath = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\');
        respond(['url' => $scheme . ($_SERVER['HTTP_HOST'] ?? 'localhost') . $basePath . '/uploads/' . $filename]);
    }

    $viewer = currentUserId();
    switch ($action) {
        case 'users.list':
            respond(query('SELECT id, email, user_name AS userName, profile_img AS profileImg, banner, f_name AS fName, l_name AS lName, bio FROM users ORDER BY user_name')->fetchAll());
        case 'users.get':
            respond(userById((string)($_GET['id'] ?? '')));
        case 'users.update':
            $id = $viewer;
            $fields = ['userName' => 'user_name', 'fName' => 'f_name', 'lName' => 'l_name', 'bio' => 'bio', 'profileImg' => 'profile_img', 'bannerImg' => 'banner'];
            $sets = [];
            $values = [];
            foreach ($fields as $key => $column) if (array_key_exists($key, $input)) { $sets[] = "$column = ?"; $values[] = $input[$key]; }
            if ($sets) { $values[] = $id; query('UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = ?', $values); }
            respond(userById($id));

        case 'posts.list':
            $where = "p.status = 'published'";
            $params = [];
            if (isset($_GET['authorId'])) { $where .= ' AND p.author_id = ?'; $params[] = $_GET['authorId']; }
            if (isset($_GET['groupId'])) { $where .= ' AND p.group_id = ?'; $params[] = (int)$_GET['groupId']; }
            $ids = query("SELECT p.id FROM posts p WHERE $where ORDER BY p.created_at DESC", $params)->fetchAll();
            respond(array_map(fn($row) => postById((int)$row['id'], $viewer), $ids));
        case 'posts.get':
            $post = postById((int)($_GET['id'] ?? 0), $viewer);
            if (!$post || ($post['status'] !== 'published' && $post['authorId'] !== $viewer)) respond(['error' => 'Post not found'], 404);
            respond($post);
        case 'posts.create':
            $title = trim((string)($input['title'] ?? ''));
            $content = trim((string)($input['content'] ?? ''));
            if ($content === '') respond(['error' => 'Post content is required'], 422);
            query('INSERT INTO posts (author_id, title, subject, content, is_anonymous, group_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)', [$viewer, $title, $title, $content, !empty($input['isAnonymous']), $input['groupId'] ?? null, in_array($input['status'] ?? 'published', ['published', 'draft', 'archived'], true) ? $input['status'] : 'published']);
            $id = (int)database()->lastInsertId();
            foreach (array_values($input['images'] ?? []) as $index => $url) query('INSERT INTO post_images (post_id, image_url, position) VALUES (?, ?, ?)', [$id, (string)$url, $index]);
            foreach (array_unique(array_map('strval', $input['tags'] ?? [])) as $tag) query('INSERT INTO post_tags (post_id, tag) VALUES (?, ?)', [$id, $tag]);
            respond(postById($id, $viewer), 201);
        case 'posts.update':
            $id = (int)($_GET['id'] ?? 0);
            if (!query('SELECT 1 FROM posts WHERE id = ? AND author_id = ?', [$id, $viewer])->fetchColumn()) respond(['error' => 'Post not found'], 404);
            $fields = ['title' => 'title', 'content' => 'content', 'status' => 'status', 'isAnonymous' => 'is_anonymous'];
            $sets = []; $values = [];
            foreach ($fields as $key => $column) if (array_key_exists($key, $input)) { $sets[] = "$column = ?"; $values[] = $input[$key]; }
            if (array_key_exists('title', $input)) { $sets[] = 'subject = ?'; $values[] = $input['title']; }
            if ($sets) { $values[] = $id; query('UPDATE posts SET ' . implode(', ', $sets) . ' WHERE id = ?', $values); }
            foreach (['images' => ['post_images', 'image_url'], 'tags' => ['post_tags', 'tag']] as $key => [$table, $column]) if (array_key_exists($key, $input)) { query("DELETE FROM $table WHERE post_id = ?", [$id]); foreach (array_values(array_unique(array_map('strval', $input[$key]))) as $index => $value) query("INSERT INTO $table (post_id, $column" . ($key === 'images' ? ', position' : '') . ') VALUES (' . ($key === 'images' ? '?, ?, ?' : '?, ?') . ')', $key === 'images' ? [$id, $value, $index] : [$id, $value]); }
            respond(postById($id, $viewer));
        case 'posts.delete':
            query('DELETE FROM posts WHERE id = ? AND author_id = ?', [(int)($_GET['id'] ?? 0), $viewer]); respond(['success' => true]);
        case 'posts.like':
            $id = (int)($_GET['id'] ?? 0);
            if (($input['type'] ?? '') === 'LIKE') query('INSERT IGNORE INTO post_likes (post_id, user_id) VALUES (?, ?)', [$id, $viewer]);
            else query('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?', [$id, $viewer]);
            respond(postById($id, $viewer));

        case 'saved.list':
            $ids = query('SELECT post_id FROM saved_posts WHERE user_id = ? ORDER BY saved_at DESC', [$viewer])->fetchAll();
            respond(array_values(array_filter(array_map(fn($row) => postById((int)$row['post_id'], $viewer), $ids))));
        case 'saved.status':
            respond(['isSaved' => (bool)query('SELECT 1 FROM saved_posts WHERE user_id = ? AND post_id = ?', [$viewer, (int)($_GET['postId'] ?? 0)])->fetchColumn()]);
        case 'saved.set':
            $postId = (int)($input['postId'] ?? 0);
            if (!query('SELECT 1 FROM posts WHERE id = ?', [$postId])->fetchColumn()) respond(['error' => 'Post not found'], 404);
            if (!empty($input['isSaved'])) query('INSERT IGNORE INTO saved_posts (user_id, post_id) VALUES (?, ?)', [$viewer, $postId]);
            else query('DELETE FROM saved_posts WHERE user_id = ? AND post_id = ?', [$viewer, $postId]);
            respond(['success' => true, 'isSaved' => !empty($input['isSaved'])]);

        case 'comments.list':
            if (!isset($_GET['postId'])) respond([]);
            respond(commentTree((int)$_GET['postId'], $viewer));
        case 'comments.get':
            $comment = query('SELECT post_id FROM comments WHERE id = ?', [(int)($_GET['id'] ?? 0)])->fetch();
            if (!$comment) respond(['error' => 'Comment not found'], 404);
            $tree = commentTree((int)$comment['post_id'], $viewer);
            $find = function (array $items) use (&$find): ?array { foreach ($items as $item) { if ($item['id'] === (int)($_GET['id'] ?? 0)) return $item; $found = $find($item['replies']); if ($found) return $found; } return null; };
            respond($find($tree));
        case 'comments.create':
            $postId = (int)($input['postId'] ?? 0);
            $content = trim((string)($input['content'] ?? ''));
            $parentId = $input['parentId'] ?? null;
            if ($content === '' || !query('SELECT 1 FROM posts WHERE id = ?', [$postId])->fetchColumn()) respond(['error' => 'A valid post and comment are required'], 422);
            if ($parentId !== null && !query('SELECT 1 FROM comments WHERE id = ? AND post_id = ?', [(int)$parentId, $postId])->fetchColumn()) respond(['error' => 'Reply target must belong to the same post'], 422);
            query('INSERT INTO comments (post_id, user_id, content, parent_id) VALUES (?, ?, ?, ?)', [$postId, $viewer, $content, $parentId]);
            $id = (int)database()->lastInsertId();
            $tree = commentTree((int)$input['postId'], $viewer);
            $find = function (array $items) use (&$find, $id): ?array { foreach ($items as $item) { if ($item['id'] === $id) return $item; $found = $find($item['replies']); if ($found) return $found; } return null; };
            respond($find($tree), 201);
        case 'comments.update':
            query('UPDATE comments SET content = ? WHERE id = ? AND user_id = ?', [trim((string)($input['content'] ?? '')), (int)($_GET['id'] ?? 0), $viewer]); respond(['success' => true]);
        case 'comments.delete':
            query('DELETE FROM comments WHERE id = ? AND user_id = ?', [(int)($_GET['id'] ?? 0), $viewer]); respond(['success' => true]);
        case 'comments.like':
            $id = (int)($_GET['id'] ?? 0);
            if (($input['type'] ?? '') === 'LIKE') query('INSERT IGNORE INTO comment_likes (comment_id, user_id) VALUES (?, ?)', [$id, $viewer]); else query('DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?', [$id, $viewer]);
            respond(['success' => true, 'likesCount' => (int)query('SELECT COUNT(*) FROM comment_likes WHERE comment_id = ?', [$id])->fetchColumn()]);

        case 'friends.list':
            $rows = query("SELECT f.id, f.sender_id AS senderId, f.receiver_id AS receiverId, f.status, f.created_at AS createdAt, CASE WHEN f.sender_id = ? THEN f.receiver_id ELSE f.sender_id END AS otherId, CASE WHEN f.sender_id = ? THEN 1 ELSE 0 END AS isSender, u.user_name AS userName, u.profile_img AS profileImg FROM friendships f JOIN users u ON u.id = CASE WHEN f.sender_id = ? THEN f.receiver_id ELSE f.sender_id END WHERE (f.sender_id = ? OR f.receiver_id = ?) AND f.status = 'ACCEPTED' ORDER BY f.created_at DESC", [$viewer, $viewer, $viewer, $viewer, $viewer])->fetchAll();
            respond(array_map(fn($f) => ['id' => (int)$f['id'], 'friendId' => (int)$f['id'], 'createdAt' => $f['createdAt'], 'status' => $f['status'], 'isSender' => (bool)$f['isSender'], 'senderId' => $f['senderId'], 'receiverId' => $f['receiverId'], 'otherUser' => ['id' => $f['otherId'], 'userName' => $f['userName'], 'profileImg' => $f['profileImg']]], $rows));
        case 'friends.requests':
            $rows = query("SELECT f.id, f.sender_id AS senderId, f.receiver_id AS receiverId, f.status, f.created_at AS createdAt, u.user_name AS userName, u.profile_img AS profileImg FROM friendships f JOIN users u ON u.id = f.sender_id WHERE f.receiver_id = ? AND f.status = 'PENDING'", [$viewer])->fetchAll();
            respond(array_map(fn($f) => ['id' => (int)$f['id'], 'friendId' => (int)$f['id'], 'createdAt' => $f['createdAt'], 'status' => $f['status'], 'isSender' => false, 'senderId' => $f['senderId'], 'receiverId' => $f['receiverId'], 'otherUser' => ['id' => $f['senderId'], 'userName' => $f['userName'], 'profileImg' => $f['profileImg']]], $rows));
        case 'friends.sent':
            $rows = query("SELECT f.id, f.sender_id AS senderId, f.receiver_id AS receiverId, f.status, f.created_at AS createdAt, u.user_name AS userName, u.profile_img AS profileImg FROM friendships f JOIN users u ON u.id = f.receiver_id WHERE f.sender_id = ? AND f.status = 'PENDING'", [$viewer])->fetchAll();
            respond(array_map(fn($f) => ['id' => (int)$f['id'], 'friendId' => (int)$f['id'], 'createdAt' => $f['createdAt'], 'status' => $f['status'], 'isSender' => true, 'senderId' => $f['senderId'], 'receiverId' => $f['receiverId'], 'otherUser' => ['id' => $f['receiverId'], 'userName' => $f['userName'], 'profileImg' => $f['profileImg']]], $rows));
        case 'friends.send':
            $receiver = (string)($input['receiverId'] ?? '');
            if ($receiver === $viewer || !userById($receiver)) respond(['error' => 'Invalid friend'], 422);
            $existing = query('SELECT id FROM friendships WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)', [$viewer, $receiver, $receiver, $viewer])->fetchColumn();
            if (!$existing) { query('INSERT INTO friendships (sender_id, receiver_id, status) VALUES (?, ?, ?)', [$viewer, $receiver, 'PENDING']); $existing = (int)database()->lastInsertId(); }
            $other = userById($receiver);
            respond(['id' => (int)$existing, 'friendId' => (int)$existing, 'status' => 'PENDING', 'isSender' => true, 'senderId' => $viewer, 'receiverId' => $receiver, 'otherUser' => ['id' => $receiver, 'userName' => $other['userName'], 'profileImg' => $other['profileImg']]], 201);
        case 'friends.accept':
            query("UPDATE friendships SET status = 'ACCEPTED' WHERE id = ? AND receiver_id = ?", [(int)($_GET['id'] ?? 0), $viewer]); respond(['success' => true]);
        case 'friends.delete':
            query('DELETE FROM friendships WHERE id = ? AND (sender_id = ? OR receiver_id = ?)', [(int)($_GET['id'] ?? 0), $viewer, $viewer]); respond(['success' => true]);

        case 'groups.list':
            $rows = query('SELECT id FROM groups ORDER BY created_at DESC')->fetchAll(); respond(array_map(fn($g) => groupById((int)$g['id'], $viewer), $rows));
        case 'groups.get':
            $group = groupById((int)($_GET['id'] ?? 0), $viewer); if (!$group) respond(['error' => 'Group not found'], 404); respond($group);
        case 'groups.mine':
            $rows = query('SELECT group_id AS id FROM group_members WHERE user_id = ?', [$viewer])->fetchAll(); respond(array_map(fn($g) => groupById((int)$g['id'], $viewer), $rows));
        case 'groups.create':
            query('INSERT INTO groups (group_name, description, group_img, banner_img, created_by) VALUES (?, ?, ?, ?, ?)', [trim((string)($input['groupName'] ?? '')), (string)($input['description'] ?? ''), (string)($input['groupImg'] ?? ''), (string)($input['bannerImg'] ?? ''), $viewer]);
            $id = (int)database()->lastInsertId(); query("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'OWNER')", [$id, $viewer]); respond(groupById($id, $viewer), 201);
        case 'groups.update':
            $id = (int)($_GET['id'] ?? 0);
            if (!query("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? AND role IN ('OWNER','ADMIN')", [$id, $viewer])->fetchColumn()) respond(['error' => 'Not authorized'], 403);
            $fields = ['groupName' => 'group_name', 'description' => 'description', 'groupImg' => 'group_img', 'bannerImg' => 'banner_img', 'allowAnonymity' => 'allow_anonymity']; $sets = []; $values = [];
            foreach ($fields as $key => $column) if (array_key_exists($key, $input)) { $sets[] = "$column = ?"; $values[] = $input[$key]; }
            if ($sets) { $values[] = $id; query('UPDATE groups SET ' . implode(', ', $sets) . ' WHERE id = ?', $values); }
            if (array_key_exists('groupThemes', $input)) { query('DELETE FROM group_themes WHERE group_id = ?', [$id]); foreach ($input['groupThemes'] as $theme) query('INSERT INTO group_themes (group_id, theme) VALUES (?, ?)', [$id, (string)$theme]); }
            respond(groupById($id, $viewer));
        case 'groups.toggleMember':
            $id = (int)($_GET['id'] ?? 0); $exists = query('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?', [$id, $viewer])->fetchColumn();
            if ($exists && $exists !== 'OWNER') query('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', [$id, $viewer]); elseif (!$exists) query("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'MEMBER')", [$id, $viewer]);
            respond(['success' => true, 'isFollowed' => !$exists]);
        case 'groups.delete':
            $id = (int)($_GET['id'] ?? 0); query('DELETE FROM groups WHERE id = ? AND created_by = ?', [$id, $viewer]); respond(['success' => true]);
        case 'groups.members':
            $rows = query('SELECT CONCAT(gm.group_id, "-", gm.user_id) AS id, gm.user_id AS memberId, gm.user_id AS userId, gm.role, gm.joined_at AS joinedAt, u.user_name AS userName, u.profile_img AS profileImg FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ?', [(int)($_GET['id'] ?? 0)])->fetchAll();
            respond(array_map(fn($m) => ['id' => $m['id'], 'memberId' => $m['memberId'], 'userId' => $m['userId'], 'role' => $m['role'], 'joinedAt' => $m['joinedAt'], 'user' => ['userName' => $m['userName'], 'profileImg' => $m['profileImg']]], $rows));
        case 'groups.removeMember':
            $groupId = (int)($_GET['id'] ?? 0); $memberId = (string)($_GET['userId'] ?? '');
            $actorRole = query('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?', [$groupId, $viewer])->fetchColumn();
            if ($memberId !== $viewer && !in_array($actorRole, ['OWNER', 'ADMIN'], true)) respond(['error' => 'Not authorized'], 403);
            query('DELETE FROM group_members WHERE group_id = ? AND user_id = ? AND role <> \'OWNER\'', [$groupId, $memberId]); respond(['success' => true]);
        case 'groups.invite':
            $groupId = (int)($_GET['id'] ?? 0); $targetId = (string)($input['userId'] ?? '');
            if (!query("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? AND role IN ('OWNER','ADMIN')", [$groupId, $viewer])->fetchColumn()) respond(['error' => 'Not authorized'], 403);
            query("INSERT IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, 'MEMBER')", [$groupId, $targetId]); respond(['success' => true]);
        case 'groups.role':
            $role = (string)($input['role'] ?? 'MEMBER'); $groupId = (int)($_GET['id'] ?? 0);
            if (!in_array($role, ['ADMIN', 'MEMBER'], true) || !query("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? AND role = 'OWNER'", [$groupId, $viewer])->fetchColumn()) respond(['error' => 'Not authorized'], 403);
            query('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ? AND role <> \'OWNER\'', [$role, $groupId, (string)($_GET['userId'] ?? '')]); respond(['success' => true]);

        case 'conversations.list':
            $ids = query('SELECT cp.conversation_id AS id FROM conversation_participants cp WHERE cp.user_id = ? ORDER BY cp.conversation_id DESC', [$viewer])->fetchAll(); respond(array_map(fn($row) => conversationById((int)$row['id'], $viewer), $ids));
        case 'conversations.get':
            $conversation = conversationById((int)($_GET['id'] ?? 0), $viewer); if (!$conversation) respond(['error' => 'Conversation not found'], 404); respond($conversation);
        case 'conversations.direct':
            $other = (string)($_GET['userId'] ?? '');
            $row = query("SELECT c.id FROM conversations c JOIN conversation_participants a ON a.conversation_id = c.id AND a.user_id = ? JOIN conversation_participants b ON b.conversation_id = c.id AND b.user_id = ? WHERE c.is_group = 0 AND (SELECT COUNT(*) FROM conversation_participants x WHERE x.conversation_id = c.id) = 2 LIMIT 1", [$viewer, $other])->fetch();
            respond($row ? conversationById((int)$row['id'], $viewer) : null);
        case 'conversations.createDirect':
            $other = (string)($input['userId'] ?? '');
            if ($other === $viewer || !userById($other)) respond(['error' => 'Invalid participant'], 422);
            $existing = query("SELECT c.id FROM conversations c JOIN conversation_participants a ON a.conversation_id = c.id AND a.user_id = ? JOIN conversation_participants b ON b.conversation_id = c.id AND b.user_id = ? WHERE c.is_group = 0 AND (SELECT COUNT(*) FROM conversation_participants x WHERE x.conversation_id = c.id) = 2 LIMIT 1", [$viewer, $other])->fetchColumn();
            if ($existing) respond(conversationById((int)$existing, $viewer));
            database()->beginTransaction();
            query('INSERT INTO conversations (is_group) VALUES (0)');
            $id = (int)database()->lastInsertId();
            query('INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?), (?, ?)', [$id, $viewer, $id, $other]);
            database()->commit();
            respond(conversationById($id, $viewer), 201);
        case 'conversations.createGroup':
            $participants = array_values(array_unique(array_merge([$viewer], array_map('strval', $input['participants'] ?? []))));
            if (count($participants) < 3) respond(['error' => 'Group chat requires at least three participants'], 422);
            database()->beginTransaction(); query('INSERT INTO conversations (is_group) VALUES (1)'); $id = (int)database()->lastInsertId(); foreach ($participants as $participant) query('INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)', [$id, $participant]); database()->commit(); respond(conversationById($id, $viewer), 201);
        case 'messages.send':
            $conversationId = isset($input['conversationId']) ? (int)$input['conversationId'] : 0;
            $receiver = (string)($input['receiverId'] ?? '');
            if (!$conversationId) {
                $found = query("SELECT c.id FROM conversations c JOIN conversation_participants a ON a.conversation_id = c.id AND a.user_id = ? JOIN conversation_participants b ON b.conversation_id = c.id AND b.user_id = ? WHERE c.is_group = 0 AND (SELECT COUNT(*) FROM conversation_participants x WHERE x.conversation_id = c.id) = 2 LIMIT 1", [$viewer, $receiver])->fetchColumn();
                if ($found) $conversationId = (int)$found;
                else { database()->beginTransaction(); query('INSERT INTO conversations (is_group) VALUES (0)'); $conversationId = (int)database()->lastInsertId(); query('INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?), (?, ?)', [$conversationId, $viewer, $conversationId, $receiver]); database()->commit(); }
            }
            if (!query('SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?', [$conversationId, $viewer])->fetchColumn()) respond(['error' => 'Not a conversation participant'], 403);
            query('INSERT INTO messages (conversation_id, sender_id, content) VALUES (?, ?, ?)', [$conversationId, $viewer, trim((string)($input['content'] ?? ''))]);
            $messageId = (int)database()->lastInsertId(); $message = query('SELECT m.id, m.conversation_id AS conversationId, m.sender_id AS senderId, u.user_name AS userName, u.profile_img AS profileImg, m.content, m.created_at AS createdAt FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?', [$messageId])->fetch();
            respond(['type' => 'message', 'message' => ['id' => $messageId, 'conversation' => $conversationId, 'conversationId' => $conversationId, 'senderId' => $viewer, 'sender' => ['userName' => $message['userName'], 'profileImg' => $message['profileImg']], 'content' => $message['content'], 'createdAt' => $message['createdAt'], 'replies' => []]], 201);
        case 'messages.delete':
            query('DELETE FROM messages WHERE id = ? AND sender_id = ?', [(int)($_GET['id'] ?? 0), $viewer]); respond(['success' => true]);
        case 'conversations.invite':
            $id = (int)($_GET['id'] ?? 0);
            if (!query('SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?', [$id, $viewer])->fetchColumn()) respond(['error' => 'Not authorized'], 403);
            query('INSERT IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)', [$id, (string)($input['userId'] ?? '')]); respond(['success' => true]);
        case 'conversations.removeMember':
            $id = (int)($_GET['id'] ?? 0); $targetId = (string)($_GET['userId'] ?? '');
            if (!query('SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?', [$id, $viewer])->fetchColumn()) respond(['error' => 'Not authorized'], 403);
            if ($targetId !== $viewer) {
                $isGroup = (bool)query('SELECT is_group FROM conversations WHERE id = ?', [$id])->fetchColumn();
                if (!$isGroup) respond(['error' => 'Cannot remove another direct-message participant'], 403);
            }
            query('DELETE FROM conversation_participants WHERE conversation_id = ? AND user_id = ?', [$id, $targetId]); respond(['success' => true]);
        default:
            respond(['error' => 'Unknown action'], 404);
    }
} catch (PDOException $error) {
    error_log($error->getMessage());
    respond(['error' => 'Database request failed. Check the XAMPP MySQL service and schema setup.'], 500);
} catch (Throwable $error) {
    error_log($error->getMessage());
    respond(['error' => 'Server error'], 500);
}