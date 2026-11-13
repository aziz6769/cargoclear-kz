import { Component } from 'react';
import { Route, Routes } from 'react-router-dom';
import { DataProvider, useApp } from './app/DataContext.jsx';
import AppShell from './components/AppShell.jsx';
import { Banner, Button, Spinner } from './components/ui.jsx';
import Dashboard from './features/dashboard/Dashboard.jsx';
import ComparisonWizard from './features/comparison/ComparisonWizard.jsx';
import ComparisonResults from './features/comparison/ComparisonResults.jsx';
import Comparisons from './features/history/Comparisons.jsx';
import History from './features/history/History.jsx';
import Shipments from './features/shipments/Shipments.jsx';
import Carriers from './features/carriers/Carriers.jsx';
import Analytics from './features/analytics/Analytics.jsx';
import SettingsPage from './features/settings/SettingsPage.jsx';

class ErrorBoundary extends Component {
  static contextType = undefined;
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
  const { status, error, reload, t } = useApp();
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
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="compare/new" element={<ComparisonWizard />} />
          <Route path="comparisons" element={<Comparisons />} />
          <Route path="comparisons/:id" element={<ComparisonResults />} />
          <Route path="comparisons/:id/edit" element={<ComparisonWizard />} />
          <Route path="shipments" element={<Shipments />} />
          <Route path="carriers" element={<Carriers />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="history" element={<History />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Dashboard />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

export default function App({ repo }) {
  return (
    <DataProvider repo={repo}>
      <Gate />
    </DataProvider>
  );
}
