import './About.css'

export default function About() {
  return (
    <div className="about">
      <header className="about__header">
        <h1>About / Help</h1>
        <p>Learn how heightmaps work and get the most out of this tool.</p>
      </header>

      {/* What is a heightmap */}
      <section className="about__section">
        <h2>What is a Heightmap / DEM?</h2>
        <p>
          A <strong>Digital Elevation Model (DEM)</strong> is a grid of elevation values
          representing the shape of Earth's surface. Each pixel encodes an altitude —
          brighter = higher. TerraSlice 3D reads that grid and builds a 3D mesh you can
          visualise, explore, and 3D-print.
        </p>
      </section>

      {/* Tutorials */}
      <section className="about__section">
        <h2>Tutorials</h2>
        <ol className="about__tutorial-list">
          {[
            { title: 'Download free DEM data',     body: 'Visit USGS EarthExplorer or OpenTopography to download real-world elevation data for free.' },
            { title: 'Convert to PNG heightmap',   body: 'Use QGIS or GDAL to convert .tif/.asc files to a 16-bit greyscale PNG suitable for upload.' },
            { title: 'Adjust height scale',        body: 'Exaggerate or flatten terrain by dragging the Height Scale slider in the editor.' },
            { title: 'Choosing polygon detail',    body: 'Higher detail = more triangles = larger file. For 3D printing start at Medium (level 3).' },
            { title: 'Slicing for 3D printing',    body: 'Import the exported STL into Cura or PrusaSlicer. Enable supports for steep cliffs.' },
          ].map((t, i) => (
            <li key={i} className="about__tutorial-card">
              <span className="about__tutorial-n">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3>{t.title}</h3>
                <p>{t.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Accessibility */}
      <section className="about__section">
        <h2>Accessibility &amp; Education</h2>
        <p>
          This project supports <strong>STEM education</strong> and accessibility. Tactile 3D-printed
          terrain models can help visually impaired students explore geography by touch. All
          interactive controls include proper ARIA labels and keyboard navigation.
        </p>
      </section>
    </div>
  )
}
