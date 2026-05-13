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
};

export type AdvancedScanEvidence = {
  original_url?: string;
  final_url?: string;
  final_host?: string;
  page_title?: string;
  visible_text_sample?: string;
  redirect_chain?: string[];
  form_fields?: { type?: string; name?: string; id?: string; placeholder?: string }[];
  buttons?: string[];
  links?: { text?: string; href?: string }[];
  network_domains?: string[];
  request_count?: number;
  downloads?: { suggested_filename?: string; url?: string }[];
  popups?: string[];
  console_errors?: string[];
  safe_interactions?: string[];
  risk_signals?: string[];
  scanned_at?: string;
};

export type AdvancedScanResult = {
  provider?: string;
  model?: string;
  configured?: boolean;
  status?: "Safe" | "Suspicious" | "Unsafe";
  risk_score?: number;
  confidence?: number;
  summary?: string;
  reasons?: string[];
  recommended_action?: string;
};

export type AdvancedScan = {
  scan_id: string;
  status: "pending" | "complete" | "failed";
  qr_text: string;
  target_url: string;
  static_result?: BackendResult;
  evidence?: AdvancedScanEvidence;
  llm_result?: AdvancedScanResult;
  error?: string | null;
  screenshot_url?: string | null;
  created_at: string;
  completed_at?: string | null;
  viewed_at?: string | null;
  expires_at: string;
};

export type ParsedQRContent = {
  type: "url" | "plain_text" | "email" | "phone" | "sms" | "vcard" | "location" | "calendar";
  data: Record<string, string>;
  displayValue: string;
};
