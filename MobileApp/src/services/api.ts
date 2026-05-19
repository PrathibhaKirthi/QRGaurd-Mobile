import axios from "axios";
import type { AdvancedScan, BackendResult } from "../types/scan";

const API_BASE_URL = "http://172.20.10.3:5000";

export interface ScanResponse {
  status: string;
  message: string;
}

export type QRReportReason =
  | "fake_sticker"
  | "payment_scam"
  | "phishing"
  | "other";

export type QRReportInput = {
  scanned_content: string;
  destination_url?: string;
  reason: QRReportReason;
  note?: string;
  location_label?: string;
  latitude?: number;
  longitude?: number;
  verdict?: string;
  risk_score?: number;
  confidence?: number;
};

export const api = axios.create({
  baseURL: API_BASE_URL,
});

function getErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.error;
    if (typeof message === "string") {
      return message;
    }
  }
  return fallback;
}

export async function scanURL(url: string, scanType = "url") {
  try {
    const response = await api.post<BackendResult>("/scan", {
      url,
      scan_type: scanType,
    });

    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Cannot reach backend."));
  }
}

export async function startAdvancedScan(payload: {
  url: string;
  qr_text?: string;
  static_result?: BackendResult;
  expo_push_token?: string | null;
}) {
  try {
    const response = await api.post<{ scan: AdvancedScan }>("/advanced-scan/start", payload);
    return response.data.scan;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to start Advanced Scan."));
  }
}

export async function fetchAdvancedScan(scanId: string) {
  try {
    const response = await api.get<{ scan: AdvancedScan }>(`/advanced-scan/${scanId}`);
    return response.data.scan;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to load Advanced Scan."));
  }
}

export async function markAdvancedScanViewed(scanId: string) {
  try {
    const response = await api.post<{ scan: AdvancedScan }>(`/advanced-scan/${scanId}/viewed`);
    return response.data.scan;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to update Advanced Scan."));
  }
}

export async function submitSuspiciousQRReport(payload: QRReportInput) {
  try {
    const response = await api.post("/reports", payload);
    return response.data.report;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to submit report."));
  }
}
