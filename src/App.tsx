import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home   from './pages/Home'
import Editor from './pages/Editor'
import Export from './pages/Export'
import About  from './pages/About'
import { ModelProvider } from './context/ModelContext'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <ModelProvider>
      <Layout>
        <Routes>
          <Route path="/"        element={<Home   />} />
          <Route path="/editor"  element={<Editor />} />
          <Route path="/export"  element={<Export />} />
          <Route path="/about"   element={<About  />} />
        </Routes>
      </Layout>
      </ModelProvider>
    </BrowserRouter>
  )
}

export default App
