# Mohan Dogra Portfolio (React + Vite)

The React version of the portfolio, ready for [React Bits](https://reactbits.dev) components. The original single-file version (`mohan-dogra-portfolio.html`) is untouched and still lives one folder up.

## Run it

This folder may ship with a `node_modules` from the build check. It was installed on Linux, so on macOS/Windows delete it first, then install fresh:

```bash
cd react-portfolio
rm -rf node_modules            # only if a node_modules folder is present
npm install --legacy-peer-deps # the react-three packages use loose peer ranges
npm run dev                    # http://localhost:5173
```

Build for production:

```bash
npm run build
npm run preview
```

## What's inside

- `index.html` - Vite entry, loads the Google Fonts.
- `src/main.jsx` - React root (no StrictMode, on purpose - see the note in the file).
- `src/index.css` - the full design system and styles (identical to the HTML version).
- `src/App.jsx` - the whole page as JSX, plus one effect that sets up the persistent Three.js machine, the GSAP pinned sections (laptop + horizontal work), the scramble rotator, counters, reveals, and the anime.js headline + breathing dot grid. Everything cleans up on unmount.

## React Bits wired in

Six React Bits components are integrated (verbatim source in `src/components/`, MIT + Commons Clause):

- **Particles** - the ogl particle field is the hero background (violet/amber, reacts to cursor).
- **Lanyard** - hangs on the hero's right and drops from the top with gravity; drag it. Uses a WASM physics engine, so it runs only with `npm run dev` / `npm run build`, not in the single-file build. Card is a placeholder - swap its material for a photo texture (see the TODO in `src/components/Lanyard.jsx`).
- **InfiniteMenu** - a draggable sphere of image tiles in its own dark section (`#explore`). Swap the `menuItems` images in `src/App.jsx` for your own.
- **DecryptedText** - decrypts the "Measured in dollars and users." and "Voices from the work." headings on scroll.
- **SpotlightCard** - cursor-following spotlight on each work card.
- **ClickSpark** - click anywhere for a violet spark burst.

Run `npm run dev` to see all of them (Lanyard needs the dev server). `npm run build:single` makes a double-click single file that includes everything except Lanyard.

(You can ignore/delete any `dist/`, `single*/`, `buildcheck*/`, `bc_*/` folders; they are leftover build output.)

## Adding more React Bits components

1. Pick a component on reactbits.dev, choose a variant, and run its install command, e.g.:
   ```bash
   npx shadcn@latest add @react-bits/Particles-JS-CSS
   npm i ogl            # install whatever peer deps the component page lists
   ```
2. Import and drop it in. Look for the comments marked **REACT BITS SLOT** in `src/App.jsx` (the hero has one where the breathing dot grid can be swapped for a `<Particles />` or `<Aurora />` background).

Example - swap the hero dot grid for a React Bits background:

```jsx
import Particles from './components/Particles'
// ...
{/* REACT BITS SLOT */}
<Particles className="hero-bg" particleColors={['#6d3cff', '#e8820c']} />
```

Good candidates for this site: **Aurora / Silk / Threads / Particles** (hero background), **DecryptedText** (already mimicked by the rotator), **TiltedCard / SpotlightCard** (work cards), **InfiniteMenu** or **CircularGallery** (Beyond gallery), **ClickSpark / SplashCursor** (global cursor effect).

## Notes

- The Three.js machine is a fixed full-screen canvas behind the content; sections drive its state via `data-explode / data-zoom / data-spin / data-color / data-grid` attributes.
- Honors `prefers-reduced-motion`.
- If you later wrap the app in `<StrictMode>`, the setup effect already returns a full cleanup, but double-invoke in dev may briefly flash; leaving it off keeps dev identical to production.
