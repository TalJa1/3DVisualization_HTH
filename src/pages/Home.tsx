import { Link } from "react-router-dom";
import "./Home.css";

export default function Home() {
  return (
    <div className="home">
      {/* Hero */}
      <section className="home__hero">
        <div className="home__hero-glow" aria-hidden="true" />
        <h1 className="home__heading">
          Turn <span className="home__heading-accent">Heightmaps</span> into
          <br />
          Stunning 3D Models
        </h1>
        <p className="home__subheading">
          Upload a DEM or heightmap file, visualise the terrain in real-time 3D,
          and export a print-ready STL or OBJ — all in your browser.
        </p>
        <div className="home__cta-row">
          <Link to="/editor" className="btn btn--primary">
            Open 3D Editor →
          </Link>
          <a href="#samples" className="btn btn--ghost">
            Sample Files
          </a>
        </div>
      </section>

      {/* Quick-start steps */}
      <section className="home__steps" id="quickstart">
        <h2 className="home__section-title">Quick Start</h2>
        <ol className="home__step-list">
          {[
            {
              n: "01",
              title: "Upload your DEM / Heightmap",
              desc: "Drag & drop or browse for a .png, .jpg, or .webp greyscale heightmap image.",
            },
            {
              n: "02",
              title: "Customise the 3D model",
              desc: "Adjust height scale, colour scheme and polygon detail with live preview.",
            },
            {
              n: "03",
              title: "Export & Download",
              desc: "Download as STL for 3D printing or OBJ for use in Blender / Unity.",
            },
          ].map((s) => (
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
        <h2 className="home__section-title">Sample DEM Files</h2>
        <ul className="home__sample-list">
          {[
            { name: 'Heightmapper',  file: 'heightmapper.png' },
            { name: 'Núi Phusi',     file: 'nui_phusi.png'   },
            { name: 'Mount Everest', file: 'everest.png'      },
            { name: 'Bắc Bộ',       file: 'bacbo.png'        },
          ].map(s => (
            <li key={s.file}>
              <a
                href={`/sample/${s.file}`}
                download={s.file}
                className="home__sample-link"
              >
                <span className="home__sample-icon">⬇</span> {s.name}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
