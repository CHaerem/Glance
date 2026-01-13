/**
 * Device Type Definitions
 * ESP32 device status, battery monitoring, OTA updates
 */

// Battery history entry
export interface BatteryHistoryEntry {
  timestamp: number;
  voltage: number;
  isCharging: boolean;
  isDisplayUpdate: boolean;
}

// Signal strength history entry
export interface SignalHistoryEntry {
  timestamp: number;
  rssi: number;
}

// Brownout event record
export interface BrownoutEvent {
  timestamp: number;
  brownoutNumber: number;
  batteryVoltage: number;
  batteryPercent: number;
  status: string;
  displayUpdatesThisCycle: number;
  wakesThisCycle: number;
}

// OTA update event
export interface OTAEvent {
  timestamp: number;
  fromVersion: string;
  toVersion: string;
  success: boolean;
  error?: string;
}

// Operation sample for battery consumption analysis
export interface OperationSample {
  timestamp: number;
  type: 'display' | 'ota' | 'wake';
  voltageBefore: number;
  voltageAfter: number;
  voltageDrop: number;
  firmwareVersion: string;
  signalStrength: number;
}

// Battery session (charge cycle)
export interface BatterySession {
  startTime: number;
  startVoltage: number;
  startPercent: number;
  firmwareVersions: string[];
  wakes: number;
  displayUpdates: number;
  otaUpdates: number;
  totalVoltageDrop: number;
  displayVoltageDrop: number;
  wakeVoltageDrop: number;
  otaVoltageDrop: number;
  endTime?: number;
  endVoltage?: number;
  endPercent?: number;
  duration?: number;
}

// Usage statistics
export interface UsageStats {
  totalWakes: number;
  totalDisplayUpdates: number;
  totalVoltageDrop: number;
  lastFullCharge: number | null;
  wakesThisCycle: number;
  displayUpdatesThisCycle: number;
  voltageAtFullCharge: number | null;
  displayUpdateVoltageDrop: number;
  nonDisplayVoltageDrop: number;
  otaUpdateVoltageDrop: number;
  otaUpdateCount: number;
}

// Profiling telemetry data
export interface ProfilingEntry {
  timestamp: string;
  displayInitMs: number;
  wifiConnectMs: number;
  otaCheckMs: number;
  metadataFetchMs: number;
  imageDownloadMs: number;
  displayRefreshMs: number;
  totalWakeMs: number;
  hasDisplayUpdate: boolean;
  batteryVoltage: number;
  firmwareVersion: string;
  signalStrength: number;
}

// Charging source tracking
export type ChargingSource = 'esp32' | 'voltage_rise' | 'trend_override' | 'none';

// Device status (stored in devices.json)
export interface DeviceStatus {
  deviceId: string;
  batteryVoltage: number;
  batteryPercent: number | null;
  isCharging: boolean;
  chargingSource: ChargingSource;
  lastChargeTimestamp: number | null;
  batteryHistory: BatteryHistoryEntry[];
  usageStats: UsageStats;
  batterySessions: BatterySession[];
  currentSession: BatterySession | null;
  operationSamples: OperationSample[];
  signalStrength: number;
  signalHistory: SignalHistoryEntry[];
  freeHeap: number;
  bootCount: number;
  brownoutCount: number;
  brownoutHistory: BrownoutEvent[];
  firmwareVersion: string | null;
  otaHistory: OTAEvent[];
  profilingHistory: ProfilingEntry[];
  status: string;
  lastSeen: number;
}

// Device status report from ESP32
export interface DeviceStatusReport {
  deviceId: string;
  status: {
    status: string;
    batteryVoltage?: string | number;
    batteryPercent?: string | number;
    isCharging?: boolean;
    signalStrength?: string | number;
    freeHeap?: string | number;
    bootCount?: string | number;
    brownoutCount?: string | number;
    firmwareVersion?: string;
    usedFallback?: boolean;
  };
  profiling?: {
    displayInitMs?: string | number;
    wifiConnectMs?: string | number;
    otaCheckMs?: string | number;
    metadataFetchMs?: string | number;
    imageDownloadMs?: string | number;
    displayRefreshMs?: string | number;
    totalWakeMs?: string | number;
    hasDisplayUpdate?: boolean;
  };
}

// Device command
export interface DeviceCommand {
  command: 'stay_awake' | 'force_update' | 'update_now' | 'enable_streaming' | 'disable_streaming';
  duration: number;
  timestamp: number;
  deviceId: string;
}

// Battery estimate for UI
export interface BatteryEstimate {
  hoursRemaining: number;
  cyclesRemaining: number;
  confidence: number;
  avgDropPerWake: number;
  displayUpdateRatio: number;
  dataPoints: number;
}

// Firmware analysis entry
export interface FirmwareAnalysis {
  version: string;
  displayCount: number;
  wakeCount: number;
  otaCount: number;
  totalSamples: number;
  avgDisplayDropMv: number | null;
  avgWakeDropMv: number | null;
  avgOtaDropMv: number | null;
  firstSeen: number;
  lastSeen: number;
}

// ESP32 status response (GET /api/esp32-status)
export interface ESP32StatusResponse {
  state: 'online' | 'offline';
  deviceId: string | null;
  batteryVoltage: number | null;
  batteryPercent: number | null;
  isCharging: boolean;
  chargingSource: ChargingSource | 'unknown';
  lastChargeTimestamp: number | null;
  batteryHistory: BatteryHistoryEntry[];
  batteryEstimate: BatteryEstimate | null;
  usageStats: UsageStats | null;
  batterySessions: BatterySession[];
  currentSession: BatterySession | null;
  operationSamples: OperationSample[];
  firmwareAnalysis: FirmwareAnalysis[];
  signalStrength: number | null;
  signalHistory: SignalHistoryEntry[];
  lastSeen: number | null;
  sleepDuration: number | null;
  freeHeap: number | null;
  brownoutCount: number;
  brownoutHistory: BrownoutEvent[];
  firmwareVersion: string | null;
  otaHistory: OTAEvent[];
  profilingHistory: ProfilingEntry[];
  status: string | null;
  currentImage: string | null;
}
