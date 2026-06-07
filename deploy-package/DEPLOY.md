# 공개 도메인 배포 가이드

`localhost`는 내 컴퓨터 전용 주소입니다. 모든 사람이 접속하려면 Node 서버를 공개 호스팅에 배포하고 도메인 DNS를 연결해야 합니다.

## 추천 구조

- 앱 서버: Render, Railway, Fly.io, 또는 VPS
- 실행 명령: `node server.js`
- 영구 데이터 경로: `DATA_DIR`
- 포트: 호스팅 서비스가 제공하는 `PORT` 환경 변수 사용

## Render 배포

1. 이 프로젝트를 GitHub 저장소에 올립니다.
2. Render에서 `New Web Service`를 만듭니다.
3. Root Directory를 `outputs`로 설정합니다.
4. Start Command를 `node server.js`로 설정합니다.
5. Disk를 추가하고 Mount Path를 `/var/data`로 설정합니다.
6. 환경 변수를 설정합니다.

```text
NODE_ENV=production
DATA_DIR=/var/data
FORCE_SECURE_COOKIES=true
```

## Docker 배포

```bash
docker build -t investor-reminiscence .
docker run -p 4173:4173 -v investor-data:/data investor-reminiscence
```

## 도메인 연결

1. 배포 서비스에서 Custom Domain을 추가합니다.
2. `www` 서브도메인은 보통 CNAME으로 연결합니다.
3. 루트 도메인은 서비스가 안내하는 A, ALIAS, 또는 ANAME 값을 사용합니다.
4. HTTPS 인증서가 발급될 때까지 기다립니다.

## 운영 주의사항

- `DATA_DIR/db.json`은 사용자와 글 데이터가 들어 있는 운영 데이터입니다.
- 서버의 영구 디스크가 사라지면 계정과 글도 사라집니다.
- 공개 운영 전 데모 계정 `admin@example.com` / `password123`은 삭제하거나 비밀번호를 바꾸세요.
