import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { EpicsPage } from './pages/EpicsPage';
import { EpicBoardPage } from './pages/EpicBoardPage';
import { SprintsPage } from './pages/SprintsPage';
import { TasksPage } from './pages/TasksPage';
import { BoardPage } from './pages/BoardPage';
import { ChartsPage } from './pages/ChartsPage';
import { RetroPage } from './pages/RetroPage';
import { SprintPlanningPage } from './pages/SprintPlanningPage';
import { BacklogPage } from './pages/BacklogPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppShell } from './components/layout/AppShell';
import { useEffect } from 'react';

function InitTheme() {
  useEffect(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  }, []);
  return null;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <InitTheme />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:id/board" element={<BoardPage />} />
            <Route path="/projects/:id/tasks" element={<TasksPage />} />
            <Route path="/projects/:id/backlog" element={<BacklogPage />} />
            <Route path="/projects/:id/sprints" element={<SprintsPage />} />
            <Route path="/projects/:id/epics" element={<EpicsPage />} />
            <Route path="/projects/:id/epics/:epicId/board" element={<EpicBoardPage />} />
            <Route path="/projects/:id/charts" element={<ChartsPage />} />
            <Route path="/projects/:id/sprints/:sprintId/retro" element={<RetroPage />} />
            <Route path="/projects/:id/sprints/:sprintId/planning" element={<SprintPlanningPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
