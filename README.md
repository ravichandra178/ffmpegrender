# FFmpeg Render Backend

Simple production-ready Node.js backend that accepts multiple images, an optional audio file and an optional script, and returns a rendered MP4 using ffmpeg.

Features
- Express + multer file uploads
- ffmpeg rendering inside Docker (libx264, yuv420p, +faststart)
- Scales to 1280x720 with padding to avoid distortion
- Cleans up temp files and validates output size

How it works
- POST /render (multipart/form-data)
  - images[] (required, multiple)
  - audio (optional)
  - script (optional, newline-separated durations per image in seconds)

Response: returns the MP4 as an attachment stream.

Deploy to Render
1. Create a new Web Service on Render.
2. Connect your GitHub repo and set the build command to `docker build -t render-image .` (Render will detect the Dockerfile automatically).
3. Set the port to `3000`.

Local dev
Install dependencies and run:

```bash
npm install
node server.js
```

Notes
- This image installs ffmpeg via apt-get inside the Dockerfile. The base image is `node:20-slim`.
- The service validates that the final MP4 is at least 200KB to avoid sending corrupted files.
