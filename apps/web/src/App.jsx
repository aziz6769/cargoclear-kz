import { Component, lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { DataProvider, useApp } from './app/DataContext.jsx';
import AppShell from './components/AppShell.jsx';
import { Banner, Button, Spinner } from './components/ui.jsx';
import { PageSkeleton } from './components/Skeleton.jsx';
const Dashboard = lazy(() => import('./features/dashboard/Dashboard.jsx'));
const ComparisonWizard = lazy(() => import('./features/comparison/ComparisonWizard.jsx'));
const ComparisonResults = lazy(() => import('./features/comparison/ComparisonResults.jsx'));
const Comparisons = lazy(() => import('./features/history/Comparisons.jsx'));
const History = lazy(() => import('./features/history/History.jsx'));
const Shipments = lazy(() => import('./features/shipments/Shipments.jsx'));
const ShipmentDetails = lazy(() => import('./features/shipments/ShipmentDetails.jsx'));
const DemoMode = lazy(() => import('./features/demo/DemoMode.jsx'));
const ReportPage = lazy(() => import('./features/comparison/ReportPage.jsx'));
const Carriers = lazy(() => import('./features/carriers/Carriers.jsx'));
const AssistantPage = lazy(() => import('./features/assistant/AssistantPage.jsx'));
const Documents = lazy(() => import('./features/documents/Documents.jsx'));
const Analytics = lazy(() => import('./features/analytics/Analytics.jsx'));
const SettingsPage = lazy(() => import('./features/settings/SettingsPage.jsx'));
const Profile = lazy(() => import('./features/cloud/Profile.jsx'));
const Migration = lazy(() => import('./features/cloud/Migration.jsx'));

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="p-8">
        <Banner tone="bad" title={this.props.title}>
          {String(this.state.error?.message ?? this.state.error)}
        </Banner>
        <Button className="mt-4" onClick={() => this.setState({ error: null })}>
          {this.props.retry}
        </Button>
      </div>
    );
  }
}

function Gate() {
  const { status, error, reload, t, mode } = useApp();
  if (status === 'loading') return <Spinner label={t('common.loading')} />;
  if (status === 'error')
    return (
      <div className="mx-auto max-w-lg p-8">
        <Banner tone="bad" title={t('err.storage')}>
          {String(error?.message ?? error)}
        </Banner>
        <Button className="mt-4" variant="primary" onClick={reload}>
          {t('common.retry')}
        </Button>
      </div>
    );
  return (
    <ErrorBoundary title={t('err.generic')} retry={t('common.retry')}>
      <Suspense fallback={<div className="mx-auto max-w-6xl p-4 sm:p-8"><PageSkeleton /></div>}>
      <Routes>
        {/* standalone pages: presentation mode and the printable report have their own chrome */}
        {mode !== 'cloud' && <Route path="demo" element={<DemoMode />} />}
        <Route path="comparisons/:id/report" element={<ReportPage />} />
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="compare/new" element={<ComparisonWizard />} />
          <Route path="comparisons" element={<Comparisons />} />
          <Route path="comparisons/:id" element={<ComparisonResults />} />
          <Route path="comparisons/:id/edit" element={<ComparisonWizard />} />
          <Route path="shipments" element={<Shipments />} />
          <Route path="shipments/:id" element={<ShipmentDetails />} />
          <Route path="carriers" element={<Carriers />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="documents" element={<Documents />} />
          <Route path="assistant" element={<AssistantPage />} />
          <Route path="history" element={<History />} />
          <Route path="settings" element={<SettingsPage />} />
          {mode === 'cloud' && <Route path="profile" element={<Profile />} />}
          {mode === 'cloud' && <Route path="migrate" element={<Migration />} />}
          <Route path="*" element={<Dashboard />} />
        </Route>
      </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default function App({ repo, cloud = null, mode = 'local', account = null, onExitDemo, exitLabel }) {
  return (
    <DataProvider repo={repo} cloud={cloud} mode={mode} account={account} onExitDemo={onExitDemo} exitLabel={exitLabel}>
      <Gate />
    </DataProvider>
  );
}
