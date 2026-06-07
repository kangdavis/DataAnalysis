const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const ALLOWED_CATEGORIES = ["기업분석", "산업분석", "매매일지"];
const ALLOWED_STANCES = ["관찰", "긍정", "중립", "부정", "보류"];

const sessions = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml"
};

function ensureDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) return;

  const now = new Date().toISOString();
  const demoUser = createUserRecord("관리자", "admin@example.com", "password123");
  const db = {
    users: [demoUser],
    posts: [
      {
        id: "demo-ai-infra",
        userId: demoUser.id,
        title: "AI 인프라 사이클은 어디까지 이어질까",
        category: "산업분석",
        tickers: "NVDA, MSFT, 000660",
        stance: "관찰",
        published: false,
        thesis: "",
        body: "확인할 지표는 GPU 공급 리드타임, 클라우드 capex 가이던스, 전력 인프라 투자, 추론 비용 하락 속도다.",
        risks: "대형 고객의 capex 둔화, 자체 칩 전환, 전력 병목, 밸류에이션 부담을 계속 확인한다.",
        createdAt: now,
        updatedAt: now
      }
    ]
  };
  writeDb(db);
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function createUserRecord(name, email, password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return {
    id: crypto.randomUUID(),
    name,
    email: email.toLowerCase(),
    passwordHash: hashPassword(password, salt),
    salt,
    createdAt: new Date().toISOString()
  };
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { userId, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function getSessionUser(request) {
  const cookies = parseCookies(request.headers.cookie || "");
  const token = cookies.session;
  if (!token) return null;

  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }

  const db = readDb();
  return db.users.find((user) => user.id === session.userId) || null;
}

function parseCookies(cookieHeader) {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function sessionHeader(token, request) {
  const secureCookie = process.env.FORCE_SECURE_COOKIES === "true"
    || request.headers["x-forwarded-proto"] === "https";
  const secureFlag = secureCookie ? "; Secure" : "";
  return {
    "Set-Cookie": `session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secureFlag}`
  };
}

function sendJson(response, status, data, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });
  response.end(JSON.stringify(data));
}

function sendError(response, status, message) {
  sendJson(response, status, { message });
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

function normalizePost(input) {
  return {
    title: String(input.title || "").trim(),
    category: normalizeCategory(input.category),
    tickers: String(input.tickers || "").trim(),
    stance: normalizeStance(input.stance),
    published: Boolean(input.published),
    thesis: "",
    body: String(input.body || "").trim(),
    risks: String(input.risks || "").trim()
  };
}

function normalizeCategory(category) {
  const value = String(category || "").trim();
  const aliases = {
    "시장 관찰": "산업분석",
    "기업 분석": "기업분석",
    "산업 분석": "산업분석",
    "포트폴리오": "매매일지",
    "매매 복기": "매매일지",
    "아이디어": "산업분석"
  };
  const normalized = aliases[value] || value || "기업분석";
  return ALLOWED_CATEGORIES.includes(normalized) ? normalized : "기업분석";
}

function normalizeStance(stance) {
  const normalized = String(stance || "").trim() || "관찰";
  return ALLOWED_STANCES.includes(normalized) ? normalized : "관찰";
}

function postWithAuthor(post, db) {
  const author = db.users.find((user) => user.id === post.userId);
  return {
    ...post,
    category: normalizeCategory(post.category),
    stance: normalizeStance(post.stance),
    authorName: author?.name || "알 수 없음"
  };
}

async function handleApi(request, response, url) {
  const user = getSessionUser(request);

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/session") {
    sendJson(response, 200, { user: user ? publicUser(user) : null });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/register") {
    const body = await readBody(request);
    if (!body) return sendError(response, 400, "요청 형식이 올바르지 않습니다.");

    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!name || !email || password.length < 8) {
      return sendError(response, 400, "이름, 이메일, 8자 이상의 비밀번호가 필요합니다.");
    }

    const db = readDb();
    if (db.users.some((item) => item.email === email)) {
      return sendError(response, 409, "이미 가입된 이메일입니다.");
    }

    const newUser = createUserRecord(name, email, password);
    db.users.push(newUser);
    writeDb(db);

    const token = createSession(newUser.id);
    sendJson(response, 201, { user: publicUser(newUser) }, sessionHeader(token, request));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readBody(request);
    if (!body) return sendError(response, 400, "요청 형식이 올바르지 않습니다.");

    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const db = readDb();
    const found = db.users.find((item) => item.email === email);

    if (!found || hashPassword(password, found.salt) !== found.passwordHash) {
      return sendError(response, 401, "이메일 또는 비밀번호가 올바르지 않습니다.");
    }

    const token = createSession(found.id);
    sendJson(response, 200, { user: publicUser(found) }, sessionHeader(token, request));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    const cookies = parseCookies(request.headers.cookie || "");
    if (cookies.session) sessions.delete(cookies.session);
    sendJson(response, 200, { ok: true }, {
      "Set-Cookie": "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/posts") {
    const scope = url.searchParams.get("scope") || "public";
    const db = readDb();
    let posts = [];

    if (scope === "mine") {
      if (!user) return sendError(response, 401, "로그인이 필요합니다.");
      posts = db.posts.filter((post) => post.userId === user.id);
    } else {
      posts = db.posts.filter((post) => post.published);
    }

    posts = posts
      .map((post) => postWithAuthor(post, db))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    sendJson(response, 200, { posts });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/posts") {
    if (!user) return sendError(response, 401, "로그인이 필요합니다.");
    const body = await readBody(request);
    if (!body) return sendError(response, 400, "요청 형식이 올바르지 않습니다.");

    const normalized = normalizePost(body);
    if (!normalized.title) return sendError(response, 400, "제목을 입력해주세요.");

    const now = new Date().toISOString();
    const db = readDb();
    const post = {
      id: crypto.randomUUID(),
      userId: user.id,
      ...normalized,
      createdAt: now,
      updatedAt: now
    };
    db.posts.push(post);
    writeDb(db);
    sendJson(response, 201, { post: postWithAuthor(post, db) });
    return;
  }

  const postMatch = url.pathname.match(/^\/api\/posts\/([A-Za-z0-9-]+)$/);
  if (postMatch && (request.method === "PUT" || request.method === "DELETE")) {
    if (!user) return sendError(response, 401, "로그인이 필요합니다.");

    const db = readDb();
    const index = db.posts.findIndex((post) => post.id === postMatch[1] && post.userId === user.id);
    if (index === -1) return sendError(response, 404, "글을 찾을 수 없습니다.");

    if (request.method === "DELETE") {
      db.posts.splice(index, 1);
      writeDb(db);
      sendJson(response, 200, { ok: true });
      return;
    }

    const body = await readBody(request);
    if (!body) return sendError(response, 400, "요청 형식이 올바르지 않습니다.");
    const normalized = normalizePost(body);
    if (!normalized.title) return sendError(response, 400, "제목을 입력해주세요.");

    db.posts[index] = {
      ...db.posts[index],
      ...normalized,
      updatedAt: new Date().toISOString()
    };
    writeDb(db);
    sendJson(response, 200, { post: postWithAuthor(db.posts[index], db) });
    return;
  }

  sendError(response, 404, "API 경로를 찾을 수 없습니다.");
}

function serveStatic(request, response, url) {
  if (url.pathname.startsWith("/data/") || url.pathname === "/server.js") {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(ROOT, requested));

  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(data);
  });
}

ensureDb();

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    serveStatic(request, response, url);
  } catch (error) {
    console.error(error);
    sendError(response, 500, "서버 오류가 발생했습니다.");
  }
});

server.listen(PORT, () => {
  console.log(`Investment notes server running at http://localhost:${PORT}`);
});
