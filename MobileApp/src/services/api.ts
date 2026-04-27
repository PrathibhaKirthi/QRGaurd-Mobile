import axios from "axios";
import * as SecureStore from "expo-secure-store";
import type { BackendResult } from "../types/scan";

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

export type BusinessQRCode = {
  id: number;
  code_id: string;
  title: string;
  business_name: string;
  destination_url: string;
  description: string;
  qr_type: "static";
  active: boolean;
  scan_count: number;
  risk_score: number;
  confidence: number;
  verdict: "Safe" | "Suspicious" | "Unsafe" | "Unknown";
  explanation_summary?: string;
  verification_url: string;
  qr_value: string;
  created_at: string;
  updated_at: string;
};

export type BusinessQRCodeInput = {
  title: string;
  business_name: string;
  destination_url: string;
  description: string;
  qr_type: "static";
  active?: boolean;
};

export type QRReportReason =
  | "fake_sticker"
  | "payment_scam"
  | "wrong_business"
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

export async function submitSuspiciousQRReport(payload: QRReportInput) {
  try {
    const response = await api.post("/reports", payload);
    return response.data.report;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to submit report."));
  }
}

export async function fetchBusinessQRCodes() {
  try {
    const response = await api.get<{ qr_codes: BusinessQRCode[] }>("/business/qrcodes");
    return response.data.qr_codes;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      await clearSession();
      throw new Error("Your business session has expired. Please log in again.");
    }
    throw new Error(getErrorMessage(error, "Unable to load QR codes."));
  }
}

export async function createBusinessQRCode(payload: BusinessQRCodeInput) {
  try {
    const response = await api.post<{ qr_code: BusinessQRCode }>("/business/qrcodes", payload);
    return response.data.qr_code;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      await clearSession();
      throw new Error("Your business session has expired. Please log in again.");
    }
    throw new Error(getErrorMessage(error, "Unable to create QR code."));
  }
}

export async function updateBusinessQRCode(id: number, payload: BusinessQRCodeInput) {
  try {
    const response = await api.put<{ qr_code: BusinessQRCode }>(`/business/qrcodes/${id}`, payload);
    return response.data.qr_code;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      await clearSession();
      throw new Error("Your business session has expired. Please log in again.");
    }
    throw new Error(getErrorMessage(error, "Unable to update QR code."));
  }
}

export async function deleteBusinessQRCode(id: number) {
  try {
    await api.delete(`/business/qrcodes/${id}`);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      await clearSession();
      throw new Error("Your business session has expired. Please log in again.");
    }
    throw new Error(getErrorMessage(error, "Unable to delete QR code."));
  }
}
