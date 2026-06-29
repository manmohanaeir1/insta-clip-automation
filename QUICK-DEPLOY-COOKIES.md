# Quick Deploy Instagram Cookies via GitHub

## One-Time Setup

### Step 1: Export Cookies Locally
On your machine (must have Firefox with Instagram logged in):

```bash
chmod +x export-instagram-cookies.sh
./export-instagram-cookies.sh
```

Creates: `backend/cookies.txt`

### Step 2: Push to Master
```bash
git add backend/cookies.txt
git commit -m "Add Instagram authentication cookies"
git push origin master
```

### Step 3: Done!
Render auto-deploys. Backend now uses cookies for extraction.

---

## Verify It Works

Test on Render:
```bash
curl -X POST https://insta-clip-automation-dockerized.onrender.com/extract \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.instagram.com/reel/DaI1RfqBX3v/"}'
```

Should return video metadata + caption ✅

---

## If Cookies Expire (every ~30 days)
```bash
./export-instagram-cookies.sh
git add backend/cookies.txt
git commit -m "Refresh Instagram cookies"
git push origin master
```

That's it! Render redeploys automatically.
