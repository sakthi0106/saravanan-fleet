import React, { useState, useEffect } from 'react';
import { Sidebar, NavTab } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { QRScannerModal } from './components/QRScannerModal';
import { useAlertNotifications } from './hooks/useAlertNotifications';

import { Dashboard } from './pages/Dashboard';
import { Vehicles } from './pages/Vehicles';
import { VehicleDetail } from './pages/VehicleDetail';
import { Trips } from './pages/Trips';
import { FuelPage } from './pages/Fuel';
import { MaintenancePage } from './pages/Maintenance';
import { DocumentsPage } from './pages/Documents';
import { ExpensesPage } from './pages/Expenses';
import { ServiceAlertsPage } from './pages/ServiceAlerts';
import { AnalyticsPage } from './pages/Analytics';
import { ReportsPage } from './pages/Reports';
import { SettingsPage } from './pages/Settings';

import {
  Vehicle,
  Trip,
  FuelRecord,
  MaintenanceRecord,
  DocumentRecord,
  ExpenseRecord,
  SettingRecord,
  AlertItem,
  SyncStatus,
  AnalyticsSummary,
} from './types';
import { api } from './api/client';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [vehicleFromTab, setVehicleFromTab] = useState<NavTab>('vehicles'); // track which tab opened the vehicle

  // Data Store States
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [fuel, setFuel] = useState<FuelRecord[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [settings, setSettings] = useState<SettingRecord[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);

  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    last_synced_at: null,
    sync_state: 'idle',
    source: 'local_cache',
    message: 'Connecting to fleet server...',
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
  const [isQuickTripOpen, setIsQuickTripOpen] = useState(false);
  const [qrTripVehicleId, setQrTripVehicleId] = useState<string | null>(null);

  // Initial Load & Polling (every 20s)
  useEffect(() => {
    fetchAllData();
    const interval = setInterval(() => {
      fetchSyncStatusAndUpdates();
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  const fetchAllData = async () => {
    try {
      const [v, t, f, m, d, e, a, s, status, an] = await Promise.all([
        api.getVehicles(),
        api.getTrips(),
        api.getFuel(),
        api.getMaintenance(),
        api.getDocuments(),
        api.getExpenses(),
        api.getAlerts(),
        api.getSettings(),
        api.getSyncStatus(),
        api.getAnalytics({ type: 'full_year', year: 2026 }),
      ]);
      setVehicles(v);
      setTrips(t);
      setFuel(f);
      setMaintenance(m);
      setDocuments(d);
      setExpenses(e);
      setAlerts(a);
      setSettings(s);
      setSyncStatus(status);
      setAnalytics(an);
    } catch (err) {
      console.error('Error fetching fleet data:', err);
    }
  };

  const fetchSyncStatusAndUpdates = async () => {
    try {
      const status = await api.getSyncStatus();
      setSyncStatus(status);
      // Also refresh alerts and summary
      const [t, a, an] = await Promise.all([
        api.getTrips(),
        api.getAlerts(),
        api.getAnalytics({ type: 'full_year', year: 2026 }),
      ]);
      setTrips(t);
      setAlerts(a);
      setAnalytics(an);
    } catch (err) {
      console.warn('Sync status poll failed:', err);
    }
  };

  const handleManualSync = async () => {
    try {
      setIsSyncing(true);
      await api.refreshSync();
      await fetchAllData();
    } catch (err) {
      console.error('Manual sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Vehicle detail navigation
  const handleSelectVehicle = (vehicleId: string) => {
    setVehicleFromTab(currentTab);
    setSelectedVehicleId(vehicleId);
  };

  const handleBackFromVehicle = () => {
    setSelectedVehicleId(null);
    setCurrentTab(vehicleFromTab);
  };

  // Tab switching resets single-vehicle view
  const handleTabChange = (tab: NavTab) => {
    setSelectedVehicleId(null);
    setCurrentTab(tab);
  };

  // Action handlers
  const handleAddVehicle = async (data: Partial<Vehicle>) => {
    await api.createVehicle(data);
    await fetchAllData();
  };

  const handleUpdateVehicle = async (id: string, data: Partial<Vehicle>) => {
    await api.updateVehicle(id, data);
    await fetchAllData();
  };

  const handleAddTrip = async (data: Partial<Trip>) => {
    await api.createTrip(data);
    await fetchAllData();
  };

  const handleUpdateTrip = async (id: string, data: Partial<Trip>) => {
    await api.updateTrip(id, data);
    await fetchAllData();
  };

  const handleAddFuel = async (data: Partial<FuelRecord>) => {
    await api.createFuel(data);
    await fetchAllData();
  };

  const handleUpdateFuel = async (id: string, data: Partial<FuelRecord>) => {
    await api.updateFuel(id, data);
    await fetchAllData();
  };

  const handleAddMaintenance = async (data: Partial<MaintenanceRecord>) => {
    await api.createMaintenance(data);
    await fetchAllData();
  };

  const handleUpdateMaintenance = async (id: string, data: Partial<MaintenanceRecord>) => {
    await api.updateMaintenance(id, data);
    await fetchAllData();
  };

  const handleAddDocument = async (data: Partial<DocumentRecord>) => {
    await api.createDocument(data);
    await fetchAllData();
  };

  const handleUpdateDocument = async (id: string, data: Partial<DocumentRecord>) => {
    await api.updateDocument(id, data);
    await fetchAllData();
  };

  const handleAddExpense = async (data: Partial<ExpenseRecord>) => {
    await api.createExpense(data);
    await fetchAllData();
  };

  const handleUpdateExpense = async (id: string, data: Partial<ExpenseRecord>) => {
    await api.updateExpense(id, data);
    await fetchAllData();
  };

  const handleDismissAlert = async (alertId: string) => {
    await api.dismissAlert(alertId);
    setAlerts(prev => prev.map(a => (a.id === alertId ? { ...a, dismissed: true } : a)));
  };

  const handleUpdateSetting = async (key: string, value: string) => {
    await api.updateSetting(key, value);
    const updated = await api.getSettings();
    setSettings(updated);
  };

  const handleExportCSV = (type: string) => {
    window.open(api.getExportUrl(type), '_blank');
  };

  const handleQRSelectVehicle = (vehicleId: string, action: 'view' | 'trip') => {
    if (action === 'view') {
      setVehicleFromTab('vehicles');
      setSelectedVehicleId(vehicleId);
    } else {
      // Open trips tab with vehicle pre-selected for quick trip entry
      setQrTripVehicleId(vehicleId);
      setSelectedVehicleId(null);
      setCurrentTab('trips');
    }
  };

  const activeAlertCount = alerts.filter(a => a.severity === 'critical' && !a.dismissed).length;

  // Browser notifications for critical alerts
  useAlertNotifications(alerts);

  const tabTitles: Record<NavTab, string> = {
    dashboard: 'Executive Fleet Dashboard',
    vehicles: 'Fleet Vehicles Management',
    trips: 'Trip Registry & Logbook',
    fuel: 'Fuel Consumption & Spend Register',
    expenses: 'Operational Expense Ledger',
    maintenance: 'Maintenance, Repairs & Tyres',
    documents: 'Statutory Compliance Documents',
    alerts: 'Automatic Service & Document Alerts',
    analytics: 'All-Fleet Operations Analytics',
    reports: 'Audit Reports & CSV Data Export',
    settings: 'System Settings & Integration',
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 overflow-hidden font-sans">
      {/* Deep Navy Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={handleTabChange}
        alertCount={activeAlertCount}
      />

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navigation */}
        <Navbar
          syncStatus={syncStatus}
          isSyncing={isSyncing}
          onRefreshSync={handleManualSync}
          onOpenQRScanner={() => setIsQRScannerOpen(true)}
          onQuickAddTrip={() => {
            setSelectedVehicleId(null);
            setCurrentTab('trips');
          }}
          title={selectedVehicleId ? 'Vehicle History & Analytics' : tabTitles[currentTab]}
        />

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-7xl mx-auto">
            {/* Global critical alert banner */}
            {activeAlertCount > 0 && !selectedVehicleId && currentTab !== 'alerts' && (
              <div
                onClick={() => handleTabChange('alerts')}
                className="mb-4 flex items-center gap-3 bg-rose-600 text-white px-4 py-2.5 rounded-xl shadow-lg cursor-pointer hover:bg-rose-700 transition-colors text-xs font-semibold"
              >
                <span className="animate-pulse">🔴</span>
                <span>{activeAlertCount} critical alert{activeAlertCount > 1 ? 's' : ''} require attention — click to view</span>
              </div>
            )}
            {selectedVehicleId ? (
              <VehicleDetail
                vehicleId={selectedVehicleId}
                onBack={handleBackFromVehicle}
                onEditVehicle={v => {
                  setSelectedVehicleId(null);
                  setCurrentTab('vehicles');
                }}
                onAddTripForVehicle={_vId => {
                  setCurrentTab('trips');
                }}
                onAddFuelForVehicle={_vId => {
                  setCurrentTab('fuel');
                }}
                onAddMaintForVehicle={_vId => {
                  setCurrentTab('maintenance');
                }}
              />
            ) : currentTab === 'dashboard' ? (
              <Dashboard
                vehicles={vehicles}
                trips={trips}
                alerts={alerts}
                analytics={analytics}
                onSelectVehicle={handleSelectVehicle}
                onNavigateTab={handleTabChange}
                onAddTrip={() => setCurrentTab('trips')}
              />
            ) : currentTab === 'vehicles' ? (
              <Vehicles
                vehicles={vehicles}
                onSelectVehicle={handleSelectVehicle}
                onAddVehicle={handleAddVehicle}
                onUpdateVehicle={handleUpdateVehicle}
              />
            ) : currentTab === 'trips' ? (
              <Trips
                trips={trips}
                vehicles={vehicles}
                onAddTrip={handleAddTrip}
                onUpdateTrip={handleUpdateTrip}
                onExportCSV={() => handleExportCSV('trips')}
                preselectedVehicleId={qrTripVehicleId}
                onPreselectedConsumed={() => setQrTripVehicleId(null)}
              />
            ) : currentTab === 'fuel' ? (
              <FuelPage
                fuelRecords={fuel}
                vehicles={vehicles}
                onAddFuel={handleAddFuel}
                onUpdateFuel={handleUpdateFuel}
                onExportCSV={() => handleExportCSV('fuel')}
              />
            ) : currentTab === 'maintenance' ? (
              <MaintenancePage
                maintenanceRecords={maintenance}
                vehicles={vehicles}
                onAddMaintenance={handleAddMaintenance}
                onUpdateMaintenance={handleUpdateMaintenance}
                onExportCSV={() => handleExportCSV('maintenance')}
              />
            ) : currentTab === 'documents' ? (
              <DocumentsPage
                documentRecords={documents}
                vehicles={vehicles}
                onAddDocument={handleAddDocument}
                onUpdateDocument={handleUpdateDocument}
              />
            ) : currentTab === 'expenses' ? (
              <ExpensesPage
                expenseRecords={expenses}
                vehicles={vehicles}
                onAddExpense={handleAddExpense}
                onUpdateExpense={handleUpdateExpense}
                onExportCSV={() => handleExportCSV('expenses')}
              />
            ) : currentTab === 'alerts' ? (
              <ServiceAlertsPage
                alerts={alerts}
                onDismissAlert={handleDismissAlert}
                onSelectVehicle={handleSelectVehicle}
              />
            ) : currentTab === 'analytics' ? (
              <AnalyticsPage
                vehicles={vehicles}
                onSelectVehicle={handleSelectVehicle}
                onExportCSV={() => handleExportCSV('fleet')}
              />
            ) : currentTab === 'reports' ? (
              <ReportsPage vehicles={vehicles} />
            ) : currentTab === 'settings' ? (
              <SettingsPage
                settings={settings}
                syncStatus={syncStatus}
                onUpdateSetting={handleUpdateSetting}
              />
            ) : null}
          </div>
        </main>
      </div>

      {/* QR Scanner Modal */}
      <QRScannerModal
        isOpen={isQRScannerOpen}
        onClose={() => setIsQRScannerOpen(false)}
        vehicles={vehicles}
        onSelectVehicle={handleQRSelectVehicle}
      />
    </div>
  );
};
