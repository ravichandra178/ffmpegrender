const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs/promises');

// helper to run a command and capture output
function runCommand(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, opts);
    let stdout = '';
    let stderr = '';
    p.stdout && p.stdout.on('data', d => { stdout += d.toString(); });
    p.stderr && p.stderr.on('data', d => { stderr += d.toString(); });
    p.on('error', err => reject(err));
    p.on('close', code => {
      if (code === 0) return resolve({ stdout, stderr, code });
      const e = new Error(`Exit ${code}: ${stderr || stdout}`);
      e.code = code;
      e.stdout = stdout;
      e.stderr = stderr;
      reject(e);
    });
  });
}

// Parse script: expected simple format like lines with durations in seconds, one per image
function parseScript(script, count) {
  if (!script) return Array(count).fill(3);
  const lines = script.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const durations = [];
  for (let i = 0; i < count; i++) {
    const v = lines[i] || lines[lines.length - 1] || '3';
    const n = parseFloat(v);
    durations.push(Number.isFinite(n) && n > 0 ? n : 3);
  }
  return durations;
}

async function renderVideo({ images, audio, script, outPath, requestId }) {
  // create working dir
  const workDir = path.dirname(outPath);

  // Build input list for ffmpeg concat with image2pipe or filter_complex using -loop 1 per image
  const durations = parseScript(script, images.length);

  // Log start
  console.log(`[${requestId}] ffmpeg start - images=${images.length}, audio=${!!audio}`);

  // Build filter_complex and inputs
  // For each image: -loop 1 -t <duration> -i image
  const args = [];
  images.forEach(img => {
    // loop each image as a video input; duration will be set in the filter with trim
    args.push('-loop', '1', '-i', img);
  });

  if (audio) {
    args.push('-i', audio);
  }

  // Build filter to set duration per segment and concatenate
  // We'll set per input setpts and scale with pad to 1280x720
  const filters = [];
  const videoLabels = [];
  let idx = 0;
  images.forEach((img, i) => {
    const dur = durations[i];
    const label = `v${i}`;
    // scale to fit 1280x720 keeping aspect ratio, then pad to 1280x720, trim to duration and reset pts
    filters.push(`[${idx}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,trim=duration=${dur},setpts=PTS-STARTPTS[${label}]`);
    videoLabels.push(`[${label}]`);
    idx++;
  });

  // Concatenate
  const concatInputs = videoLabels.join('');
  filters.push(`${concatInputs}concat=n=${images.length}:v=1:a=0,format=yuv420p[vout]`);

  args.push('-filter_complex', filters.join(';'));

  // Map video
  args.push('-map', '[vout]');

  // If audio is present, map it and use -shortest
  if (audio) {
    args.push('-map', String(idx));
    args.push('-c:a', 'aac');
    args.push('-shortest');
  }

  // Video codec and flags
  args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-preset', 'veryfast');

  // Overwrite
  args.push('-y', outPath);

  try {
    const result = await runCommand('ffmpeg', args);
    console.log(`[${requestId}] ffmpeg completed`);
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (err) {
    console.error(`[${requestId}] ffmpeg failed:`, err.stderr || err.message);
    // Ensure no partial file remains
    await fs.unlink(outPath).catch(() => {});
    throw err;
  }
}

module.exports = { renderVideo };
