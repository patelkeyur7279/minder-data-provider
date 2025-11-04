/**
 * 🖥️ PLATFORM DETECTION PANEL
 */

import React, { useState, useEffect } from 'react';
import { PlatformDetector } from '../../src/index';

export function PlatformPanel() {
  const [info, setInfo] = useState<any>(null);

  useEffect(() => {
    const platformInfo = PlatformDetector.getInfo();
    setInfo(platformInfo);
  }, []);

  return (
    <div className="panel platform-panel">
      <div className="panel-header">
        <h2>🖥️ Platform Detection</h2>
        <p>Auto-detect and optimize for different platforms</p>
      </div>

      <div className="panel-content">
        {/* Platform Info Card */}
        <div className="info-card">
          <h3>Current Platform</h3>
          <div className="platform-badge">{info?.platform || 'Detecting...'}</div>
          
          <div className="info-grid">
            <div className="info-item">
              <strong>🌐 Web:</strong>
              <span className={info?.isWeb ? 'status-yes' : 'status-no'}>
                {info?.isWeb ? '✅ Yes' : '❌ No'}
              </span>
            </div>
            <div className="info-item">
              <strong>📱 Mobile:</strong>
              <span className={info?.isMobile ? 'status-yes' : 'status-no'}>
                {info?.isMobile ? '✅ Yes' : '❌ No'}
              </span>
            </div>
            <div className="info-item">
              <strong>�� Desktop:</strong>
              <span className={info?.isDesktop ? 'status-yes' : 'status-no'}>
                {info?.isDesktop ? '✅ Yes' : '❌ No'}
              </span>
            </div>
            <div className="info-item">
              <strong>🖥️ Server:</strong>
              <span className={info?.isServer ? 'status-yes' : 'status-no'}>
                {info?.isServer ? '✅ Yes' : '❌ No'}
              </span>
            </div>
          </div>
        </div>

        {/* Platform Features */}
        <div className="features-card">
          <h3>Platform-Specific Features</h3>
          <div className="features-list">
            {info?.isWeb && (
              <div className="feature-item">
                <span className="feature-icon">🌐</span>
                <div>
                  <strong>Web Optimizations</strong>
                  <p>LocalStorage, IndexedDB, Service Workers</p>
                </div>
              </div>
            )}
            {info?.isMobile && (
              <div className="feature-item">
                <span className="feature-icon">📱</span>
                <div>
                  <strong>Mobile Optimizations</strong>
                  <p>AsyncStorage, SecureStore, Camera, Geolocation</p>
                </div>
              </div>
            )}
            {info?.isDesktop && (
              <div className="feature-item">
                <span className="feature-icon">💻</span>
                <div>
                  <strong>Desktop Features</strong>
                  <p>File System, Native Dialogs, Auto Updates</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Technical Details */}
        <div className="details-card">
          <h3>Technical Details</h3>
          <pre className="code-block">{JSON.stringify(info, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}
