import { Route, Routes } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import DashboardPage from './pages/DashboardPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import FindingsPage from './pages/FindingsPage';
import FindingDetailPage from './pages/FindingDetailPage';
import CriticalHighPage from './pages/CriticalHighPage';
import ScansPage from './pages/ScansPage';
import ScanDetailPage from './pages/ScanDetailPage';
import ComparePage from './pages/ComparePage';
import ReportsPage from './pages/ReportsPage';
import UploadReportPage from './pages/UploadReportPage';
import SettingsPage from './pages/SettingsPage';
import NotFoundPage from './pages/NotFoundPage';
import { COMPARE_PATH, ROUTES } from './utils/routes';
import { ActingUserProvider } from './hooks/useActingUser';

export default function App() {
  return (
    <ActingUserProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path={ROUTES.dashboard} element={<DashboardPage />} />
          <Route path={ROUTES.projects} element={<ProjectsPage />} />
          <Route path={`${ROUTES.projects}/:projectId`} element={<ProjectDetailPage />} />
          <Route path={ROUTES.findings} element={<FindingsPage />} />
          <Route path={`${ROUTES.findings}/:findingId`} element={<FindingDetailPage />} />
          <Route path={ROUTES.criticalHigh} element={<CriticalHighPage />} />
          <Route path={ROUTES.scans} element={<ScansPage />} />
          <Route path={COMPARE_PATH} element={<ComparePage />} />
          <Route path={`${ROUTES.scans}/:scanId`} element={<ScanDetailPage />} />
          <Route path={ROUTES.reports} element={<ReportsPage />} />
          <Route path={ROUTES.upload} element={<UploadReportPage />} />
          <Route path={ROUTES.settings} element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </ActingUserProvider>
  );
}
