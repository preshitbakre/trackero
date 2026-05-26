import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import { ToastProvider } from './components/common/Toast';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { TodayPage } from './pages/TodayPage';
import { TodayHome } from './pages/TodayHome';
import { EpicsPage } from './pages/EpicsPage';
import { EpicDetailPage } from './pages/EpicDetailPage';
import { SprintsPage } from './pages/SprintsPage';
import { BoardPage } from './pages/BoardPage';
import { ChartsPage } from './pages/ChartsPage';
import { RetroPage } from './pages/RetroPage';
import { SprintPlanningPage } from './pages/SprintPlanningPage';
import { BacklogPage } from './pages/BacklogPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { ProjectSettingsPage } from './pages/ProjectSettingsPage';
import { TaskDetailPage } from './pages/TaskDetailPage';
import { StoriesPage } from './pages/StoriesPage';
import { StoryDetailPage } from './pages/StoryDetailPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { SetupWizardPage } from './pages/SetupWizardPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
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
      <ToastProvider />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/setup" element={<Navigate to="/setup/1" replace />} />
          <Route path="/setup/:step" element={<SetupWizardPage />} />
          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            {/* Today is per-project. /today and /dashboard land on
                TodayHome which resolves the user's default project
                (pinned > most-recent) and redirects to
                /projects/:id/today. The same TodayPage component serves
                both project-scoped and legacy ?projectId= URLs — the
                route param wins when set. */}
            <Route path="/today" element={<TodayHome />} />
            <Route path="/dashboard" element={<TodayHome />} />
            <Route path="/projects/:id/today" element={<TodayPage />} />
            <Route path="/dashboard-legacy" element={<DashboardPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:id/board" element={<BoardPage />} />
            <Route path="/projects/:id/tasks/:taskId" element={<TaskDetailPage />} />
            <Route path="/projects/:id/backlog" element={<BacklogPage />} />
            <Route path="/projects/:id/sprints" element={<SprintsPage />} />
            <Route path="/projects/:id/epics" element={<EpicsPage />} />
            <Route path="/projects/:id/stories" element={<StoriesPage />} />
            <Route path="/projects/:id/stories/:storyId" element={<StoryDetailPage />} />
            <Route path="/projects/:id/epics/:epicId" element={<EpicDetailPage />} />
            <Route path="/projects/:id/charts" element={<ChartsPage />} />
            <Route path="/projects/:id/settings" element={<ProjectSettingsPage />} />
            <Route path="/projects/:id/sprints/:sprintId/retro" element={<RetroPage />} />
            <Route path="/projects/:id/sprints/:sprintId/planning" element={<SprintPlanningPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
