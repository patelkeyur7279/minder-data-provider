/**
 * 🎯 DEMO HEADER COMPONENT
 */

import React from 'react';
import type { Feature } from '../App.comprehensive';

interface DemoHeaderProps {
  currentFeature?: Feature;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onToggleSidebar: () => void;
  onToggleDevTools: () => void;
  sidebarOpen: boolean;
  devToolsOpen: boolean;
}

export function DemoHeader({
  currentFeature,
  darkMode,
  onToggleDarkMode,
  onToggleSidebar,
  onToggleDevTools,
  sidebarOpen,
  devToolsOpen,
}: DemoHeaderProps) {
  return (
    <header className="demo-header">
      <div className="header-content">
        {/* Left Section */}
        <div className="header-left">
          <button
            className="header-btn sidebar-toggle"
            onClick={onToggleSidebar}
            title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          >
            {sidebarOpen ? '◀️' : '▶️'}
          </button>
          <div className="header-title">
            <h1>🚀 Minder Data Provider</h1>
            <span className="header-subtitle">Comprehensive Demo</span>
          </div>
        </div>

        {/* Center Section */}
        <div className="header-center">
          {currentFeature && (
            <div className="current-feature">
              <span className="feature-icon">{currentFeature.icon}</span>
              <div className="feature-info">
                <div className="feature-name">{currentFeature.title}</div>
                <div className="feature-desc">{currentFeature.description}</div>
              </div>
              {currentFeature.badge && (
                <span className="feature-badge">{currentFeature.badge}</span>
              )}
            </div>
          )}
        </div>

        {/* Right Section */}
        <div className="header-right">
          <button
            className={`header-btn devtools-toggle ${devToolsOpen ? 'active' : ''}`}
            onClick={onToggleDevTools}
            title="Toggle DevTools"
          >
            🛠️
          </button>
          <button
            className="header-btn theme-toggle"
            onClick={onToggleDarkMode}
            title={darkMode ? 'Light mode' : 'Dark mode'}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </div>
    </header>
  );
}
