import { v4 as uuidv4 } from 'uuid';
import { Vehicle, Trip, FuelRecord, MaintenanceRecord, DocumentRecord, ExpenseRecord, SettingRecord, SyncStatus } from './types/index.js';
import { GoogleSheetsClient } from './googleSheets.js';
import { config } from './config.js';

export class DataStore {
  private sheetsClient: GoogleSheetsClient;
  private vehicles: Vehicle[] = [];
  private trips: Trip[] = [];
  private fuelRecords: FuelRecord[] = [];
  private maintenanceRecords: MaintenanceRecord[] = [];
  private documentRecords: DocumentRecord[] = [];
  private expenseRecords: ExpenseRecord[] = [];
  private settings: SettingRecord[] = [];
  private dismissedAlertIds: Set<string> = new Set();
  
  private syncStatus: SyncStatus = {
    last_synced_at: null,
    sync_state: 'idle',
    source: 'mock_fallback',
    message: 'Initializing fleet data...',
    spreadsheet_id: config.spreadsheetId,
  };

  private isSyncing = false;
  private pollingTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.sheetsClient = new GoogleSheetsClient();
    this.initDefaultData();
    this.startPolling();
  }

  private initDefaultData() {
    // Initial company vehicle fleet for Saravanan Electricals & Engineering
    this.vehicles = [
      {
        vehicle_id: 'veh-001',
        vehicle_name: 'BMW',
        registration_number: 'TN87E5753',
        vehicle_type: 'Luxury Sedan',
        fuel_type: 'Diesel',
        photo_url: '',
        sheet_tab_name: 'BMW TN87E5753',
        active: true,
        notes: '',
      },
      {
        vehicle_id: 'veh-002',
        vehicle_name: 'BENZ',
        registration_number: 'PYCT018600',
        vehicle_type: 'Luxury Sedan',
        fuel_type: 'Diesel',
        photo_url: '',
        sheet_tab_name: 'BENZ PYCT018600',
        active: true,
        notes: '',
      },
      {
        vehicle_id: 'veh-003',
        vehicle_name: 'INNOVA CRYSTA',
        registration_number: 'TN87E1604',
        vehicle_type: 'MUV',
        fuel_type: 'Diesel',
        photo_url: '',
        sheet_tab_name: 'INNOVA TN87E1604',
        active: true,
        notes: '',
      },
      {
        vehicle_id: 'veh-004',
        vehicle_name: 'HUNDAI VENUE',
        registration_number: 'TN87E2192',
        vehicle_type: 'Compact SUV',
        fuel_type: 'Petrol',
        photo_url: '',
        sheet_tab_name: 'VENUE TN87E2192',
        active: true,
        notes: '',
      },
      {
        vehicle_id: 'veh-005',
        vehicle_name: 'TOYOTA GLANZA CNG',
        registration_number: 'TN87D6036',
        vehicle_type: 'Hatchback',
        fuel_type: 'CNG',
        photo_url: '',
        sheet_tab_name: 'GLANZA TN87D6036',
        active: true,
        notes: '',
      },
      {
        vehicle_id: 'veh-006',
        vehicle_name: 'MARUTI ECO',
        registration_number: 'TN87H1779',
        vehicle_type: 'Van',
        fuel_type: 'CNG',
        photo_url: '',
        sheet_tab_name: 'ECO TN87H1779',
        active: true,
        notes: '',
      },
      {
        vehicle_id: 'veh-007',
        vehicle_name: 'HUNDAI ALCAZAR',
        registration_number: 'TN19BD5586',
        vehicle_type: 'SUV',
        fuel_type: 'Diesel',
        photo_url: '',
        sheet_tab_name: 'ALCAZAR TN19BD5586',
        active: true,
        notes: '',
      },
      {
        vehicle_id: 'veh-008',
        vehicle_name: 'BIG EICHER',
        registration_number: 'TN87C4650',
        vehicle_type: 'Heavy Truck',
        fuel_type: 'Diesel',
        photo_url: '',
        sheet_tab_name: 'BIG EICHER TN87C4650',
        active: true,
        notes: '',
      },
      {
        vehicle_id: 'veh-009',
        vehicle_name: 'SMALL EICHER CNG',
        registration_number: 'TN87C7419',
        vehicle_type: 'LCV',
        fuel_type: 'CNG',
        photo_url: '',
        sheet_tab_name: 'SMALL EICHER TN87C7419',
        active: true,
        notes: '',
      },
      {
        vehicle_id: 'veh-010',
        vehicle_name: 'BOLERO PICKUP',
        registration_number: 'TN87E2623',
        vehicle_type: 'Pickup Truck',
        fuel_type: 'Diesel',
        photo_url: '',
        sheet_tab_name: 'BOLERO TN87E2623',
        active: true,
        notes: '',
      },
    ];

    // Operational registers start clean with zero sample data
    this.trips = [];
    this.fuelRecords = [];
    this.maintenanceRecords = [];
    this.documentRecords = [];
    this.expenseRecords = [];

    this.settings = [
      { key: 'SERVICE_ALERT_DAYS', value: '30,15,7', description: 'Alert warning thresholds in days before document/service due' },
      { key: 'SERVICE_ALERT_KM', value: '10000,500', description: 'Alert warning thresholds in kilometres before service due' },
      { key: 'SYNC_INTERVAL_SEC', value: '20', description: 'Background polling interval for Google Sheets sync' },
      { key: 'COMPANY_NAME', value: 'Saravanan Electricals & Engineering Pvt Ltd', description: 'Company legal display name' },
      { key: 'CURRENCY', value: 'INR', description: 'Currency symbol formatting' },
    ];

    if (this.sheetsClient.isConfigured()) {
      this.syncStatus.source = 'google_sheets';
      this.syncStatus.message = 'Connected to Google Sheets';
    } else {
      this.syncStatus.source = 'mock_fallback';
      this.syncStatus.message = 'Running in offline/local mode. Google Sheets credentials not yet configured in .env.';
    }
  }

  private startPolling() {
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    this.pollingTimer = setInterval(async () => {
      if (this.sheetsClient.isConfigured() && !this.isSyncing) {
        await this.syncWithGoogleSheets();
      }
    }, config.syncIntervalMs);
  }

  public async syncWithGoogleSheets(): Promise<SyncStatus> {
    if (!this.sheetsClient.isConfigured()) {
      this.syncStatus.last_synced_at = new Date().toISOString();
      this.syncStatus.sync_state = 'idle';
      this.syncStatus.source = 'mock_fallback';
      this.syncStatus.message = 'Local cache active. Set GOOGLE_SPREADSHEET_ID and service account credentials to sync live.';
      return this.syncStatus;
    }

    this.isSyncing = true;
    this.syncStatus.sync_state = 'syncing';
    this.syncStatus.message = 'Synchronising with Google Sheets...';

    try {
      // 1. Ensure required tabs exist (parallel)
      await Promise.all([
        this.sheetsClient.ensureTabExists('Vehicles', [
          'vehicle_id', 'vehicle_name', 'registration_number', 'vehicle_type', 'fuel_type', 'photo_url', 'sheet_tab_name', 'active', 'notes'
        ]),
        this.sheetsClient.ensureTabExists('Fuel', [
          'fuel_id', 'date', 'vehicle_id', 'odometer', 'fuel_type', 'litres', 'amount', 'vendor', 'remarks', 'recorded_by', 'receipt_url'
        ]),
        this.sheetsClient.ensureTabExists('Maintenance', [
          'maintenance_id', 'vehicle_id', 'service_date', 'odometer', 'category', 'description', 'workshop', 'cost', 'next_service_due_km', 'next_service_due_date', 'notes', 'recorded_by'
        ]),
        this.sheetsClient.ensureTabExists('Documents', [
          'document_id', 'vehicle_id', 'document_type', 'document_number', 'issue_date', 'expiry_date', 'issuer', 'file_url', 'notes', 'recorded_by'
        ]),
        this.sheetsClient.ensureTabExists('Expenses', [
          'expense_id', 'date', 'vehicle_id', 'category', 'description', 'amount', 'vendor', 'receipt_url', 'notes', 'recorded_by'
        ]),
      ]);

      // 2. Read Vehicles tab
      const vehicleRows = await this.sheetsClient.readSheetValues('Vehicles');
      if (vehicleRows.length > 1) {
        const parsedVehicles: Vehicle[] = [];
        for (let i = 1; i < vehicleRows.length; i++) {
          const row = vehicleRows[i];
          if (!row[0] && !row[2]) continue;
          parsedVehicles.push({
            vehicle_id: (row[0] || uuidv4()).toString(),
            vehicle_name: (row[1] || '').toString(),
            registration_number: (row[2] || '').toString(),
            vehicle_type: (row[3] || 'Car').toString(),
            fuel_type: (row[4] || 'Diesel').toString(),
            photo_url: (row[5] || '').toString(),
            sheet_tab_name: (row[6] || '').toString(),
            active: (row[7] || '').toString().toLowerCase() !== 'false',
            notes: (row[8] || '').toString(),
          });
        }
        if (parsedVehicles.length > 0) {
          this.vehicles = parsedVehicles;
        }
      }

      // 3. Read Trips from vehicle-specific tabs (parallel)
      const allTabs = await this.sheetsClient.getSheetsMetadata();
      const loadedTrips: Trip[] = [];

      const tripResults = await Promise.allSettled(
        this.vehicles.map(async (v) => {
          const candidateTab = allTabs.find(t =>
            (v.sheet_tab_name && t.toLowerCase() === v.sheet_tab_name.toLowerCase()) ||
            t.toLowerCase().includes(v.registration_number.toLowerCase()) ||
            t.toLowerCase().includes(v.vehicle_name.toLowerCase())
          );
          if (!candidateTab) return [];
          const tabRows = await this.sheetsClient.readSheetValues(candidateTab);
          const vTrips: Trip[] = [];
          if (tabRows.length > 1) {
            for (let i = 1; i < tabRows.length; i++) {
              const r = tabRows[i];
              if (!r[0] || (r[0] || '').toString().toUpperCase().includes('TOTAL')) continue;
              const startKm = parseFloat(r[3]) || 0;
              const endKm = r[4] ? parseFloat(r[4]) : null;
              const dist = parseFloat(r[5]) || (endKm ? Math.max(0, endKm - startKm) : 0);
              vTrips.push({
                trip_id: `trip-s-${candidateTab}-${i}`,
                vehicle_id: v.vehicle_id,
                date: (r[0] || '').toString(),
                from: (r[1] || '').toString(),
                to: (r[2] || '').toString(),
                start_km: startKm,
                end_km: endKm,
                distance: dist,
                remark: (r[6] || '').toString(),
                amount: parseFloat(r[7]) || 0,
                status: endKm && endKm >= startKm ? 'COMPLETED' : 'UNFINISHED',
                sheet_name: candidateTab,
                row_index: i + 1,
              });
            }
          }
          return vTrips;
        })
      );
      tripResults.forEach(r => { if (r.status === 'fulfilled') loadedTrips.push(...r.value); });

      if (loadedTrips.length > 0) {
        this.trips = loadedTrips;
      }

      // 4. Read registers in parallel
      const [fuelRows, maintRows4, docRows4, expRows4] = await Promise.all([
        this.sheetsClient.readSheetValues('Fuel'),
        this.sheetsClient.readSheetValues('Maintenance'),
        this.sheetsClient.readSheetValues('Documents'),
        this.sheetsClient.readSheetValues('Expenses'),
      ]);

      if (fuelRows.length > 1) {

        const parsedFuel: FuelRecord[] = [];
        for (let i = 1; i < fuelRows.length; i++) {
          const r = fuelRows[i];
          if (!r[0] && !r[1]) continue;
          parsedFuel.push({
            fuel_id: (r[0] || uuidv4()).toString(),
            date: (r[1] || '').toString(),
            vehicle_id: (r[2] || '').toString(),
            odometer: parseFloat(r[3]) || 0,
            fuel_type: (r[4] || 'Diesel').toString(),
            litres: parseFloat(r[5]) || 0,
            amount: parseFloat(r[6]) || 0,
            vendor: (r[7] || '').toString(),
            remarks: (r[8] || '').toString(),
            recorded_by: (r[9] || '').toString(),
            receipt_url: (r[10] || '').toString(),
            row_index: i + 1,
          });
        }
        if (parsedFuel.length > 0) this.fuelRecords = parsedFuel;
      }

      // 5. Read Maintenance
      const maintRows = maintRows4;
      if (maintRows.length > 1) {
        const parsedMaint: MaintenanceRecord[] = [];
        for (let i = 1; i < maintRows.length; i++) {
          const r = maintRows[i];
          if (!r[0] && !r[1]) continue;
          parsedMaint.push({
            maintenance_id: (r[0] || uuidv4()).toString(),
            vehicle_id: (r[2] || '').toString(),
            service_date: (r[1] || '').toString(),
            odometer: parseFloat(r[3]) || 0,
            category: (r[4] || 'General Service').toString(),
            description: (r[5] || '').toString(),
            workshop: (r[6] || '').toString(),
            cost: parseFloat(r[7]) || 0,
            next_service_due_km: r[8] ? parseFloat(r[8]) : null,
            next_service_due_date: (r[9] || '').toString() || null,
            notes: (r[10] || '').toString(),
            recorded_by: (r[11] || '').toString(),
            row_index: i + 1,
          });
        }
        if (parsedMaint.length > 0) this.maintenanceRecords = parsedMaint;
      }

      // 6. Read Documents
      const docRows = docRows4;
      if (docRows.length > 1) {
        const parsedDocs: DocumentRecord[] = [];
        for (let i = 1; i < docRows.length; i++) {
          const r = docRows[i];
          if (!r[0] && !r[1]) continue;
          parsedDocs.push({
            document_id: (r[0] || uuidv4()).toString(),
            vehicle_id: (r[1] || '').toString(),
            document_type: (r[2] || 'Other') as any,
            document_number: (r[3] || '').toString(),
            issue_date: (r[4] || '').toString(),
            expiry_date: (r[5] || '').toString(),
            issuer: (r[6] || '').toString(),
            file_url: (r[7] || '').toString(),
            notes: (r[8] || '').toString(),
            recorded_by: (r[9] || '').toString(),
            row_index: i + 1,
          });
        }
        if (parsedDocs.length > 0) this.documentRecords = parsedDocs;
      }

      // 7. Read Expenses
      const expRows = expRows4;
      if (expRows.length > 1) {
        const parsedExp: ExpenseRecord[] = [];
        for (let i = 1; i < expRows.length; i++) {
          const r = expRows[i];
          if (!r[0] && !r[1]) continue;
          parsedExp.push({
            expense_id: (r[0] || uuidv4()).toString(),
            date: (r[1] || '').toString(),
            vehicle_id: (r[2] || '').toString(),
            category: (r[3] || 'Other') as any,
            description: (r[4] || '').toString(),
            amount: parseFloat(r[5]) || 0,
            vendor: (r[6] || '').toString(),
            receipt_url: (r[7] || '').toString(),
            notes: (r[8] || '').toString(),
            recorded_by: (r[9] || '').toString(),
            row_index: i + 1,
          });
        }
        if (parsedExp.length > 0) this.expenseRecords = parsedExp;
      }

      this.syncStatus = {
        last_synced_at: new Date().toISOString(),
        sync_state: 'idle',
        source: 'google_sheets',
        message: 'Successfully synchronised with Google Sheets.',
        spreadsheet_id: config.spreadsheetId,
      };
    } catch (err: any) {
      console.error('[DataStore] Sync error:', err.message);
      this.syncStatus = {
        last_synced_at: this.syncStatus.last_synced_at,
        sync_state: 'error',
        source: this.sheetsClient.isConfigured() ? 'google_sheets' : 'mock_fallback',
        message: `Sync warning: ${err.message}. Preserved local data.`,
        spreadsheet_id: config.spreadsheetId,
      };
    } finally {
      this.isSyncing = false;
    }

    return this.syncStatus;
  }

  // Getters
  public getVehicles(): Vehicle[] {
    return this.vehicles;
  }

  public getVehicleById(id: string): Vehicle | undefined {
    return this.vehicles.find(v => v.vehicle_id === id || v.registration_number.toLowerCase() === id.toLowerCase());
  }

  public getTrips(vehicleId?: string): Trip[] {
    if (!vehicleId) return this.trips;
    return this.trips.filter(t => t.vehicle_id === vehicleId);
  }

  public getFuelRecords(vehicleId?: string): FuelRecord[] {
    if (!vehicleId) return this.fuelRecords;
    return this.fuelRecords.filter(f => f.vehicle_id === vehicleId);
  }

  public getMaintenanceRecords(vehicleId?: string): MaintenanceRecord[] {
    if (!vehicleId) return this.maintenanceRecords;
    return this.maintenanceRecords.filter(m => m.vehicle_id === vehicleId);
  }

  public getDocumentRecords(vehicleId?: string): DocumentRecord[] {
    if (!vehicleId) return this.documentRecords;
    return this.documentRecords.filter(d => d.vehicle_id === vehicleId);
  }

  public getExpenseRecords(vehicleId?: string): ExpenseRecord[] {
    if (!vehicleId) return this.expenseRecords;
    return this.expenseRecords.filter(e => e.vehicle_id === vehicleId);
  }

  public getSettings(): SettingRecord[] {
    return this.settings;
  }

  public getSyncStatus(): SyncStatus {
    return this.syncStatus;
  }

  // Mutators with Google Sheets two-way write
  public async addVehicle(vehicle: Omit<Vehicle, 'vehicle_id'>): Promise<Vehicle> {
    const newVehicle: Vehicle = {
      ...vehicle,
      vehicle_id: `veh-${Date.now().toString().slice(-4)}`,
    };
    this.vehicles.push(newVehicle);

    if (this.sheetsClient.isConfigured()) {
      try {
        await this.sheetsClient.appendRow('Vehicles', [
          newVehicle.vehicle_id,
          newVehicle.vehicle_name,
          newVehicle.registration_number,
          newVehicle.vehicle_type,
          newVehicle.fuel_type,
          newVehicle.photo_url,
          newVehicle.sheet_tab_name,
          newVehicle.active ? 'TRUE' : 'FALSE',
          newVehicle.notes,
        ]);
        this.syncStatus.last_synced_at = new Date().toISOString();
      } catch (err: any) {
        console.error('[DataStore] Failed writing vehicle to Google Sheets:', err.message);
      }
    }
    return newVehicle;
  }

  public async updateVehicle(id: string, updates: Partial<Vehicle>): Promise<Vehicle | null> {
    const index = this.vehicles.findIndex(v => v.vehicle_id === id);
    if (index === -1) return null;
    this.vehicles[index] = { ...this.vehicles[index], ...updates };
    const updated = this.vehicles[index];

    if (this.sheetsClient.isConfigured()) {
      try {
        // Find row index by vehicle_id
        const rows = await this.sheetsClient.readSheetValues('Vehicles');
        const rowIndex = rows.findIndex((r, idx) => idx > 0 && r[0] === id) + 1;
        if (rowIndex > 1) {
          await this.sheetsClient.updateRow('Vehicles', rowIndex, [
            updated.vehicle_id,
            updated.vehicle_name,
            updated.registration_number,
            updated.vehicle_type,
            updated.fuel_type,
            updated.photo_url,
            updated.sheet_tab_name,
            updated.active ? 'TRUE' : 'FALSE',
            updated.notes,
          ]);
        }
      } catch (err: any) {
        console.error('[DataStore] Error updating vehicle in Sheets:', err.message);
      }
    }
    return updated;
  }

  public async addTrip(tripData: Omit<Trip, 'trip_id' | 'distance' | 'status'>): Promise<Trip> {
    const startKm = Number(tripData.start_km);
    const endKm = tripData.end_km !== undefined && tripData.end_km !== null ? Number(tripData.end_km) : null;
    const distance = endKm !== null && endKm >= startKm ? endKm - startKm : 0;
    const status = endKm !== null && endKm >= startKm ? 'COMPLETED' : 'UNFINISHED';

    const newTrip: Trip = {
      ...tripData,
      trip_id: `trip-${Date.now().toString().slice(-6)}`,
      start_km: startKm,
      end_km: endKm,
      distance,
      status,
    };
    this.trips.unshift(newTrip);

    if (this.sheetsClient.isConfigured()) {
      try {
        const vehicle = this.vehicles.find(v => v.vehicle_id === newTrip.vehicle_id);
        const targetTab = vehicle?.sheet_tab_name || 'Trips';
        await this.sheetsClient.ensureTabExists(targetTab, [
          'DATE', 'FROM', 'TO', 'START KM', 'END KM', 'DISTANCE', 'REMARK', 'AMOUNT'
        ]);
        const res = await this.sheetsClient.appendRow(targetTab, [
          newTrip.date,
          newTrip.from,
          newTrip.to,
          newTrip.start_km,
          newTrip.end_km ?? '',
          newTrip.distance,
          newTrip.remark,
          newTrip.amount,
        ]);
        newTrip.sheet_name = targetTab;
        newTrip.row_index = res.rowIndex;
      } catch (err: any) {
        console.error('[DataStore] Failed writing trip to Google Sheets:', err.message);
      }
    }
    return newTrip;
  }

  public async updateTrip(tripId: string, updates: Partial<Trip>): Promise<Trip | null> {
    const index = this.trips.findIndex(t => t.trip_id === tripId);
    if (index === -1) return null;
    
    const existing = this.trips[index];
    const merged = { ...existing, ...updates };
    
    if (merged.end_km !== null && merged.end_km !== undefined && merged.end_km >= merged.start_km) {
      merged.distance = merged.end_km - merged.start_km;
      merged.status = 'COMPLETED';
    } else {
      merged.status = 'UNFINISHED';
      merged.distance = 0;
    }
    this.trips[index] = merged;

    if (this.sheetsClient.isConfigured() && merged.sheet_name && merged.row_index) {
      try {
        await this.sheetsClient.updateRow(merged.sheet_name, merged.row_index, [
          merged.date,
          merged.from,
          merged.to,
          merged.start_km,
          merged.end_km ?? '',
          merged.distance,
          merged.remark,
          merged.amount,
        ]);
      } catch (err: any) {
        console.error('[DataStore] Error updating trip in Sheets:', err.message);
      }
    }
    return merged;
  }

  public async addFuel(fuelData: Omit<FuelRecord, 'fuel_id'>): Promise<FuelRecord> {
    const newFuel: FuelRecord = {
      ...fuelData,
      fuel_id: `fuel-${Date.now().toString().slice(-6)}`,
    };
    this.fuelRecords.unshift(newFuel);

    if (this.sheetsClient.isConfigured()) {
      try {
        const res = await this.sheetsClient.appendRow('Fuel', [
          newFuel.fuel_id,
          newFuel.date,
          newFuel.vehicle_id,
          newFuel.odometer,
          newFuel.fuel_type,
          newFuel.litres,
          newFuel.amount,
          newFuel.vendor,
          newFuel.remarks,
          newFuel.recorded_by,
          newFuel.receipt_url || '',
        ]);
        newFuel.row_index = res.rowIndex;
      } catch (err: any) {
        console.error('[DataStore] Error appending fuel record in Sheets:', err.message);
      }
    }
    return newFuel;
  }

  public async updateFuel(fuelId: string, updates: Partial<FuelRecord>): Promise<FuelRecord | null> {
    const index = this.fuelRecords.findIndex(f => f.fuel_id === fuelId);
    if (index === -1) return null;
    this.fuelRecords[index] = { ...this.fuelRecords[index], ...updates };
    const updated = this.fuelRecords[index];

    if (this.sheetsClient.isConfigured() && updated.row_index) {
      try {
        await this.sheetsClient.updateRow('Fuel', updated.row_index, [
          updated.fuel_id,
          updated.date,
          updated.vehicle_id,
          updated.odometer,
          updated.fuel_type,
          updated.litres,
          updated.amount,
          updated.vendor,
          updated.remarks,
          updated.recorded_by,
          updated.receipt_url || '',
        ]);
      } catch (err: any) {
        console.error('[DataStore] Error updating fuel in Sheets:', err.message);
      }
    }
    return updated;
  }

  public async addMaintenance(data: Omit<MaintenanceRecord, 'maintenance_id'>): Promise<MaintenanceRecord> {
    const newMaint: MaintenanceRecord = {
      ...data,
      maintenance_id: `maint-${Date.now().toString().slice(-6)}`,
    };
    this.maintenanceRecords.unshift(newMaint);

    if (this.sheetsClient.isConfigured()) {
      try {
        const res = await this.sheetsClient.appendRow('Maintenance', [
          newMaint.maintenance_id,
          newMaint.service_date,
          newMaint.vehicle_id,
          newMaint.odometer,
          newMaint.category,
          newMaint.description,
          newMaint.workshop,
          newMaint.cost,
          newMaint.next_service_due_km ?? '',
          newMaint.next_service_due_date || '',
          newMaint.notes,
          newMaint.recorded_by,
        ]);
        newMaint.row_index = res.rowIndex;
      } catch (err: any) {
        console.error('[DataStore] Error appending maintenance in Sheets:', err.message);
      }
    }
    return newMaint;
  }

  public async updateMaintenance(id: string, updates: Partial<MaintenanceRecord>): Promise<MaintenanceRecord | null> {
    const idx = this.maintenanceRecords.findIndex(m => m.maintenance_id === id);
    if (idx === -1) return null;
    this.maintenanceRecords[idx] = { ...this.maintenanceRecords[idx], ...updates };
    const updated = this.maintenanceRecords[idx];

    if (this.sheetsClient.isConfigured() && updated.row_index) {
      try {
        await this.sheetsClient.updateRow('Maintenance', updated.row_index, [
          updated.maintenance_id,
          updated.service_date,
          updated.vehicle_id,
          updated.odometer,
          updated.category,
          updated.description,
          updated.workshop,
          updated.cost,
          updated.next_service_due_km ?? '',
          updated.next_service_due_date || '',
          updated.notes,
          updated.recorded_by,
        ]);
      } catch (err: any) {
        console.error('[DataStore] Error updating maintenance in Sheets:', err.message);
      }
    }
    return updated;
  }

  public async addDocument(data: Omit<DocumentRecord, 'document_id'>): Promise<DocumentRecord> {
    const newDoc: DocumentRecord = {
      ...data,
      document_id: `doc-${Date.now().toString().slice(-6)}`,
    };
    this.documentRecords.unshift(newDoc);

    if (this.sheetsClient.isConfigured()) {
      try {
        const res = await this.sheetsClient.appendRow('Documents', [
          newDoc.document_id,
          newDoc.vehicle_id,
          newDoc.document_type,
          newDoc.document_number,
          newDoc.issue_date,
          newDoc.expiry_date,
          newDoc.issuer,
          newDoc.file_url || '',
          newDoc.notes,
          newDoc.recorded_by,
        ]);
        newDoc.row_index = res.rowIndex;
      } catch (err: any) {
        console.error('[DataStore] Error appending document in Sheets:', err.message);
      }
    }
    return newDoc;
  }

  public async updateDocument(id: string, updates: Partial<DocumentRecord>): Promise<DocumentRecord | null> {
    const idx = this.documentRecords.findIndex(d => d.document_id === id);
    if (idx === -1) return null;
    this.documentRecords[idx] = { ...this.documentRecords[idx], ...updates };
    const updated = this.documentRecords[idx];

    if (this.sheetsClient.isConfigured() && updated.row_index) {
      try {
        await this.sheetsClient.updateRow('Documents', updated.row_index, [
          updated.document_id,
          updated.vehicle_id,
          updated.document_type,
          updated.document_number,
          updated.issue_date,
          updated.expiry_date,
          updated.issuer,
          updated.file_url || '',
          updated.notes,
          updated.recorded_by,
        ]);
      } catch (err: any) {
        console.error('[DataStore] Error updating document in Sheets:', err.message);
      }
    }
    return updated;
  }

  public async addExpense(data: Omit<ExpenseRecord, 'expense_id'>): Promise<ExpenseRecord> {
    const newExp: ExpenseRecord = {
      ...data,
      expense_id: `exp-${Date.now().toString().slice(-6)}`,
    };
    this.expenseRecords.unshift(newExp);

    if (this.sheetsClient.isConfigured()) {
      try {
        const res = await this.sheetsClient.appendRow('Expenses', [
          newExp.expense_id,
          newExp.date,
          newExp.vehicle_id,
          newExp.category,
          newExp.description,
          newExp.amount,
          newExp.vendor,
          newExp.receipt_url || '',
          newExp.notes,
          newExp.recorded_by,
        ]);
        newExp.row_index = res.rowIndex;
      } catch (err: any) {
        console.error('[DataStore] Error appending expense in Sheets:', err.message);
      }
    }
    return newExp;
  }

  public async updateExpense(id: string, updates: Partial<ExpenseRecord>): Promise<ExpenseRecord | null> {
    const idx = this.expenseRecords.findIndex(e => e.expense_id === id);
    if (idx === -1) return null;
    this.expenseRecords[idx] = { ...this.expenseRecords[idx], ...updates };
    const updated = this.expenseRecords[idx];

    if (this.sheetsClient.isConfigured() && updated.row_index) {
      try {
        await this.sheetsClient.updateRow('Expenses', updated.row_index, [
          updated.expense_id,
          updated.date,
          updated.vehicle_id,
          updated.category,
          updated.description,
          updated.amount,
          updated.vendor,
          updated.receipt_url || '',
          updated.notes,
          updated.recorded_by,
        ]);
      } catch (err: any) {
        console.error('[DataStore] Error updating expense in Sheets:', err.message);
      }
    }
    return updated;
  }

  public updateSetting(key: string, value: string): void {
    const item = this.settings.find(s => s.key === key);
    if (item) {
      item.value = value;
    } else {
      this.settings.push({ key, value, description: '' });
    }
  }

  public dismissAlert(alertId: string): void {
    this.dismissedAlertIds.add(alertId);
  }

  public getDismissedAlerts(): Set<string> {
    return this.dismissedAlertIds;
  }
}
