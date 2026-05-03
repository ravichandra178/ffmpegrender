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

Deploy to Render (Docker)
1. Push this repository to GitHub.
2. In Render create a new Web Service and connect the repo.
3. Choose "Docker" as the environment. Render will use the `Dockerfile` in the repo which installs ffmpeg.
4. Optionally add the included `render.yaml` manifest when creating the service so Render uses the Docker environment and the configured PORT and health checks.
5. Deploy; Render will build the Docker image and run the container.

Troubleshooting "ffmpeg not found" errors
- If you see errors like "Failed to run ffmpeg (ffmpeg): NotFound: Failed to spawn 'ffmpeg': entity not found" this means the runtime environment doesn't have ffmpeg installed.
- On macOS for local testing: `brew install ffmpeg` or set `FFMPEG_BIN` to the path to your ffmpeg binary.
- On Render: ensure you're deploying with Docker (not a Run or Static environment). The included `Dockerfile` installs ffmpeg via apt so ffmpeg will be available inside the container. If you accidentally deploy without Docker (for example using a Deno/Node preset that doesn't use the Dockerfile), ffmpeg won't be available and you'll get the error above.


Local dev
Install dependencies and run:

```bash
npm install
node server.js
```

Notes
- This image installs ffmpeg via apt-get inside the Dockerfile. The base image is `node:20-slim`.
- The service validates that the final MP4 is at least 200KB to avoid sending corrupted files.
