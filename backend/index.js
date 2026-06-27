const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileP = promisify(execFile);
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const TRANSFER_DIR = path.join(os.tmpdir(), 'insta-clip-transfers');

if (!fs.existsSync(TRANSFER_DIR)) {
  fs.mkdirSync(TRANSFER_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());

/**
 * POST /extract
 * Extract Instagram media info using yt-dlp (legacy simple endpoint)
 * Body: { url: "https://www.instagram.com/reel/..." }
 * Returns: { success: true, videoUrl, thumbnailUrl, caption, mediaKind }
 */
app.post('/extract', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    console.log(`[EXTRACT] Processing: ${url}`);

    let output;
    try {
      const result = await execFileP('yt-dlp', ['-j', '--no-warnings', url], {
        maxBuffer: 20 * 1024 * 1024,
        timeout: 120000
      });
      output = result.stdout;
    } catch (error) {
      console.error(`[EXTRACT] yt-dlp error:`, error && error.message ? error.message : error);
      return res.status(400).json({
        success: false,
        error: 'Could not extract media. Post may be private or deleted.'
      });
    }

    const info = JSON.parse(output);
    const thumbnailUrl = info.thumbnail;
    const caption = info.description || '';
    const mediaKind = isVideoInfo(info) ? 'video' : 'image';
    const token = randomUUID();
    const transferBase = path.join(TRANSFER_DIR, token);
    const transferTemplate = `${transferBase}.%(ext)s`;
    let mediaUrl;
    let ext = 'jpg';
    let filesize = null;

    if (mediaKind === 'video') {
      console.log(`[EXTRACT] Downloading merged transfer file: ${transferTemplate}`);

      try {
        await execFileP(
          'yt-dlp',
          [
            '-f',
            'bv*+ba/b[ext=mp4]/best',
            '--merge-output-format',
            'mp4',
            '-o',
            transferTemplate,
            '--no-warnings',
            url
          ],
          {
            maxBuffer: 20 * 1024 * 1024,
            timeout: 180000
          }
        );
      } catch (error) {
        console.error(`[EXTRACT] Transfer download failed:`, error && error.message ? error.message : error);
        return res.status(400).json({
          success: false,
          error: 'Could not download merged media. The post may be private or deleted.'
        });
      }

      const transferFile = await findMergedTransferFile(TRANSFER_DIR, token);

      if (!transferFile) {
        return res.status(400).json({
          success: false,
          error: 'Could not create merged transfer file.'
        });
      }

      mediaUrl = `${getPublicBaseUrl(req)}/transfer/${token}`;
      ext = 'mp4';
      filesize = fs.statSync(transferFile).size;
      console.log(`[EXTRACT] Success - ${mediaKind} -> ${transferFile}`);
    } else {
      const imageUrl = selectBestImageUrl(info);
      if (!imageUrl) {
        return res.status(400).json({
          success: false,
          error: 'Could not find image URL'
        });
      }

      mediaUrl = imageUrl;
      ext = getImageExt(imageUrl);
      filesize = getBestFileSize(info);
      console.log(`[EXTRACT] Success - ${mediaKind} -> ${mediaUrl}`);
    }

    res.json({
      success: true,
      videoUrl: mediaUrl,
      mediaUrl,
      thumbnailUrl,
      caption,
      mediaKind,
      title: info.title || 'Instagram Clip',
      ext,
      filesize,
      httpHeaders: {}
    });
  } catch (error) {
    console.error('[EXTRACT] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error: ' + error.message
    });
  }
});

app.get('/transfer/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const transferFile = await findMergedTransferFile(TRANSFER_DIR, token);

    if (!transferFile) {
      return res.status(404).json({ success: false, error: 'Transfer file not found' });
    }

    console.log(`[TRANSFER] Serving merged file: ${transferFile}`);
    res.download(transferFile, path.basename(transferFile), async (err) => {
      if (err) {
        console.error('[TRANSFER] Download error:', err && err.message ? err.message : err);
      }

      try {
        if (fs.existsSync(transferFile)) {
          fs.unlinkSync(transferFile);
        }
      } catch (cleanupError) {
        console.error('[TRANSFER] Cleanup error:', cleanupError && cleanupError.message ? cleanupError.message : cleanupError);
      }
    });
  } catch (error) {
    console.error('[TRANSFER] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error: ' + error.message
    });
  }
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[SERVER] Insta-Clip backend running on http://localhost:${PORT}`);
  for (const address of getLanAddresses()) {
    console.log(`[SERVER] LAN backend URL: http://${address}:${PORT}`);
  }
  console.log(`[SERVER] POST /extract          - Extract metadata only`);
  console.log(`[SERVER] GET  /transfer/:token   - Serve merged temporary file`);
  console.log(`[SERVER] GET  /health           - Health check`);
});

function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }

  return addresses;
}

function findMergedTransferFile(dir, token) {
  const exact = path.join(dir, `${token}.mp4`);

  if (fs.existsSync(exact)) {
    return exact;
  }

  const candidates = fs.readdirSync(dir).filter((file) => file.startsWith(token + '.'));
  if (!candidates.length) {
    return null;
  }

  return path.join(dir, candidates.sort()[0]);
}

function getPublicBaseUrl(req) {
  const host = req.get('host');
  return `http://${host}`;
}

function isVideoInfo(info) {
  if (info.vcodec && info.vcodec !== 'none') {
    return true;
  }

  return Array.isArray(info.formats) && info.formats.some((format) => format.vcodec && format.vcodec !== 'none');
}

function selectBestImageUrl(info) {
  const formats = Array.isArray(info.formats) ? info.formats : [];
  const imageFormats = formats.filter((format) => format.url && (!format.vcodec || format.vcodec === 'none'));

  if (imageFormats.length) {
    return imageFormats
      .slice()
      .sort((a, b) => {
        const aHeight = a.height || 0;
        const bHeight = b.height || 0;
        const aTbr = a.tbr || 0;
        const bTbr = b.tbr || 0;
        return bHeight - aHeight || bTbr - aTbr;
      })[0].url;
  }

  return info.url || info.thumbnail || null;
}

function getImageExt(url) {
  if (/\.(png)(?:\?|$)/i.test(url)) {
    return 'png';
  }

  if (/\.(webp)(?:\?|$)/i.test(url)) {
    return 'webp';
  }

  return 'jpg';
}

function getBestFileSize(info) {
  if (typeof info.filesize === 'number') {
    return info.filesize;
  }

  if (typeof info.filesize_approx === 'number') {
    return info.filesize_approx;
  }

  return null;
}
