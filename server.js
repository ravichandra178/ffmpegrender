const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { renderVideo } = require('./src/renderer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Multer setup - store uploads in OS temp dir, keep original extensions
const uploadDir = path.join(os.tmpdir(), 'ffmpegrender-uploads');
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${Date.now()}-${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50 MB per file
  }
});

// parse script as text field
const cpUpload = upload.fields([
  { name: 'images[]' },
  { name: 'audio', maxCount: 1 }
]);

app.post('/render', cpUpload, async (req, res) => {
  const requestId = uuidv4();
  console.log(`[${requestId}] Render request received`);

  try {
  const imagesField = req.files['images[]'] || req.files['images'] || [];
  const images = imagesField.map(f => f.path);
  const audio = req.files['audio'] && req.files['audio'][0] && req.files['audio'][0].path;
    const script = req.body.script || req.body.description || null;

    if (!images || images.length === 0) {
      return res.status(400).json({ error: 'At least one image is required (images[])' });
    }

    const outDir = path.join(uploadDir, 'outputs');
    await fs.mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, `${Date.now()}-${requestId}.mp4`);

    console.log(`[${requestId}] Starting ffmpeg render to ${outPath}`);
    const result = await renderVideo({ images, audio, script, outPath, requestId });

    // Log ffmpeg stderr when available
    if (result && result.stderr) {
      console.log(`[${requestId}] ffmpeg stderr:`, result.stderr.split('\n').slice(-20).join('\n'));
    }

    // Validate file size
    const stats = await fs.stat(outPath);
    console.log(`[${requestId}] Render finished, output size=${stats.size} bytes`);
    if (stats.size < 200 * 1024) {
      // cleanup
      await fs.unlink(outPath).catch(() => {});
      return res.status(500).json({ error: 'Rendered file too small, render likely failed' });
    }

    // Stream file
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment; filename="render.mp4"');

    const stream = require('fs').createReadStream(outPath);

    const cleanup = async () => {
      try {
        await Promise.all([
          ...images.map(p => fs.unlink(p).catch(()=>{})),
          audio ? fs.unlink(audio).catch(()=>{}) : Promise.resolve(),
          fs.unlink(outPath).catch(()=>{})
        ]);
        console.log(`[${requestId}] Cleaned up temporary files`);
      } catch (e) {
        console.error(`[${requestId}] Cleanup error`, e);
      }
    };

    // If client disconnects, destroy stream and cleanup
    const onClientClose = async () => {
      console.log(`[${requestId}] Client disconnected, aborting stream`);
      stream.destroy();
      await cleanup();
    };

    res.on('close', onClientClose);
    res.on('finish', async () => {
      // finished successfully
      res.removeListener('close', onClientClose);
      await cleanup();
    });

    stream.on('error', async (err) => {
      console.error(`[${requestId}] Stream error`, err);
      try { res.status(500).end(); } catch(e){}
      await cleanup();
    });

    stream.pipe(res);

  } catch (err) {
    console.error('Render error', err);
    // attempt to cleanup uploaded files
    try {
      await Promise.all([
        ...(images || []).map(p => fs.unlink(p).catch(()=>{})),
        audio ? fs.unlink(audio).catch(()=>{}) : Promise.resolve(),
      ]);
    } catch (e) {
      console.error('Cleanup after error failed', e);
    }
    return res.status(500).json({ error: 'Internal server error during rendering' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
