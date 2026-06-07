async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || "요청을 처리하지 못했습니다.");
  }
  return payload;
}

const form = document.querySelector("#registerForm");
const status = document.querySelector("#registerStatus");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "계정을 만들고 있습니다.";

  try {
    await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: document.querySelector("#registerName").value.trim(),
        email: document.querySelector("#registerEmail").value.trim(),
        password: document.querySelector("#registerPassword").value
      })
    });
    status.textContent = "가입 완료. 메인 페이지로 이동합니다.";
    window.location.href = "index.html#write";
  } catch (error) {
    status.textContent = error.message;
  }
});
