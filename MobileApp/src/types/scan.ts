export type Contribution = { feature: string; contribution: number; tier: string };
export type Explanation = {
  summary: string;
  reasons: string[];
  feature_contributions: Contribution[];
};
export type AttackInfo = { type: string; severity: "low" | "medium" | "high" };

export type BackendResult = {
  qr_text?: string;
  final?: { status: "Safe" | "Suspicious" | "Unsafe"; confidence: number; risk_score: number };
  community_reports?: {
    matched: boolean;
    report_count: number;
    reasons: string[];
    latest_reported_at?: string | null;
    warning?: string | null;
  };
  external_threat_intelligence?: {
    google_web_risk?: {
      provider: string;
      configured: boolean;
      checked: boolean;
      matched: boolean;
      threat_types: string[];
      error?: string | null;
    };
  };
  rules_based?: { status: string; risk_score: number };
  transformer_based?: { status: string; risk_score: number };
  explanation?: Explanation;
  attack?: AttackInfo;
  verified_qr?: {
    is_qrguard_code: boolean;
    is_active: boolean;
    qr_type: "static" | "dynamic";
    business_name: string;
    title: string;
    description: string;
    destination_url: string;
    verification_url: string;
    qr_value: string;
    scan_count: number;
    warning?: string | null;
    last_verified_at: string;
  };
};

export type ParsedQRContent = {
  type: "url" | "plain_text" | "email" | "phone" | "sms" | "vcard" | "location" | "calendar";
  data: Record<string, string>;
  displayValue: string;
};
