const CATEGORIES = ["기업분석", "산업분석", "매매일지"];
const STANCES = ["관찰", "긍정", "중립", "부정", "보류"];

const state = {
  user: null,
  publicPosts: [],
  myPosts: [],
  selectedPublicId: null,
  selectedMyId: null
};

const $ = (selector) => document.querySelector(selector);

const elements = {
  loginForm: $("#loginForm"),
  logoutButton: $("#logoutButton"),
  sessionBar: $("#sessionBar"),
  sessionText: $("#sessionText"),
  userChip: $("#userChip"),
  authStatus: $("#authStatus"),
  publicCount: $("#publicCount"),
  myCount: $("#myCount"),
  lastUpdated: $("#lastUpdated"),
  publicList: $("#publicList"),
  publicReader: $("#publicReader"),
  myList: $("#myList"),
  myReader: $("#myReader"),
  publicSearch: $("#publicSearch"),
  publicCategory: $("#publicCategory"),
  publicStance: $("#publicStance"),
  mySearch: $("#mySearch"),
  myCategory: $("#myCategory"),
  myStance: $("#myStance"),
  refreshButton: $("#refreshButton"),
  postForm: $("#postForm"),
  postId: $("#postId"),
  title: $("#title"),
  category: $("#category"),
  tickers: $("#tickers"),
  stance: $("#stance"),
  published: $("#published"),
  body: $("#body"),
  risks: $("#risks"),
  newPostButton: $("#newPostButton"),
  deleteButton: $("#deleteButton"),
  previewButton: $("#previewButton"),
  previewModal: $("#previewModal"),
  previewContent: $("#previewContent"),
  closePreviewButton: $("#closePreviewButton"),
  saveStatus: $("#saveStatus"),
  toolbarButtons: document.querySelectorAll(".editor-toolbar button")
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    throw new Error(payload?.message || "요청을 처리하지 못했습니다.");
  }

  return payload;
}

async function loadSession() {
  try {
    const data = await api("/api/session");
    state.user = data.user;
  } catch {
    state.user = null;
  }
  renderSession();
}

async function loadPosts() {
  const publicData = await api("/api/posts?scope=public");
  state.publicPosts = publicData.posts;
  state.selectedPublicId = keepOrFirst(state.selectedPublicId, state.publicPosts);

  if (state.user) {
    const myData = await api("/api/posts?scope=mine");
    state.myPosts = myData.posts;
    state.selectedMyId = keepOrFirst(state.selectedMyId, state.myPosts);
  } else {
    state.myPosts = [];
    state.selectedMyId = null;
  }

  renderAll();
}

function keepOrFirst(currentId, posts) {
  return posts.some((post) => post.id === currentId) ? currentId : posts[0]?.id || null;
}

function renderAll() {
  renderMetrics();
  renderPostList("public");
  renderPostList("my");
  renderReader("public");
  renderReader("my");
}

function renderSession() {
  if (state.user) {
    elements.userChip.textContent = `${state.user.name} 로그인 중`;
    elements.sessionText.textContent = `${state.user.name} (${state.user.email})`;
    elements.sessionBar.hidden = false;
    elements.loginForm.hidden = true;
    elements.saveStatus.textContent = "";
    return;
  }

  elements.userChip.textContent = "로그인이 필요합니다";
  elements.sessionText.textContent = "";
  elements.sessionBar.hidden = true;
  elements.loginForm.hidden = false;
  elements.saveStatus.textContent = "글을 저장하려면 로그인하세요.";
}

function renderMetrics() {
  elements.publicCount.textContent = state.publicPosts.length;
  elements.myCount.textContent = state.myPosts.length;
  const newest = [...state.publicPosts, ...state.myPosts].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
  elements.lastUpdated.textContent = newest ? formatDate(newest.updatedAt) : "-";
}

function getFilteredPosts(type) {
  const posts = type === "public" ? state.publicPosts : state.myPosts;
  const query = (type === "public" ? elements.publicSearch.value : elements.mySearch.value).trim().toLowerCase();
  const category = type === "public" ? elements.publicCategory.value : elements.myCategory.value;
  const stance = type === "public" ? elements.publicStance.value : elements.myStance.value;

  return posts.filter((post) => {
    const normalizedCategory = normalizeCategory(post.category);
    const normalizedStance = normalizeStance(post.stance);
    const searchable = [
      post.title,
      post.authorName,
      normalizedCategory,
      post.tickers,
      normalizedStance,
      post.body,
      post.risks
    ].join(" ").toLowerCase();

    return (!query || searchable.includes(query))
      && (category === "all" || normalizedCategory === category)
      && (stance === "all" || normalizedStance === stance);
  });
}

function renderPostList(type) {
  const list = type === "public" ? elements.publicList : elements.myList;
  const posts = getFilteredPosts(type);
  const selectedId = type === "public" ? state.selectedPublicId : state.selectedMyId;
  list.innerHTML = "";

  if (!state.user && type === "my") {
    list.innerHTML = '<div class="empty-state">로그인하면 내가 작성한 글을 관리할 수 있습니다.</div>';
    return;
  }

  if (posts.length === 0) {
    list.innerHTML = '<div class="empty-state">조건에 맞는 글이 없습니다.</div>';
    return;
  }

  posts.forEach((post) => {
    const card = document.createElement("button");
    card.className = `post-card${post.id === selectedId ? " active" : ""}`;
    card.type = "button";
    card.innerHTML = `
      <div class="post-meta">
        <span>${escapeHtml(normalizeCategory(post.category))} · ${escapeHtml(normalizeStance(post.stance))}</span>
        <time datetime="${escapeHtml(post.updatedAt)}">${formatDate(post.updatedAt)}</time>
      </div>
      <h3>${escapeHtml(post.title)}</h3>
      <p>${escapeHtml(excerpt(post.body || "본문이 아직 없습니다."))}</p>
      <div class="tag-row">
        ${type === "public" ? `<span class="tag">${escapeHtml(post.authorName || "익명")}</span>` : ""}
        ${post.published ? '<span class="tag">공개</span>' : '<span class="tag">비공개</span>'}
        ${tickerTags(post.tickers)}
      </div>
    `;
    card.addEventListener("click", () => {
      if (type === "public") state.selectedPublicId = post.id;
      if (type === "my") state.selectedMyId = post.id;
      renderAll();
    });
    list.append(card);
  });
}

function renderReader(type) {
  const reader = type === "public" ? elements.publicReader : elements.myReader;
  const posts = type === "public" ? state.publicPosts : state.myPosts;
  const selectedId = type === "public" ? state.selectedPublicId : state.selectedMyId;
  const post = posts.find((item) => item.id === selectedId);

  if (!post) {
    reader.classList.remove("visible");
    reader.innerHTML = "";
    return;
  }

  reader.classList.add("visible");
  reader.innerHTML = renderPost(post, type === "my");
}

function renderPost(post, editable = false) {
  return `
    <div class="post-meta">
      <span>${escapeHtml(normalizeCategory(post.category))} · ${escapeHtml(normalizeStance(post.stance))} · ${escapeHtml(post.authorName || "나")}</span>
      <time datetime="${escapeHtml(post.updatedAt)}">${formatDate(post.updatedAt)}</time>
    </div>
    <h3>${escapeHtml(post.title)}</h3>
    <div class="tag-row">
      ${post.published ? '<span class="tag">공개</span>' : '<span class="tag">비공개</span>'}
      ${tickerTags(post.tickers)}
    </div>
    <h4>본문</h4>
    <p>${escapeHtml(post.body || "아직 작성되지 않았습니다.")}</p>
    <h4>리스크와 체크포인트</h4>
    <p>${escapeHtml(post.risks || "아직 작성되지 않았습니다.")}</p>
    ${editable ? `<div class="reader-actions"><button class="button primary" type="button" data-edit="${post.id}">수정하기</button></div>` : ""}
  `;
}

function fillForm(post) {
  elements.postId.value = post?.id || "";
  elements.title.value = post?.title || "";
  elements.category.value = normalizeCategory(post?.category);
  elements.tickers.value = post?.tickers || "";
  elements.stance.value = normalizeStance(post?.stance);
  elements.published.checked = Boolean(post?.published);
  elements.body.value = post?.body || "";
  elements.risks.value = post?.risks || "";
  elements.deleteButton.disabled = !post;
}

function formPayload() {
  return {
    title: elements.title.value.trim(),
    category: normalizeCategory(elements.category.value),
    tickers: elements.tickers.value.trim(),
    stance: normalizeStance(elements.stance.value),
    published: elements.published.checked,
    thesis: "",
    body: elements.body.value.trim(),
    risks: elements.risks.value.trim()
  };
}

function normalizeCategory(category) {
  const aliases = {
    "시장 관찰": "산업분석",
    "기업 분석": "기업분석",
    "산업 분석": "산업분석",
    "포트폴리오": "매매일지",
    "매매 복기": "매매일지",
    "아이디어": "산업분석"
  };
  const normalized = aliases[category] || category || "기업분석";
  return CATEGORIES.includes(normalized) ? normalized : "기업분석";
}

function normalizeStance(stance) {
  const normalized = stance || "관찰";
  return STANCES.includes(normalized) ? normalized : "관찰";
}

async function savePost(event) {
  event.preventDefault();
  if (!state.user) {
    elements.saveStatus.textContent = "로그인 후 저장할 수 있습니다.";
    document.querySelector("#auth").scrollIntoView({ behavior: "smooth" });
    return;
  }

  const id = elements.postId.value;
  const path = id ? `/api/posts/${id}` : "/api/posts";
  const method = id ? "PUT" : "POST";
  const data = await api(path, {
    method,
    body: JSON.stringify(formPayload())
  });

  elements.saveStatus.textContent = "저장했습니다.";
  state.selectedMyId = data.post.id;
  await loadPosts();
}

async function deletePost() {
  const id = elements.postId.value;
  if (!id) return;
  const post = state.myPosts.find((item) => item.id === id);
  if (!confirm(`"${post?.title || "이 글"}"을 삭제할까요?`)) return;

  await api(`/api/posts/${id}`, { method: "DELETE" });
  fillForm(null);
  state.selectedMyId = null;
  elements.saveStatus.textContent = "삭제했습니다.";
  await loadPosts();
}

function showPreview() {
  const post = {
    ...formPayload(),
    authorName: state.user?.name || "미로그인",
    updatedAt: new Date().toISOString()
  };
  elements.previewContent.innerHTML = renderPost(post, false);
  elements.previewModal.showModal();
}

function editSelectedPost(id) {
  const post = state.myPosts.find((item) => item.id === id);
  if (!post) return;
  fillForm(post);
  document.querySelector("#write").scrollIntoView({ behavior: "smooth" });
}

async function submitLogin(event) {
  event.preventDefault();
  const email = $("#loginEmail").value.trim();
  const password = $("#loginPassword").value;
  const data = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  state.user = data.user;
  elements.authStatus.textContent = "로그인했습니다.";
  renderSession();
  await loadPosts();
}

async function logout() {
  await api("/api/auth/logout", { method: "POST" });
  state.user = null;
  state.myPosts = [];
  fillForm(null);
  renderSession();
  await loadPosts();
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

function tickerTags(value = "") {
  return value
    .split(",")
    .map((ticker) => ticker.trim().toUpperCase())
    .filter(Boolean)
    .map((ticker) => `<span class="tag">${escapeHtml(ticker)}</span>`)
    .join("");
}

function excerpt(value) {
  const compact = String(value).replace(/\s+/g, " ").trim();
  return compact.length > 100 ? `${compact.slice(0, 100)}...` : compact;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function insertIntoBody({ insert, wrap }) {
  const textarea = elements.body;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end);

  let nextText;
  let nextCursor;
  if (wrap) {
    const fallback = "텍스트";
    nextText = `${wrap}${selected || fallback}${wrap}`;
    nextCursor = start + wrap.length + (selected || fallback).length;
  } else {
    nextText = insert;
    nextCursor = start + insert.length;
  }

  textarea.setRangeText(nextText, start, end, "end");
  textarea.focus();
  textarea.setSelectionRange(nextCursor, nextCursor);
}

function bindEvents() {
  elements.loginForm.addEventListener("submit", submitLogin);
  elements.logoutButton.addEventListener("click", logout);
  elements.refreshButton.addEventListener("click", loadPosts);
  elements.postForm.addEventListener("submit", savePost);
  elements.deleteButton.addEventListener("click", deletePost);
  elements.previewButton.addEventListener("click", showPreview);
  elements.closePreviewButton.addEventListener("click", () => elements.previewModal.close());
  elements.newPostButton.addEventListener("click", () => {
    fillForm(null);
    elements.saveStatus.textContent = "새 글을 작성 중입니다.";
    elements.title.focus();
  });
  elements.myReader.addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit]");
    if (button) editSelectedPost(button.dataset.edit);
  });

  elements.toolbarButtons.forEach((button) => {
    button.addEventListener("click", () => {
      insertIntoBody({
        insert: button.dataset.insert,
        wrap: button.dataset.wrap
      });
    });
  });

  [elements.publicSearch, elements.publicCategory, elements.publicStance].forEach((element) => {
    element.addEventListener("input", () => {
      state.selectedPublicId = getFilteredPosts("public")[0]?.id || null;
      renderAll();
    });
  });

  [elements.mySearch, elements.myCategory, elements.myStance].forEach((element) => {
    element.addEventListener("input", () => {
      state.selectedMyId = getFilteredPosts("my")[0]?.id || null;
      renderAll();
    });
  });
}

async function boot() {
  bindEvents();
  try {
    await loadSession();
    await loadPosts();
  } catch (error) {
    elements.authStatus.textContent = error.message;
  }
}

boot();
