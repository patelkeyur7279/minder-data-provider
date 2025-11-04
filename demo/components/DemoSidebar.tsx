/**
 * 🎯 DEMO SIDEBAR COMPONENT
 */

import React from 'react';
import type { Feature } from '../App.comprehensive';

interface DemoSidebarProps {
  features: Feature[];
  categories: Record<string, Feature[]>;
  activeFeature: string;
  onSelectFeature: (featureId: string) => void;
  isOpen: boolean;
}

export function DemoSidebar({
  features,
  categories,
  activeFeature,
  onSelectFeature,
  isOpen,
}: DemoSidebarProps) {
  if (!isOpen) return null;

  return (
    <aside className="demo-sidebar">
      <nav className="sidebar-nav">
        <div className="nav-header">
          <h3>🎯 Features</h3>
          <p className="nav-subtitle">
            {features.filter(f => f.enabled).length} of {features.length} enabled
          </p>
        </div>

        {/* Grouped by Category */}
        {Object.entries(categories).map(([category, categoryFeatures]) => (
          <div key={category} className="feature-category">
            <div className="category-header">{category}</div>
            <ul className="feature-list">
              {categoryFeatures.map((feature) => (
                <li key={feature.id} className="feature-item">
                  <button
                    className={`feature-btn ${
                      activeFeature === feature.id ? 'active' : ''
                    } ${!feature.enabled ? 'disabled' : ''}`}
                    onClick={() => feature.enabled && onSelectFeature(feature.id)}
                    disabled={!feature.enabled}
                  >
                    <span className="feature-icon">{feature.icon}</span>
                    <div className="feature-content">
                      <div className="feature-title">
                        {feature.title}
                        {feature.badge && (
                          <span className="feature-badge">{feature.badge}</span>
                        )}
                      </div>
                      <div className="feature-description">
                        {feature.description}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {/* Package Info */}
        <div className="package-info">
          <h4>📦 Package Info</h4>
          <div className="info-grid">
            <div className="info-item">
              <strong>Version:</strong> 2.1.0
            </div>
            <div className="info-item">
              <strong>Bundle:</strong> ~344 KB
            </div>
            <div className="info-item">
              <strong>Tests:</strong> 369 passing
            </div>
            <div className="info-item">
              <strong>Coverage:</strong> 95%+
            </div>
          </div>
        </div>
      </nav>
    </aside>
  );
}
