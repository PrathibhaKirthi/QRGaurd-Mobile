import axios from "axios";
import * as SecureStore from "expo-secure-store";
import type { AdvancedScan, BackendResult } from "../types/scan";

const API_BASE_URL = "http://172.20.10.3:5000";
const TOKEN_KEY = "qrguard_auth_token";
const USER_KEY = "qrguard_auth_user";

export type AuthUser = {
  id: number;
  email: string;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};

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

api.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
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

export async function getToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getStoredUser() {
  const storedUser = await SecureStore.getItemAsync(USER_KEY);
  if (!storedUser) return null;

  try {
    return JSON.parse(storedUser) as AuthUser;
  } catch {
    await SecureStore.deleteItemAsync(USER_KEY);
    return null;
  }
}

export async function saveSession(auth: AuthResponse) {
  await SecureStore.setItemAsync(TOKEN_KEY, auth.token);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(auth.user));
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}

export async function login(email: string, password: string) {
  try {
    const response = await api.post<AuthResponse>("/auth/login", { email, password });
    await saveSession(response.data);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to log in."));
  }
}

export async function register(email: string, password: string) {
  try {
    const response = await api.post<AuthResponse>("/auth/register", { email, password });
    await saveSession(response.data);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to create account."));
  }
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

export async function fetchCloudHistory() {
  try {
    const response = await api.get<{ history: unknown[] }>("/history");
    return response.data.history;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      throw new Error("Sign in to sync scan history across devices.");
    }
    throw new Error(getErrorMessage(error, "Unable to load cloud history."));
  }
}

export async function saveCloudHistoryItem(payload: unknown) {
  try {
    const response = await api.post<{ history_item: unknown }>("/history", payload);
    return response.data.history_item;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      throw new Error("Sign in to save scan history to the cloud.");
    }
    throw new Error(getErrorMessage(error, "Unable to save cloud history."));
  }
}

export async function clearCloudHistory() {
  try {
    await api.delete("/history");
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      throw new Error("Sign in to clear cloud history.");
    }
    throw new Error(getErrorMessage(error, "Unable to clear cloud history."));
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
