import { NavLink } from 'react-router-dom'
import logo from '../assets/logo.png'
import './Navbar.css'

const NAV_ITEMS = [
  { to: '/',        label: 'Home' },
  { to: '/editor',  label: '3D Editor' },
  { to: '/export',  label: 'Export' },
  { to: '/about',   label: 'About' },
]

export default function Navbar() {
  return (
    <header className="navbar">
      {/* Brand */}
      <NavLink to="/" className="navbar__brand" aria-label="HuaTrienHao 3D – Home">
        <div className="navbar__logo-ring">
          <img src={logo} alt="HuaTrienHao 3D logo" className="navbar__logo-img" />
        </div>
        <span className="navbar__title">
          HuaTrienHao <span className="navbar__title-accent">3D</span>
        </span>
      </NavLink>

      {/* Navigation tabs */}
      <nav className="navbar__nav" aria-label="Main navigation">
        {NAV_ITEMS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `navbar__link${isActive ? ' navbar__link--active' : ''}`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </header>
  )
}
