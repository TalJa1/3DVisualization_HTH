import './Export.css'

export default function Export() {
  return (
    <div className="export">
      <header className="export__header">
        <h1>Export / Download</h1>
        <p>Preview your model and download in your preferred format.</p>
      </header>

      {/* Preview area */}
      <div className="export__preview-card">
        <div className="export__preview-canvas">
          <span className="export__preview-icon">📦</span>
          <p>Model preview will appear here</p>
        </div>
      </div>

      {/* Download options */}
      <section className="export__downloads">
        <h2>Download</h2>
        <div className="export__download-list">
          {[
            { format: 'STL', desc: 'Best for 3D printing (Cura, PrusaSlicer)', icon: '🖨️' },
            { format: 'OBJ', desc: 'Best for Blender, Maya, Unity, Unreal',    icon: '🎨' },
          ].map(f => (
            <div key={f.format} className="export__download-card">
              <span className="export__format-icon">{f.icon}</span>
              <div className="export__format-info">
                <strong>{f.format}</strong>
                <p>{f.desc}</p>
              </div>
              <button type="button" className="btn btn--primary export__dl-btn">
                Download .{f.format.toLowerCase()}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Instructions */}
      <section className="export__instructions">
        <h2>Importing into 3D printing software</h2>
        <ol>
          <li>Download the STL file above.</li>
          <li>Open your slicer (e.g. Cura, PrusaSlicer, Bambu Studio).</li>
          <li>Drag the STL into the build plate.</li>
          <li>Scale, rotate and set print settings as needed.</li>
          <li>Slice and send to your printer!</li>
        </ol>
      </section>
    </div>
  )
}
