import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { apiClient } from '../../api/client';

export function AppShell() {
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });
  const [projects, setProjects] = useState<any[]>([]);

  useEffect(() => {
    apiClient.get('/projects?limit=-1').then((res) => {
      setProjects(res.data.data.list || []);
    }).catch(() => {});
  }, []);

  const toggleSidebar = () => {
    setCollapsed((prev) => {
      localStorage.setItem('sidebar_collapsed', String(!prev));
      return !prev;
    });
  };

  return (
    <div className="flex h-screen bg-white dark:bg-gray-950">
      <Sidebar projects={projects} collapsed={collapsed} onToggle={toggleSidebar} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar onMenuToggle={toggleSidebar} />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
