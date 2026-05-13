import type { QRReportReason } from "../services/api";
import type { AttackInfo, ParsedQRContent } from "../types/scan";

export const FEATURE_LABELS: Record<string, string> = {
  has_ip: "Raw IP address",
  has_at_symbol: "@ symbol present",
  has_https: "HTTPS present",
  has_http: "Plain HTTP",
  has_hyphen_in_domain: "Hyphen in domain",
  num_special_chars: "Special characters",
  url_length: "URL length",
  num_dots: "Subdomains (dots)",
  num_digits: "Digit count",
  domain_length: "Domain length",
  num_slashes: "Path depth",
};

export const QR_TYPE_LABELS: Record<ParsedQRContent["type"], string> = {
  url: "URL QR",
  plain_text: "Text QR",
  email: "Email QR",
  phone: "Phone QR",
  sms: "SMS QR",
  vcard: "Contact QR",
  location: "Location QR",
  calendar: "Calendar QR",
};

export type StatusKey = "Safe" | "Suspicious" | "Unsafe";

export const STATUS_THEME: Record<
  StatusKey,
  { main: string; soft: string; bg: string; chip: string; chipLabel: string }
> = {
  Safe: { main: "#22c55e", soft: "#86efac", bg: "#f0fdf4", chip: "#bbf7d0", chipLabel: "No threats" },
  Suspicious: {
    main: "#f97316",
    soft: "#fed7aa",
    bg: "#fff7ed",
    chip: "#fed7aa",
    chipLabel: "Proceed with care",
  },
  Unsafe: { main: "#ef4444", soft: "#fca5a5", bg: "#fef2f2", chip: "#fecaca", chipLabel: "High risk" },
};

export const ATTACK_SEVERITY_THEME: Record<AttackInfo["severity"], { bg: string; border: string; text: string }> = {
  low: { bg: "#f0fdf4", border: "#bbf7d0", text: "#166534" },
  medium: { bg: "#fff7ed", border: "#fed7aa", text: "#c2410c" },
  high: { bg: "#fef2f2", border: "#fecaca", text: "#b91c1c" },
};

export const REPORT_REASONS: { label: string; value: QRReportReason }[] = [
  { label: "Fake sticker", value: "fake_sticker" },
  { label: "Payment scam", value: "payment_scam" },
  { label: "Phishing", value: "phishing" },
  { label: "Other", value: "other" },
];

const REPORT_REASON_LABELS: Record<string, string> = {
  auto_unsafe: "QRGuard unsafe scan",
  fake_sticker: "Fake sticker",
  payment_scam: "Payment scam",
  phishing: "Phishing",
  other: "Other",
};

export function formatReportReason(reason: string) {
  return REPORT_REASON_LABELS[reason] ?? reason.replace(/_/g, " ");
}

export const contribColor = (value: number) => {
  if (value >= 0.8) return "#ef4444";
  if (value >= 0.4) return "#f97316";
  if (value >= 0.2) return "#facc15";
  return "#a78bfa";
};
