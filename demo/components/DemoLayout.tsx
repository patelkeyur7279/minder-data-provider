/**
 * 🎯 DEMO LAYOUT COMPONENT
 */

import React from 'react';

interface DemoLayoutProps {
  children: React.ReactNode;
  sidebarOpen: boolean;
}

export function DemoLayout({ children, sidebarOpen }: DemoLayoutProps) {
  return (
    <div className={`demo-layout ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      {children}
    </div>
  );
}
