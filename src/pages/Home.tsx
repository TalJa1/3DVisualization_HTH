import { Link } from "react-router-dom";
import "./Home.css";

const FEATURES = [
  {
    title: "Map Terrain",
    desc: "Draw a box anywhere on Earth and pull real SRTM/NED elevation data straight into the editor.",
    tag: "Real-world DEM",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14M15 6v14" />
      </svg>
    ),
  },
  {
    title: "Heightmap Import",
    desc: "Drop a greyscale PNG, JPG or WebP and watch it rise into a textured 3D surface in real time.",
    tag: "PNG · JPG · WebP",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" />
      </svg>
    ),
  },
  {
    title: "Model Workshop",
    desc: "Import GLB, OBJ, FBX, STL and more, tune materials and lighting, then export print-ready files.",
    tag: "8 formats",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2 3 7v10l9 5 9-5V7z" /><path d="m3 7 9 5 9-5M12 12v10" />
      </svg>
    ),
  },
];

const STEPS = [
  {
    n: "01",
    title: "Bring in your terrain",
    desc: "Capture a region from the live world map, or upload a heightmap or 3D model file.",
  },
  {
    n: "02",
    title: "Shape it in 3D",
    desc: "Adjust height scale, colour scheme, lighting and polygon detail with an instant live preview.",
  },
  {
    n: "03",
    title: "Export & print",
    desc: "Download a clean STL for slicing, or OBJ for Blender, Unity and Unreal — no account needed.",
  },
];

const SAMPLES = [
  { name: "Heightmapper", file: "heightmapper.png" },
  { name: "Núi Phusi", file: "nui_phusi.png" },
  { name: "Mount Everest", file: "everest.png" },
  { name: "Bắc Bộ", file: "bacbo.png" },
];

export default function Home() {
  return (
    <div className="home">
      {/* Hero */}
      <section className="home__hero">
        <div className="home__hero-glow" aria-hidden="true" />
        <span className="home__badge">
          <span className="home__badge-dot" /> Runs entirely in your browser
        </span>
        <h1 className="home__heading">
          Turn <span className="home__heading-accent">elevation data</span>
          <br />
          into print-ready 3D terrain
        </h1>
        <p className="home__subheading">
          Capture any landscape from a live world map or upload your own heightmap,
          sculpt it in real-time 3D, and export a clean STL or OBJ — all without
          installing a thing.
        </p>
        <div className="home__cta-row">
          <Link to="/editor" className="btn btn--primary">
            Open 3D Editor →
          </Link>
          <Link to="/terrain" className="btn btn--ghost">
            Explore the Map
          </Link>
        </div>
        <div className="home__pills" aria-hidden="true">
          <span className="home__pill">STL &amp; OBJ export</span>
          <span className="home__pill">Real SRTM elevation</span>
          <span className="home__pill">No sign-up</span>
          <span className="home__pill">100% free</span>
        </div>
      </section>

      {/* Feature cards */}
      <section className="home__features">
        <header className="home__section-head">
          <span className="home__eyebrow">Workflow</span>
          <h2 className="home__section-title">Three ways to begin</h2>
        </header>
        <div className="home__feature-grid">
          {FEATURES.map((f) => (
            <article key={f.title} className="home__feature-card">
              <span className="home__feature-icon">{f.icon}</span>
              <span className="home__feature-tag">{f.tag}</span>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Quick-start steps */}
      <section className="home__steps" id="quickstart">
        <header className="home__section-head">
          <span className="home__eyebrow">How it works</span>
          <h2 className="home__section-title">From map to model in three steps</h2>
        </header>
        <ol className="home__step-list">
          {STEPS.map((s) => (
            <li key={s.n} className="home__step-card">
              <span className="home__step-num">{s.n}</span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Sample DEM links */}
      <section className="home__samples" id="samples">
        <header className="home__section-head">
          <span className="home__eyebrow">Try it now</span>
          <h2 className="home__section-title">Sample heightmaps</h2>
        </header>
        <p className="home__samples-hint">
          Download one of these and drop it into the editor to see TerraSlice in action.
        </p>
        <ul className="home__sample-list">
          {SAMPLES.map((s) => (
            <li key={s.file}>
              <a href={`/sample/${s.file}`} download={s.file} className="home__sample-link">
                <span className="home__sample-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M5 21h14" />
                  </svg>
                </span>
                {s.name}
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* Final CTA band */}
      <section className="home__cta-band">
        <div className="home__cta-glow" aria-hidden="true" />
        <h2>Ready to build your terrain?</h2>
        <p>Jump into the editor — your first model is only a few clicks away.</p>
        <Link to="/editor" className="btn btn--primary">
          Launch the Editor →
        </Link>
      </section>
    </div>
  );
}
