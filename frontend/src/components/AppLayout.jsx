import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function AppLayout() {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

    const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen)

    return (
        <div style={{
            display: 'flex',
            background: 'var(--bg-deep)',
            minHeight: '100vh',
            color: 'var(--text-primary)',
            overflowX: 'hidden'
        }}>
            {/* Mobile Header */}
            <header style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                height: '64px',
                background: 'var(--glass-bg)',
                backdropFilter: 'blur(20px)',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'none', // Shown only on mobile via media query
                alignItems: 'center',
                padding: '0 20px',
                zIndex: 1000,
                justifyContent: 'space-between'
            }} className="mobile-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '32px', height: '32px', borderRadius: '8px',
                        background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '16px'
                    }}>
                        📡
                    </div>
                    <span style={{
                        fontWeight: 700,
                        fontFamily: 'var(--font-heading)',
                        fontSize: '18px',
                        letterSpacing: '-0.04em'
                    }}>ObserveML</span>
                </div>
                <button
                    onClick={toggleMobileMenu}
                    style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                        fontSize: '18px',
                        cursor: 'pointer',
                        padding: '8px',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease'
                    }}
                >
                    {isMobileMenuOpen ? '✕' : '☰'}
                </button>
            </header>

            {/* Sidebar Container */}
            <div
                className={`sidebar-container ${isMobileMenuOpen ? 'mobile-open' : ''}`}
                style={{
                    width: '280px',
                    flexShrink: 0,
                    zIndex: 1100
                }}
            >
                <Sidebar onClose={() => setIsMobileMenuOpen(false)} />
            </div>

            {/* Main content */}
            <main style={{
                flex: 1,
                padding: '56px 80px',
                minWidth: 0,
                transition: 'all 0.3s ease',
                position: 'relative'
            }} className="main-content">
                <div style={{ maxWidth: '1400px', margin: '0 auto' }} className="animate-fade-in">
                    <Outlet />
                </div>
            </main>

            {/* Backdrop for mobile menu */}
            {isMobileMenuOpen && (
                <div
                    onClick={toggleMobileMenu}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0, 0, 0, 0.7)',
                        backdropFilter: 'blur(4px)',
                        zIndex: 1050,
                        animation: 'fadeIn 0.3s ease'
                    }}
                />
            )}

            {/* Global Responsive Styles */}
            <style>{`
                @media (max-width: 1024px) {
                    .sidebar-container {
                        position: fixed;
                        left: -280px;
                        top: 0;
                        bottom: 0;
                        transition: left 0.5s cubic-bezier(0.16, 1, 0.3, 1);
                    }
                    .sidebar-container.mobile-open {
                        left: 0;
                    }
                    .mobile-header {
                        display: flex !important;
                    }
                    .main-content {
                        padding: 32px 20px !important;
                        margin-top: 64px !important;
                    }
                }
                
                @media (min-width: 1025px) {
                    .sidebar-container {
                        position: sticky;
                        top: 0;
                        height: 100vh;
                    }
                }
            `}</style>
        </div>
    )
}
