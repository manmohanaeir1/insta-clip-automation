#!/bin/bash

# Export Instagram cookies from Firefox to yt-dlp format
# Usage: ./export-instagram-cookies.sh

set -e

FIREFOX_PROFILE=$(ls -td ~/.mozilla/firefox/*.default-* 2>/dev/null | head -1)

if [ -z "$FIREFOX_PROFILE" ]; then
  FIREFOX_PROFILE=$(ls -td ~/.var/app/org.mozilla.firefox/.mozilla/firefox/*.default-* 2>/dev/null | head -1)
fi

if [ -z "$FIREFOX_PROFILE" ]; then
  echo "❌ Error: Firefox profile not found"
  echo "Make sure Firefox is installed and has been run at least once"
  exit 1
fi

echo "✅ Found Firefox profile: $FIREFOX_PROFILE"

# Close Firefox if running (to avoid database lock)
echo "Closing Firefox (if running)..."
killall firefox firefox.exe 2>/dev/null || true
sleep 2

COOKIES_DB="$FIREFOX_PROFILE/cookies.sqlite"

if [ ! -f "$COOKIES_DB" ]; then
  echo "❌ Error: cookies.sqlite not found"
  exit 1
fi

OUTPUT_FILE="backend/cookies.txt"

# Create yt-dlp format cookies file
# Format: domain, flag, path, secure, expiry, name, value
echo "Exporting Instagram/Facebook cookies to $OUTPUT_FILE..."

sqlite3 "$COOKIES_DB" << EOF > "$OUTPUT_FILE"
.mode list
.separator
SELECT
  host,
  (CASE WHEN host LIKE '.%' THEN 'TRUE' ELSE 'FALSE' END),
  '/',
  (CASE WHEN isSecure=1 THEN 'TRUE' ELSE 'FALSE' END),
  expiry,
  name,
  value
FROM moz_cookies
WHERE host LIKE '%instagram%' OR host LIKE '%facebook%'
ORDER BY host, name;
EOF

# Count exported cookies
COOKIE_COUNT=$(wc -l < "$OUTPUT_FILE")
echo "✅ Exported $COOKIE_COUNT cookies to $OUTPUT_FILE"

if [ $COOKIE_COUNT -eq 0 ]; then
  echo "⚠️  Warning: No Instagram/Facebook cookies found!"
  echo "   Make sure you:"
  echo "   1. Are logged into Instagram in Firefox"
  echo "   2. Have visited instagram.com recently"
  echo "   3. Run this script again after logging in"
else
  echo "✅ Ready to use! Restart the backend with:"
  echo "   docker compose down && docker compose up -d"
fi
