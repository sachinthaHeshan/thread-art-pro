# Thread Art

![Thread Art studio, with a circular crop, its black-and-white version, and the pin board](https://github.com/user-attachments/assets/f0c47bed-e75a-40c6-b9ca-8d116c9412a6)

A browser studio for planning circular string art from a photograph. Drop in a picture, crop it to a circle, choose how many pins and threads to use, and preview the pattern before you build it.

Photos stay on your machine. Cropping, grayscale conversion, and thread planning all run in the browser.

## How to use it

1. Drop a PNG, JPG, WEBP, or GIF, or choose a file.
2. Drag and zoom the photo inside the circle, then confirm the crop.
3. Compare the crop with its black-and-white version.
4. Enter a pin count (3 to 1,000) and a thread-line count (1 to 20,000).
5. Watch the board fill in. Numbered pins sit around the rim, and the step control shows the pattern one thread at a time.

Each new thread is chosen to darken the parts of the circle that still need ink, skipping pins that sit too close to the current one.

## Develop

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the local app |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run the library tests |

Built with Next.js, React, and TypeScript.
