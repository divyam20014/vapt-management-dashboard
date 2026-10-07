import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import { SetupPage, SignInPage } from "./pages/SignInPage";
import RequirePermission from "./components/auth/RequirePermission";
import LoadingState from "./components/states/LoadingState";
import ErrorState from "./components/states/ErrorState";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { UsersProvider } from "./hooks/useUsers";
import { COMPARE_PATH, ROUTES } from "./utils/routes";
import { PERMISSIONS } from "./utils/constants";

// Each page is a separate chunk, so the first screen downloads only what it needs (charts load with the dashboards).
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const ProjectsPage = lazy(() => import("./pages/ProjectsPage"));
const ProjectDetailPage = lazy(() => import("./pages/ProjectDetailPage"));
const FindingsPage = lazy(() => import("./pages/FindingsPage"));
const FindingDetailPage = lazy(() => import("./pages/FindingDetailPage"));
const CriticalHighPage = lazy(() => import("./pages/CriticalHighPage"));
const ScansPage = lazy(() => import("./pages/ScansPage"));
const ScanDetailPage = lazy(() => import("./pages/ScanDetailPage"));
const ComparePage = lazy(() => import("./pages/ComparePage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const UploadReportPage = lazy(() => import("./pages/UploadReportPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const AuditLogPage = lazy(() => import("./pages/AuditLogPage"));
const RemediationLibraryPage = lazy(
  () => import("./pages/RemediationLibraryPage"),
);
const RemediationGuidelinePage = lazy(
  () => import("./pages/RemediationGuidelinePage"),
);
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

function SignedInApp() {
  return (
    <UsersProvider>
      <Suspense fallback={<LoadingState label="Loading…" />}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path={ROUTES.dashboard} element={<DashboardPage />} />
            <Route path={ROUTES.projects} element={<ProjectsPage />} />
            <Route
              path={`${ROUTES.projects}/:projectId`}
              element={<ProjectDetailPage />}
            />
            <Route path={ROUTES.findings} element={<FindingsPage />} />
            <Route
              path={`${ROUTES.findings}/:findingId`}
              element={<FindingDetailPage />}
            />
            <Route path={ROUTES.criticalHigh} element={<CriticalHighPage />} />
            <Route path={ROUTES.scans} element={<ScansPage />} />
            <Route path={COMPARE_PATH} element={<ComparePage />} />
            <Route
              path={`${ROUTES.scans}/:scanId`}
              element={<ScanDetailPage />}
            />
            <Route
              path={ROUTES.remediation}
              element={<RemediationLibraryPage />}
            />
            <Route
              path={`${ROUTES.remediation}/:slug`}
              element={<RemediationGuidelinePage />}
            />
            <Route path={ROUTES.reports} element={<ReportsPage />} />
            <Route
              path={ROUTES.upload}
              element={
                <RequirePermission permission={PERMISSIONS.reportsUpload}>
                  <UploadReportPage />
                </RequirePermission>
              }
            />
            <Route path={ROUTES.settings} element={<SettingsPage />} />
            <Route
              path={ROUTES.audit}
              element={
                <RequirePermission permission={PERMISSIONS.auditRead}>
                  <AuditLogPage />
                </RequirePermission>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </UsersProvider>
  );
}

/** Sign-in gate. The requested URL stays in the address bar, so it opens once the user signs in. */
function Gate() {
  const { state, refresh } = useAuth();
  switch (state.kind) {
    case "loading":
      return <LoadingState label="Loading…" />;
    case "error":
      return (
        <div className="mx-auto max-w-lg px-4 py-16">
          <ErrorState
            title="The application could not start"
            message={state.message}
            onRetry={refresh}
          />
        </div>
      );
    case "setup":
      return <SetupPage />;
    case "signed-out":
      return <SignInPage notice={state.reason} />;
    default:
      return <SignedInApp />;
  }
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
