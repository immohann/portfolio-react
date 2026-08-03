import { useEffect, useRef, lazy, Suspense } from 'react'
import * as THREE from 'three'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { animate, stagger } from 'animejs'
import ClickSpark from './components/ClickSpark'
import SpotlightCard from './components/SpotlightCard'
import Particles from './components/Particles'
import DecryptedText from './components/DecryptedText'
import InfiniteMenu from './components/InfiniteMenu'

gsap.registerPlugin(ScrollTrigger)

// Lanyard uses a WASM physics engine that cannot be inlined into a single-file
// build, so it is only included in the normal dev/build (run with `npm run dev`).
// In the `single` build mode it is skipped so that build stays double-clickable.
const WITH_LANYARD = import.meta.env.MODE !== 'single'
const Lanyard = WITH_LANYARD ? lazy(() => import('./components/Lanyard.jsx')) : null

// React Bits InfiniteMenu items.
// These are COLORED placeholders (picsum sends the CORS headers WebGL needs).
// To use your own Fuji shots from Chicago: drop them in `public/photos/` and set
// image: '/photos/chicago.jpg' etc. Local files are same-origin, so they just work.
const menuItems = [
  { image: 'https://picsum.photos/seed/chicago-skyline/600/600', link: '#beyond', title: 'Chicago', description: 'The skyline' },
  { image: 'https://picsum.photos/seed/lakefront/600/600', link: '#beyond', title: 'Lakefront', description: 'By the water' },
  { image: 'https://picsum.photos/seed/city-streets/600/600', link: '#beyond', title: 'Streets', description: 'City frames' },
  { image: 'https://picsum.photos/seed/volleyball-court/600/600', link: '#beyond', title: 'Volleyball', description: 'Game day' },
  { image: 'https://picsum.photos/seed/forest-trail/600/600', link: '#beyond', title: 'Nature', description: 'Off the trail' },
  { image: 'https://picsum.photos/seed/dusk-skyline/600/600', link: '#beyond', title: 'Dusk', description: 'Golden hour' }
]

/*
  This is a faithful React/Vite port of the single-file portfolio.
  The markup lives in JSX below; all imperative behaviour (the persistent
  Three.js machine, GSAP pinned sections, counters, reveals, the scramble
  rotator, and the anime.js headline + breathing dot grid) is set up once in
  the effect at the bottom, with full cleanup.

  ---- ADDING REACT BITS (reactbits.dev) ----
  1) Install a component from its page, e.g.
       npx shadcn@latest add @react-bits/Particles-JS-CSS
       npm i ogl               (install whatever deps the component lists)
  2) Import it and drop it in. Good spots are marked "REACT BITS SLOT" below.
     Example hero background:
       import Particles from './components/Particles'
       ... <div id="dotgrid" ...> can be replaced by <Particles ... />
*/

export default function App() {
  const rootRef = useRef(null)

  useEffect(() => {
    const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches
    const root = document.documentElement
    const cleanups = []

    /* nav shell + dot-rail progress */
    const navShell = document.querySelector('.nav-shell')
    const drFill = document.getElementById('drFill')
    const dots = [...document.querySelectorAll('.dr-dot')]
    const onScroll = () => {
      if (navShell) navShell.classList.toggle('scrolled', window.scrollY > 40)
      const h = document.documentElement
      const p = h.scrollTop / ((h.scrollHeight - h.clientHeight) || 1)
      if (drFill) drFill.style.height = (Math.max(0, Math.min(1, p)) * 100) + '%'
    }
    window.addEventListener('scroll', onScroll)
    cleanups.push(() => window.removeEventListener('scroll', onScroll))

    /* active dot */
    const ids = ['hero', 'skills', 'work', 'beyond', 'references', 'contact']
    const dotObs = []
    ids.forEach((id, i) => {
      const s = document.getElementById(id)
      if (!s) return
      const o = new IntersectionObserver((es) => es.forEach((e) => {
        if (e.isIntersecting) dots.forEach((d, k) => d.classList.toggle('active', k === i))
      }), { threshold: 0.5 })
      o.observe(s); dotObs.push(o)
    })
    cleanups.push(() => dotObs.forEach((o) => o.disconnect()))

    /* reveals */
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) }
    }), { threshold: 0.2 })
    document.querySelectorAll('.reveal').forEach((el) => io.observe(el))
    cleanups.push(() => io.disconnect())

    /* scramble rotator */
    const rot = document.getElementById('rotator')
    if (rot && !REDUCED) {
      const words = ['Data Scientist', 'GenAI Engineer', 'LLM Researcher', 'Curious', 'Builder at heart']
      const pool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#/_'
      let wi = 0
      const scramble = (t) => {
        clearInterval(rot._it); let it = 0
        rot._it = setInterval(() => {
          rot.textContent = t.split('').map((c, i) => c === ' ' ? ' ' : (i < it ? t[i] : pool[Math.floor(Math.random() * pool.length)])).join('')
          if (it >= t.length) { clearInterval(rot._it); rot.textContent = t }
          it += 1 / 2
        }, 38)
      }
      scramble(words[0])
      const cyc = setInterval(() => { wi = (wi + 1) % words.length; scramble(words[wi]) }, 2600)
      cleanups.push(() => { clearInterval(cyc); clearInterval(rot._it) })
    }

    /* counters */
    const cio = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return
      const el = e.target; cio.unobserve(el)
      const to = parseFloat(el.dataset.to), dec = parseInt(el.dataset.dec || '0'), pre = el.dataset.prefix || ''
      if (REDUCED) { el.textContent = pre + to.toFixed(dec); return }
      const t0 = performance.now(), dur = 1500
      const tick = (n) => {
        const p = Math.min(1, (n - t0) / dur)
        el.textContent = pre + (to * (1 - Math.pow(1 - p, 2))).toFixed(dec)
        if (p < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }), { threshold: 0.6 })
    document.querySelectorAll('.counter').forEach((el) => cio.observe(el))
    cleanups.push(() => cio.disconnect())

    /* ---- MACHINE (persistent Three.js) ---- */
    cleanups.push(setupMachine(REDUCED))

    /* ---- GSAP pins (laptop showcase + horizontal work) ---- */
    const ctx = gsap.context(() => {
      const caps = [...document.querySelectorAll('.cap')]
      const lpanels = [...document.querySelectorAll('.lpanel')]
      const setA = (c, p) => {
        caps.forEach((x, i) => x.classList.toggle('active', i === c))
        lpanels.forEach((x, i) => x.classList.toggle('active', i === p))
      }
      const hint = document.querySelector('[data-hint]')
      setA(0, 0)
      if (!REDUCED) {
        ScrollTrigger.create({
          trigger: '.showcase-sticky', start: 'top top', end: '+=2400', pin: true, scrub: 0.5,
          onUpdate: (s) => {
            const p = s.progress, open = Math.min(1, p / 0.30)
            root.style.setProperty('--open', open.toFixed(3))
            root.style.setProperty('--sc', (0.74 + 0.24 * Math.min(1, p / 0.30)).toFixed(3))
            let ci = 0, pi = 0
            if (p < 0.30) { ci = 0; pi = 0 } else if (p < 0.58) { ci = 1; pi = 0 } else if (p < 0.82) { ci = 2; pi = 1 } else { ci = 3; pi = 2 }
            setA(ci, pi); if (hint) hint.style.opacity = p > 0.9 ? 0 : 0.7
          }
        })
      } else { root.style.setProperty('--open', '1'); setA(1, 0) }
      const track = document.querySelector('.work-track')
      const bar = document.querySelector('.work-progress-bar')
      if (track && window.innerWidth > 820) {
        const dist = () => track.scrollWidth - window.innerWidth
        gsap.to(track, {
          x: () => -dist(), ease: 'none',
          scrollTrigger: { trigger: '.work-pin', start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 1, invalidateOnRefresh: true, onUpdate: (s) => { if (bar) bar.style.width = (s.progress * 100) + '%' } }
        })
      }
    }, rootRef)
    const refresh = () => ScrollTrigger.refresh()
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh); else setTimeout(refresh, 300)
    cleanups.push(() => ctx.revert())

    /* ---- anime.js: headline build + breathing dot grid + magnetic ---- */
    const q = document.querySelector('[data-quote]')
    if (q && !q.dataset.split) {
      q.dataset.split = '1'
      const out = []
      q.childNodes.forEach((n) => {
        if (n.nodeType === 3) {
          n.textContent.split(/(\s+)/).forEach((tok) => {
            if (!tok) return
            if (/^\s+$/.test(tok)) { out.push(document.createTextNode(' ')) }
            else {
              const word = document.createElement('span')
              word.style.display = 'inline-block'; word.style.whiteSpace = 'nowrap'
              tok.split('').forEach((ch) => { const s = document.createElement('span'); s.className = 'char'; s.textContent = ch; word.appendChild(s) })
              out.push(word)
            }
          })
        } else { n.classList.add('char'); out.push(n) }
      })
      q.innerHTML = ''; out.forEach((f) => q.appendChild(f))
      if (!REDUCED) animate('.hero .quote .char', { opacity: [0, 1], translateY: ['0.6em', '0em'], duration: 800, delay: stagger(20), ease: 'out(3)' })
    }
    if (!REDUCED) {
      const dg = document.getElementById('dotgrid')
      if (dg && !dg.childElementCount) {
        const cell = 54
        const cols = Math.max(6, Math.floor(window.innerWidth / cell))
        const rows = Math.max(4, Math.floor(window.innerHeight / cell))
        dg.style.gridTemplateColumns = `repeat(${cols},1fr)`
        dg.style.gridTemplateRows = `repeat(${rows},1fr)`
        const f = document.createDocumentFragment()
        for (let i = 0; i < cols * rows; i++) { const d = document.createElement('span'); d.className = 'dot'; f.appendChild(d) }
        dg.appendChild(f)
        animate('.dot', { opacity: [0.06, 0.34], scale: [1, 1.7], delay: stagger(90, { grid: [cols, rows], from: 'center' }), loop: true, alternate: true, ease: 'inOut(2)', duration: 1700 })
      }
      if (matchMedia('(pointer:fine)').matches) {
        const m = document.getElementById('magnetic')
        if (m) {
          const mm = (e) => { const r = m.getBoundingClientRect(); animate(m, { translateX: (e.clientX - r.left - r.width / 2) * 0.4, translateY: (e.clientY - r.top - r.height / 2) * 0.5, duration: 400, ease: 'out(3)' }) }
          const ml = () => animate(m, { translateX: 0, translateY: 0, duration: 600, ease: 'outElastic(1,.4)' })
          m.addEventListener('pointermove', mm); m.addEventListener('pointerleave', ml)
          cleanups.push(() => { m.removeEventListener('pointermove', mm); m.removeEventListener('pointerleave', ml) })
        }
      }
    }

    return () => cleanups.forEach((fn) => { try { fn && fn() } catch (e) { /* noop */ } })
  }, [])

  return (
    <div ref={rootRef}>
      <canvas id="machine-canvas" aria-hidden="true"></canvas>
      <div className="machine-grid" id="machineGrid" aria-hidden="true"></div>

      {/* React Bits: ClickSpark wraps the whole page for a click burst effect */}
      <ClickSpark sparkColor="#6d3cff" sparkCount={10} sparkRadius={20} sparkSize={11} duration={500}>

      <div className="nav-shell">
        <nav>
          <a className="brand" href="#hero">Mohan<span>.</span>Dogra</a>
          <a className="nav-cta" href="#contact">Get in touch</a>
        </nav>
      </div>

      <nav className="dotrail" aria-hidden="true">
        <span className="dr-track"><span className="dr-fill" id="drFill"></span></span>
        <a className="dr-dot" href="#hero" data-l="Start"></a>
        <a className="dr-dot" href="#skills" data-l="Skills"></a>
        <a className="dr-dot" href="#work" data-l="Work"></a>
        <a className="dr-dot" href="#beyond" data-l="Beyond"></a>
        <a className="dr-dot" href="#references" data-l="Voices"></a>
        <a className="dr-dot" href="#contact" data-l="Contact"></a>
      </nav>

      {/* HERO */}
      <section className="chapter hero" id="hero" data-explode="0.14" data-zoom="16" data-spin="0.12" data-color="1" data-grid="0">
        {/* React Bits: Particles background (particle field / topography) */}
        <Particles
          className="hero-particles"
          particleColors={['#6d3cff', '#9333ea', '#e8820c']}
          particleCount={260}
          particleSpread={11}
          speed={0.12}
          particleBaseSize={90}
          sizeRandomness={1}
          alphaParticles
          moveParticlesOnHover
          particleHoverFactor={1.5}
        />
        {/* React Bits: Lanyard hangs on the right and drops with gravity (npm run dev only) */}
        {WITH_LANYARD && (
          <Suspense fallback={null}>
            <div className="hero-lanyard">
              <Lanyard position={[0, 0, 18]} gravity={[0, -40, 0]} />
            </div>
          </Suspense>
        )}
        <div className="inner">
          <div className="panel">
            <span className="eyebrow">Mohan Dogra</span>
            <div className="rotator-line"><span className="mono">currently:</span><span className="rotator mono" id="rotator">GenAI Engineer</span></div>
            <h1 className="quote"><span data-quote>{'“'}You miss 100% of the <span className="grad">shots you don{'’'}t take.{'”'}</span></span></h1>
            <div className="attrib">Wayne Gretzky</div>
            <p className="hero-sub">I live in the <strong>last mile</strong> of AI, where a model stops being a demo and starts earning trust.</p>
            <div className="cta-row">
              <a className="btn btn-primary" id="magnetic" href="#work">See the work</a>
              <a className="btn btn-ghost" href="#contact">Say hello</a>
            </div>
          </div>
        </div>
        <div className="scroll-cue"><span>Scroll</span><span className="bar"></span></div>
      </section>

      {/* LAPTOP SHOWCASE */}
      <section className="showcase" id="showcase" data-explode="0.3" data-zoom="15" data-spin="0.3" data-color="1" data-grid="0">
        <div className="showcase-sticky">
          <div className="chapters-cap">
            <div className="cap" data-cap="0"><span className="eyebrow">The product is me</span><p>Scroll to open the machine.</p></div>
            <div className="cap" data-cap="1"><span className="eyebrow">What I build</span><h2>Production LLM systems.</h2></div>
            <div className="cap" data-cap="2"><span className="eyebrow">What it returned</span><h2>Real dollars, real users.</h2></div>
            <div className="cap" data-cap="3"><span className="eyebrow">Where I am now</span><h2>Shipping and open to more.</h2></div>
          </div>
          <div className="stage">
            <div className="macbook">
              <div className="lid">
                <div className="notch"></div>
                <div className="display">
                  <div className="dtop"><i className="r"></i><i className="y"></i><i className="g"></i><span className="url mono">mohan.ai, impact console</span></div>
                  <div className="panels">
                    <div className="lpanel" data-p="0">
                      <div className="pe">What I build</div><h3>Production <span>LLM systems.</span></h3>
                      <div className="dtiles"><div className="dtile"><b>RAG</b><small>grounded, low-hallucination retrieval</small></div><div className="dtile"><b>Agents</b><small>planner-executor orchestration</small></div><div className="dtile"><b>Eval</b><small>RAGAS + guardrails in CI</small></div></div>
                      <div className="drow"><span className="chip">GPT-4.1 / GPT-4o</span><span className="chip">LangChain</span><span className="chip">Vector DBs</span><span className="chip">BigQuery</span></div>
                    </div>
                    <div className="lpanel" data-p="1">
                      <div className="pe">Impact shipped</div><h3>Outcomes, <span>not output.</span></h3>
                      <div className="dtiles"><div className="dtile"><b>$1.2M</b><small>saved / yr</small></div><div className="dtile"><b>~$2M</b><small>generated / yr</small></div><div className="dtile"><b>10k+</b><small>users served</small></div></div>
                      <div className="drow"><span className="chip">60% faster resolution</span><span className="chip">+20% Quality of Hire</span></div>
                    </div>
                    <div className="lpanel" data-p="2">
                      <div className="pe">Right now</div><h3>Data Scientist <span>at Walmart.</span></h3>
                      <div className="dtiles"><div className="dtile"><b>2025</b><small>Innovation Award</small></div><div className="dtile"><b>7+</b><small>publications</small></div><div className="dtile"><b>2+ yrs</b><small>in production</small></div></div>
                      <div className="drow"><span className="chip live">Open to opportunities</span></div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="base"></div>
            </div>
          </div>
          <div className="showcase-hint" data-hint>Keep scrolling</div>
        </div>
      </section>

      {/* SKILLS */}
      <section className="chapter" id="skills" data-explode="0.5" data-zoom="12" data-spin="0.08" data-color="0" data-grid="1">
        <div className="inner">
          <div className="panel wide reveal">
            <span className="eyebrow">What I do best</span>
            <h2 style={{ fontSize: 'clamp(1.6rem,3.4vw,2.4rem)', fontWeight: 600, marginTop: 12 }}>
              <DecryptedText text="Signature capabilities." animateOn="view" sequential speed={35} maxIterations={16} />
            </h2>
            <div className="skills-list">
              <div className="skill"><div className="sk-h"><b>RAG architecture</b><span>01</span></div><p>Source-verified retrieval over enterprise data: chunking strategy, hybrid search, reranking, and guardrails that keep hallucination near zero.</p></div>
              <div className="skill"><div className="sk-h"><b>Multi-agent orchestration</b><span>02</span></div><p>Planner-executor systems that reason in steps, with ReAct and deterministic executors evaluated component by component.</p></div>
              <div className="skill"><div className="sk-h"><b>LLM evaluation and guardrails</b><span>03</span></div><p>RAGAS-based eval harnesses and quality gates wired into CI, so regressions are caught long before a user ever sees them.</p></div>
              <div className="skill"><div className="sk-h"><b>LLMOps at scale</b><span>04</span></div><p>Shipping and scaling on GCP and Azure: containers, Airflow, CI/CD, and the observability that keeps systems alive in production.</p></div>
            </div>
            <div className="skill-tech">Python · PyTorch · TensorFlow · LangChain · BigQuery · PySpark · Airflow · Docker · Kubernetes</div>
          </div>
        </div>
      </section>

      {/* WORK */}
      <section id="work" data-explode="0.3" data-zoom="15" data-spin="0.45" data-color="1" data-grid="0">
        <div className="work-pin">
          <div className="work-track">
            <div className="work-head">
              <span className="eyebrow">Selected work</span>
              <h2>Systems that<br />shipped and scaled.</h2>
              <p>Five builds where GenAI met a real profit and loss statement.</p>
            </div>
            <SpotlightCard className="work-card" spotlightColor="rgba(109,60,255,0.22)"><span className="idx">01, WALMART</span><h3>GenAI Turnover Insights</h3><div className="role">GPT-4.1, BigQuery, 500+ People Partners</div><p>Turns raw workforce data into clear, ranked actions for store leaders. I architected the ingestion, retrieval, and prompt orchestration end to end, then proved the lift with People Partners in a controlled A/B rollout before scaling it company-wide.</p><div className="metric"><span>$1.2M</span> saved, Innovation Award 2025</div></SpotlightCard>
            <SpotlightCard className="work-card" spotlightColor="rgba(109,60,255,0.22)"><span className="idx">02, CCC INTELLIGENT SOLUTIONS</span><h3>Automotive AI Assistant</h3><div className="role">GPT-NeoX, RAG, BERT</div><p>A GenAI assistant that answers from thousands of pages of car manuals in seconds. Built the retrieval and grounding layer, tuned it for accuracy under real support load, and shipped it into production where it became a genuine revenue line.</p><div className="metric"><span>~$2M</span> annual revenue</div></SpotlightCard>
            <SpotlightCard className="work-card" spotlightColor="rgba(109,60,255,0.22)"><span className="idx">03, WALMART</span><h3>Topic Modeling Service</h3><div className="role">GPT-4o, ADA-002, k-Means</div><p>Reads open-ended customer feedback at scale, clusters it into themes, and drafts resolution recommendations. It collapsed a slow manual triage loop into an automated pipeline that routes issues where they need to go.</p><div className="metric"><span>60%</span> faster resolution</div></SpotlightCard>
            <SpotlightCard className="work-card" spotlightColor="rgba(109,60,255,0.22)"><span className="idx">04, WALMART</span><h3>Skills Inference Engine</h3><div className="role">Lightcast API, LLM semantic matching</div><p>Infers the real skills behind a candidate and a role, then matches them semantically rather than by keyword. Fusing external labor-market intelligence with LLM matching measurably raised the quality of who got hired.</p><div className="metric"><span>+20%</span> Quality of Hire</div></SpotlightCard>
            <SpotlightCard className="work-card" spotlightColor="rgba(109,60,255,0.22)"><span className="idx">05, FLAGSHIP PROJECT</span><h3>AI Website Agent</h3><div className="role">React, Tailwind, LangChain, GCP CI/CD</div><p>My flagship side project: an agent that writes the copy, picks the layout, and assembles a working small-business site on its own. LangChain orchestration plus a React and Tailwind template system, deployed with CI/CD, took a five-hour job down to minutes.</p><div className="metric"><span>5 hrs to under 10 min</span> build time</div></SpotlightCard>
            <div style={{ flex: '0 0 4vw' }}></div>
          </div>
          <div className="work-progress"><div className="work-progress-bar"></div></div>
        </div>
      </section>

      {/* BEYOND THE TERMINAL */}
      <section className="chapter" id="beyond" data-explode="0.85" data-zoom="16" data-spin="0.22" data-color="1" data-grid="0">
        <div className="inner">
          <div className="panel wide reveal">
            <span className="eyebrow">Beyond the terminal</span>
            <p className="big-statement" style={{ marginBottom: 6 }}>The curiosity is the whole point.</p>
            <p style={{ color: 'var(--muted)', maxWidth: 620 }}>The same instinct that chases a better eval metric sends me up a trail with a camera. Here is the human behind the commits.</p>
            <div className="gallery">
              <div className="tile tile-tall"><span className="drop-hint">Your photo</span><div className="ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="12" cy="12" r="3.2" /></svg></div><div className="tgroup"><div className="cap-txt">Photography</div><div className="sub">Chasing light and frames</div></div></div>
              <div className="tile tile-wide"><span className="drop-hint">Your photo</span><div className="ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 18l6-8 4 5 3-4 5 7z" /></svg></div><div className="tgroup"><div className="cap-txt">Nature and the outdoors</div><div className="sub">Where I reset</div></div></div>
              <div className="tile"><span className="drop-hint">Your photo</span><div className="ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /><path d="M12 3a15 15 0 000 18M3.5 9h17M3.5 15h17" /></svg></div><div className="tgroup"><div className="cap-txt">Volleyball</div><div className="sub">Team player</div></div></div>
              <div className="tile"><span className="drop-hint">Your photo</span><div className="ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 16l20-8-9 13-2-5z" /></svg></div><div className="tgroup"><div className="cap-txt">Travel</div><div className="sub">New context</div></div></div>
              <div className="tile tile-wide"><span className="drop-hint">Your photo</span><div className="ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9h18M8 5v14" /></svg></div><div className="tgroup"><div className="cap-txt">Movies</div><div className="sub">Story structure nerd</div></div></div>
              <div className="tile"><div className="ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12c1 1 1 2 1 3h6c0-1 0-2 1-3a7 7 0 00-4-12z" /></svg></div><div className="tgroup"><div className="cap-txt">Building things</div><div className="sub">Entrepreneur at heart</div></div></div>
            </div>
          </div>
        </div>
      </section>

      {/* React Bits: InfiniteMenu - draggable sphere of image tiles */}
      <section className="menu-section" id="explore" data-explode="0.7" data-zoom="14" data-spin="0.35" data-color="1" data-grid="0">
        <InfiniteMenu items={menuItems} />
      </section>

      {/* REFERENCES */}
      <section className="chapter" id="references" data-explode="0.6" data-zoom="13" data-spin="0.15" data-color="1" data-grid="0">
        <div className="inner">
          <div className="panel wide reveal">
            <span className="eyebrow">What people say</span>
            <h2 style={{ fontSize: 'clamp(1.6rem,3.4vw,2.4rem)', fontWeight: 600, marginTop: 12 }}>
              <DecryptedText text="Voices from the work." animateOn="view" sequential speed={40} maxIterations={16} />
            </h2>
            <div className="testi-grid">
              <div className="testi"><span className="slot">Add quote</span><div className="qm">{'“'}</div><p>Drop a recommendation from a manager or teammate here. A line or two about how you work and what you shipped goes a long way.</p><div className="who"><div className="av"></div><div><div className="nm">Your reference</div><div className="rl">Role, Company</div></div></div></div>
              <div className="testi"><span className="slot">Add quote</span><div className="qm">{'“'}</div><p>Pull a strong line straight from a LinkedIn recommendation. Focus on impact, reliability, and collaboration.</p><div className="who"><div className="av"></div><div><div className="nm">Your reference</div><div className="rl">Role, Company</div></div></div></div>
              <div className="testi"><span className="slot">Add quote</span><div className="qm">{'“'}</div><p>One more slot for a peer or research collaborator. Keep it specific and short so it reads as genuine.</p><div className="who"><div className="av"></div><div><div className="nm">Your reference</div><div className="rl">Role, Company</div></div></div></div>
            </div>
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section className="chapter contact" id="contact" data-explode="0.0" data-zoom="14.5" data-spin="0.12" data-color="1" data-grid="0">
        <div className="inner">
          <div className="panel reveal">
            <span className="avail"><span className="pulse"></span>Open to opportunities</span>
            <p className="quote-lg">If it scares you a little, it is probably <em>worth building.</em> Let us build it.</p>
            <div className="links">
              <a className="btn btn-primary" href="mailto:dogramanmohan01@gmail.com">dogramanmohan01@gmail.com</a>
              <a className="btn btn-ghost" href="https://linkedin.com/in/mohan-dogra" target="_blank" rel="noopener">LinkedIn</a>
              <a className="btn btn-ghost" href="https://github.com/immohann" target="_blank" rel="noopener">GitHub</a>
            </div>
          </div>
        </div>
      </section>
      <div className="foot">2026 Manmohan Dogra, Bentonville AR. Built as a living thing, not a resume.</div>

      </ClickSpark>
    </div>
  )
}

/* ---- persistent Three.js machine; returns a cleanup function ---- */
function setupMachine(REDUCED) {
  const canvas = document.getElementById('machine-canvas')
  const grid = document.getElementById('machineGrid')
  if (!canvas) return () => {}
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100); camera.position.set(0, 0, 16)
  const group = new THREE.Group(); group.rotation.x = 0.32; scene.add(group)
  const bwCol = new THREE.Color(0x2b2b2b), accCol = new THREE.Color(0x6d3cff)
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x2b2b2b, transparent: true, opacity: 0.9 })
  const mkFill = () => new THREE.MeshBasicMaterial({ color: 0xeae8e4, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
  const parts = []
  const addPart = (geo, z) => {
    const g = new THREE.Group()
    g.add(new THREE.Mesh(geo, mkFill()))
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 18), edgeMat))
    g.position.z = z; group.add(g); parts.push({ g, z })
  }
  const cyl = (r, h, rs) => { const gm = new THREE.CylinderGeometry(r, r, h, rs || 54); gm.rotateX(Math.PI / 2); return gm }
  const gearGeo = (teeth, rOut, rIn, depth) => {
    const s = new THREE.Shape(), step = Math.PI / teeth, pt = (a, r) => [Math.cos(a) * r, Math.sin(a) * r]
    for (let i = 0; i < teeth; i++) {
      const a = i * 2 * step
      if (i === 0) s.moveTo(...pt(a, rIn)); else s.lineTo(...pt(a, rIn))
      s.lineTo(...pt(a + step * 0.28, rOut)); s.lineTo(...pt(a + step * 0.72, rOut)); s.lineTo(...pt(a + step, rIn))
    }
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, steps: 1 }); g.translate(0, 0, -depth / 2); return g
  }
  addPart(new THREE.TorusGeometry(2.05, 0.32, 14, 54), 4.3)
  addPart(cyl(2.0, 0.55), 3.85); addPart(cyl(1.95, 0.9, 72), 3.0)
  addPart(gearGeo(18, 1.85, 1.45, 0.5), 2.05)
  addPart(new THREE.TorusGeometry(1.6, 0.22, 12, 48), 1.3); addPart(cyl(1.7, 1.5), 0.1)
  for (let i = 0; i < 5; i++) addPart(cyl(1.75, 0.06), -1.0 - i * 0.17)
  addPart(gearGeo(14, 1.7, 1.35, 0.45), -2.2); addPart(cyl(1.5, 0.7), -3.1)
  addPart(new THREE.TorusGeometry(1.55, 0.3, 14, 54), -3.65)
  const target = { explode: 0.14, zoom: 16, spin: 0.12, color: 1, grid: 0 }
  const cur = Object.assign({}, target)
  let spinY = 0, last = performance.now(), raf
  const resize = () => {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix()
    group.position.x = w > 1000 ? 2.3 : 0
  }
  window.addEventListener('resize', resize); resize()
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now
    for (const k in target) cur[k] += (target[k] - cur[k]) * 0.055
    parts.forEach((p) => { p.g.position.z = p.z * (1 + cur.explode * 1.25) })
    spinY += cur.spin * dt * 1.4; group.rotation.y = spinY
    camera.position.z += (cur.zoom - camera.position.z) * 0.06
    edgeMat.color.copy(bwCol).lerp(accCol, Math.max(0, Math.min(1, cur.color)))
    if (grid) grid.style.opacity = (cur.grid * 0.85).toFixed(3)
    renderer.render(scene, camera); raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
  if (REDUCED) target.spin = 0
  const setT = (el) => { ['explode', 'zoom', 'spin', 'color', 'grid'].forEach((k) => { const v = parseFloat(el.dataset[k]); if (!isNaN(v)) target[k] = v }) }
  const obs = []
  document.querySelectorAll('[data-explode]').forEach((el) => {
    const o = new IntersectionObserver((es) => es.forEach((x) => { if (x.isIntersecting) setT(el) }), { threshold: 0.5 })
    o.observe(el); obs.push(o)
  })
  return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); obs.forEach((o) => o.disconnect()); renderer.dispose() }
}
