# Instagram Cookies Setup for Render Deployment

## Problem
Instagram now blocks unauthenticated scraping. yt-dlp needs cookies to extract posts.

## Solution: Two Approaches

### Approach A: Local Cookies File (Recommended for Development)

#### Step 1: Export Cookies Locally
On your machine (must have Firefox with Instagram logged in):

```bash
cd /path/to/insta-clip-automation
chmod +x export-instagram-cookies.sh
./export-instagram-cookies.sh
```

This creates `backend/cookies.txt` with your Instagram authentication.

#### Step 2: Build & Deploy Locally
```bash
docker compose down
docker compose up -d --build
```

#### Step 3: Test Locally
```bash
curl -X POST http://localhost:3001/extract \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.instagram.com/reel/DaI1RfqBX3v/"}'
```

#### Step 4: Deploy to Render
```bash
git add backend/cookies.txt
git commit -m "Add Instagram authentication cookies"
git push origin main
```

Render will build with cookies.txt included.

---

### Approach B: Environment Variable (More Secure)

If you don't want to commit cookies.txt to git:

#### Step 1: Export Cookies as Base64
```bash
./export-instagram-cookies.sh
base64 -w 0 backend/cookies.txt > /tmp/cookies_b64.txt
cat /tmp/cookies_b64.txt  # Copy this output
```

#### Step 2: Set Render Environment Variable
In Render dashboard:
- Go to your Web Service
- Settings → Environment
- Add: `INSTAGRAM_COOKIES_B64=<paste-base64-output>`

#### Step 3: Update Backend to Use Env Var
The backend code will automatically use `INSTAGRAM_COOKIES_B64` if set.

---

## Workflow for You

### For Development (Local Testing)
```bash
# On your machine
./export-instagram-cookies.sh
docker compose up -d --build
curl -X POST http://localhost:3001/extract \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.instagram.com/reel/DaI1RfqBX3v/"}'
```

### For Production (Render)

**Option 1: Commit cookies.txt**
```bash
git add backend/cookies.txt
git commit -m "Add Instagram auth"
git push
```
Render rebuilds automatically.

**Option 2: Use environment variable (more secure)**
- Export cookies locally to base64
- Add env var to Render settings
- No need to commit cookies to git

---

## Security Notes

- **Option 1 (commit)**: Anyone with repo access has your cookies
- **Option 2 (env var)**: Cookies in Render's secure settings only
- **Recommendation**: Use Option 2 for production, Option 1 for private testing

## Troubleshooting

**"No cookies found"**
- Make sure Firefox is closed
- Make sure you're logged into Instagram
- Run script again

**"Still getting empty media response"**
- Cookies may have expired (Instagram sessions last ~1 month)
- Re-export and redeploy

**Backend logs not showing cookie usage**
- Check: `docker compose logs backend | grep -i cookie`
- Should show: `Found cookies.txt - Instagram extraction will use authentication`
