import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
  Alert,
  StatusBar,
  Image,
  Linking,
  PanResponder,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import RiskGauge from "../components/RiskGauge";
import { saveScan } from "../../storage/historyStorage";
import { scanURL, submitSuspiciousQRReport, type QRReportReason } from "../services/api";
import parseQRContent from "../utils/parseQRContent";
import type { AttackInfo, BackendResult, ParsedQRContent } from "../types/scan";

const FEATURE_LABELS: Record<string, string> = {
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

const QR_TYPE_LABELS: Record<ParsedQRContent["type"], string> = {
  url: "URL QR",
  plain_text: "Text QR",
  email: "Email QR",
  phone: "Phone QR",
  sms: "SMS QR",
  vcard: "Contact QR",
  location: "Location QR",
  calendar: "Calendar QR",
};

type StatusKey = "Safe" | "Suspicious" | "Unsafe";

const STATUS_THEME: Record<
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

const ATTACK_SEVERITY_THEME: Record<AttackInfo["severity"], { bg: string; border: string; text: string }> = {
  low: { bg: "#f0fdf4", border: "#bbf7d0", text: "#166534" },
  medium: { bg: "#fff7ed", border: "#fed7aa", text: "#c2410c" },
  high: { bg: "#fef2f2", border: "#fecaca", text: "#b91c1c" },
};

const REPORT_REASONS: { label: string; value: QRReportReason }[] = [
  { label: "Fake sticker", value: "fake_sticker" },
  { label: "Payment scam", value: "payment_scam" },
  { label: "Wrong business", value: "wrong_business" },
  { label: "Phishing", value: "phishing" },
  { label: "Other", value: "other" },
];

const contribColor = (value: number) => {
  if (value >= 0.8) return "#ef4444";
  if (value >= 0.4) return "#f97316";
  if (value >= 0.2) return "#facc15";
  return "#a78bfa";
};

const getLocalFeatureContributions = (content: ParsedQRContent) => {
  const prefixFeatureMap: Record<ParsedQRContent["type"], string> = {
    url: "HTTP/HTTPS prefix detected",
    plain_text: "No structured prefix detected",
    email: "mailto prefix detected",
    phone: "tel prefix detected",
    sms: "sms/smsto prefix detected",
    vcard: "Contact card format detected",
    location: "geo prefix detected",
    calendar: "Calendar event format detected",
  };

  return [
    { feature: prefixFeatureMap[content.type], contribution: content.type === "plain_text" ? 0.55 : 0.95 },
    {
      feature: Object.keys(content.data).filter((key) => content.data[key]).length > 1 ? "Structured fields extracted" : "Single value extracted",
      contribution: 0.7,
    },
    { feature: "No URL detected", contribution: 0.6 },
  ];
};

const NON_URL_CONFIDENCE: Record<Exclude<ParsedQRContent["type"], "url">, number> = {
  plain_text: 82,
  email: 98,
  phone: 97,
  sms: 96,
  vcard: 94,
  location: 95,
  calendar: 93,
};

type ScannerScreenProps = {
  onHistorySaved?: () => void;
  onOpenBusiness?: () => void;
  onOpenHistory?: () => void;
};

export default function ScannerScreen({
  onHistorySaved,
  onOpenBusiness,
  onOpenHistory,
}: ScannerScreenProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [result, setResult] = useState<BackendResult | null>(null);
  const [parsedContent, setParsedContent] = useState<ParsedQRContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportReason, setReportReason] = useState<QRReportReason>("fake_sticker");
  const [reportLocation, setReportLocation] = useState("");
  const [reportNote, setReportNote] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportedCurrentScan, setReportedCurrentScan] = useState(false);

  const pinchStartDistance = useRef<number | null>(null);
  const pinchStartZoom = useRef(0);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission?.granted, requestPermission]);

  const clampZoom = (value: number) => Math.min(1, Math.max(0, value));

  const getPinchDistance = (touches: readonly { pageX: number; pageY: number }[]) => {
    if (touches.length < 2) return null;
    const [firstTouch, secondTouch] = touches;
    const dx = secondTouch.pageX - firstTouch.pageX;
    const dy = secondTouch.pageY - firstTouch.pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (event) => event.nativeEvent.touches.length === 2,
      onStartShouldSetPanResponderCapture: (event) => event.nativeEvent.touches.length === 2,
      onMoveShouldSetPanResponder: (event) => event.nativeEvent.touches.length === 2,
      onMoveShouldSetPanResponderCapture: (event) => event.nativeEvent.touches.length === 2,
      onPanResponderGrant: (event) => {
        const distance = getPinchDistance(event.nativeEvent.touches);
        pinchStartDistance.current = distance;
        pinchStartZoom.current = zoom;
      },
      onPanResponderMove: (event) => {
        const distance = getPinchDistance(event.nativeEvent.touches);
        if (!distance || !pinchStartDistance.current) return;

        const nextZoom = pinchStartZoom.current + (distance - pinchStartDistance.current) / 250;
        setZoom(clampZoom(nextZoom));
      },
      onPanResponderRelease: () => {
        pinchStartDistance.current = null;
      },
      onPanResponderTerminate: () => {
        pinchStartDistance.current = null;
      },
    })
  ).current;

  const resetForNewScan = () => {
    pinchStartDistance.current = null;
    pinchStartZoom.current = 0;
    setZoom(0);
    setScanned(false);
    setResult(null);
    setParsedContent(null);
    setShowDetails(false);
    setLoading(false);
    setReportVisible(false);
    setReportReason("fake_sticker");
    setReportLocation("");
    setReportNote("");
    setReportSubmitting(false);
    setReportedCurrentScan(false);
  };

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (loading || scanned) return;

    setScanned(true);
    setLoading(true);
    setResult(null);
    setShowDetails(false);

    const parsed = parseQRContent(data) as ParsedQRContent;
    setParsedContent(parsed);

    if (parsed.type !== "url") {
      try {
        await saveScan({
          id: Date.now(),
          url: parsed.displayValue,
          risk_score: 0,
          confidence: NON_URL_CONFIDENCE[parsed.type],
          status: "Safe",
          scan_type: parsed.type,
          explanation_summary: `Detected as ${QR_TYPE_LABELS[parsed.type].toLowerCase()}. No URL was found.`,
          timestamp: new Date().toISOString(),
        });
        onHistorySaved?.();
      } catch {
        Alert.alert("Storage Error", "QR content was read, but history could not be saved.");
      }
      setLoading(false);
      return;
    }

    try {
      const json = await scanURL(parsed.displayValue, parsed.type);

      setResult(json);

      try {
        await saveScan({
          id: Date.now(),
          url: json?.verified_qr?.destination_url ?? json?.qr_text ?? parsed.displayValue,
          risk_score: json?.final?.risk_score ?? 0,
          confidence: json?.final?.confidence ?? 0,
          status: json?.final?.status ?? "Unknown",
          scan_type: parsed.type,
          explanation_summary: json?.explanation?.summary,
          result: json,
          timestamp: new Date().toISOString(),
        });
        onHistorySaved?.();
      } catch {
        Alert.alert("Storage Error", "Scan completed, but history could not be saved.");
      }
    } catch (error) {
      Alert.alert("Scan Error", error instanceof Error ? error.message : "Cannot reach backend");
      resetForNewScan();
    } finally {
      setLoading(false);
    }
  };

  if (!permission) {
    return (
      <View style={s.center}>
        <Text style={s.mutedText}>Checking permissions...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={s.center}>
        <Text style={s.mutedText}>Camera permission required</Text>
        <TouchableOpacity style={s.primaryBtn} onPress={requestPermission}>
          <Text style={s.primaryBtnText}>Allow Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const status = result?.final?.status as StatusKey | undefined;
  const theme = status ? STATUS_THEME[status] : null;
  const risk = result?.final?.risk_score ?? 0;
  const conf = result?.final?.confidence ?? 0;
  const xai = result?.explanation;
  const attack = result?.attack;
  const communityReports = result?.community_reports;
  const attackTheme = attack ? ATTACK_SEVERITY_THEME[attack.severity] : null;
  const googleWebRisk = result?.external_threat_intelligence?.google_web_risk;
  const isUrlResult = parsedContent?.type === "url";
  const nonUrlEntries = parsedContent
    ? Object.entries(parsedContent.data).filter(([, value]) => value)
    : [];
  const nonUrlConfidence =
    parsedContent && parsedContent.type !== "url" ? NON_URL_CONFIDENCE[parsedContent.type] : 0;
  const nonUrlFeatureContributions = parsedContent ? getLocalFeatureContributions(parsedContent) : [];
  const nonUrlTheme = STATUS_THEME.Safe;
  const nonUrlSummary = parsedContent
    ? `This QR contains ${QR_TYPE_LABELS[parsedContent.type].toLowerCase()} data. Since it is not a web link, QR Shield skipped backend phishing analysis and displayed the extracted content locally.`
    : "";
  const nonUrlReasons = parsedContent
    ? [
        `Detected as ${QR_TYPE_LABELS[parsedContent.type].toLowerCase()}.`,
        "No URL was found, so link-risk scanning was not required.",
        "Review the extracted content before using or sharing it.",
      ]
    : [];
  const canReportScan = isUrlResult && (status === "Suspicious" || status === "Unsafe");

  const openVerifiedDestination = async () => {
    const destination = result?.verified_qr?.destination_url;
    if (!destination) return;

    try {
      await Linking.openURL(destination);
    } catch {
      Alert.alert("Unable to open website", "This destination could not be opened on your device.");
    }
  };

  const handleSubmitReport = async () => {
    if (!result || !parsedContent) return;

    try {
      setReportSubmitting(true);
      await submitSuspiciousQRReport({
        scanned_content: result.qr_text ?? parsedContent.displayValue,
        destination_url: result.verified_qr?.destination_url ?? parsedContent.displayValue,
        reason: reportReason,
        location_label: reportLocation.trim(),
        note: reportNote.trim(),
        verdict: result.final?.status,
        risk_score: result.final?.risk_score,
        confidence: result.final?.confidence,
      });
      setReportedCurrentScan(true);
      setReportVisible(false);
      setReportLocation("");
      setReportNote("");
      Alert.alert("Report submitted", "This QR has been added to the suspicious QR report log.");
    } catch (error) {
      Alert.alert("Report Error", error instanceof Error ? error.message : "Unable to submit report.");
    } finally {
      setReportSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
      <StatusBar barStyle="light-content" />

      <View style={s.header}>
        <Image source={require("../../assets/QRGaurd_logo.png")} style={s.logoImage} />
        <View>
          <Text style={s.appTitle}>QR Shield</Text>
          <Text style={s.appSub}>Security Scanner</Text>
        </View>
        <TouchableOpacity style={s.historyBtn} onPress={onOpenHistory}>
          <Text style={s.historyBtnText}>History</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.accountBtn} onPress={onOpenBusiness}>
          <Text style={s.accountBtnText}>Business</Text>
        </TouchableOpacity>
        <View style={s.liveBadge}>
          <View style={s.liveDot} />
          <Text style={s.liveText}>Live</Text>
        </View>
      </View>

      {!scanned && (
        <View style={s.cameraWrap}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            enableTorch={flashEnabled}
            zoom={zoom}
            onBarcodeScanned={handleBarCodeScanned}
          />
          <View style={s.gestureLayer} {...panResponder.panHandlers} />
          <TouchableOpacity
            style={[s.flashBtn, flashEnabled && s.flashBtnActive]}
            onPress={() => setFlashEnabled((current) => !current)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={flashEnabled ? "Turn flash off" : "Turn flash on"}
          >
            <Text style={[s.flashBtnText, flashEnabled && s.flashBtnTextActive]}>⚡</Text>
          </TouchableOpacity>
          <View style={[s.corner, s.cornerTL]} />
          <View style={[s.corner, s.cornerTR]} />
          <View style={[s.corner, s.cornerBL]} />
          <View style={[s.corner, s.cornerBR]} />
          <View style={s.scanLine} />
          <Text style={s.camHint}>Point camera at a QR code • Pinch to zoom</Text>
        </View>
      )}

      {scanned && (
        <TouchableOpacity style={s.primaryBtn} onPress={resetForNewScan}>
          <Text style={[s.primaryBtnText, s.scanAgainBtnText]}>↻ Scan Again</Text>
        </TouchableOpacity>
      )}

      {loading && (
        <View style={s.loadingRow}>
          <ActivityIndicator size="small" color="#4f46e5" />
          <Text style={s.loadingText}>Analysing...</Text>
        </View>
      )}

      {result && !loading && theme && isUrlResult && (
        <View style={s.card}>
          <View style={s.contentHeader}>
            <Text style={s.contentType}>{QR_TYPE_LABELS.url}</Text>
          </View>

          {result.verified_qr?.is_qrguard_code ? (
            <View style={[s.verifiedBox, !result.verified_qr.is_active && s.disabledVerifiedBox]}>
              <Text style={s.verifiedTitle}>
                {result.verified_qr.is_active ? "Verified QRGuard Code" : "Disabled QRGuard Code"}
              </Text>
              <Text style={s.verifiedText}>{result.verified_qr.business_name}</Text>
              <Text style={s.verifiedText}>{result.verified_qr.title}</Text>
              <Text style={s.verifiedText}>
                Type: {result.verified_qr.qr_type === "dynamic" ? "Dynamic QR" : "Static QR"}
              </Text>
              <Text style={s.verifiedText}>Scans: {result.verified_qr.scan_count}</Text>
              {result.verified_qr.warning ? <Text style={s.warningText}>{result.verified_qr.warning}</Text> : null}
              {result.verified_qr.is_active ? (
                <TouchableOpacity style={s.openWebsiteButton} onPress={openVerifiedDestination}>
                  <Text style={s.openWebsiteText}>Open Website</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          <View style={s.verdictRow}>
            <View style={[s.verdictDot, { backgroundColor: theme.main }]} />
            <Text style={[s.verdictLabel, { color: theme.soft }]}>{status}</Text>
            <View style={[s.chip, { backgroundColor: theme.bg, borderColor: theme.chip }]}>
              <Text style={[s.chipText, { color: theme.soft }]}>{theme.chipLabel}</Text>
            </View>
          </View>

          <RiskGauge risk={risk} />

          <View style={s.metricsRow}>
            <View style={s.metricBox}>
              <Text style={s.metricVal}>{conf}%</Text>
              <Text style={s.metricLbl}>Confidence</Text>
            </View>
            <View style={s.metricDivider} />
            <View style={s.metricBox}>
              <Text style={[s.metricVal, { color: theme.soft }]}>{status}</Text>
              <Text style={s.metricLbl}>Classification</Text>
            </View>
          </View>

          {xai?.summary ? (
            <View style={[s.summaryBox, { borderLeftColor: theme.main }]}>
              <Text style={s.summaryText}>{xai.summary}</Text>
            </View>
          ) : null}

          {communityReports?.matched ? (
            <>
              <Text style={s.sectionLabel}>Shared report database</Text>
              <View style={s.communityReportCard}>
                <Text style={s.communityReportTitle}>Reported suspicious QR</Text>
                <Text style={s.communityReportText}>
                  {communityReports.report_count} report(s) found for this QR.
                </Text>
                <Text style={s.communityReportText}>
                  Reasons: {communityReports.reasons.join(", ")}
                </Text>
              </View>
            </>
          ) : null}

          {canReportScan ? (
            <View style={s.reportPrompt}>
              <Text style={s.reportTitle}>Seen as a suspicious physical QR?</Text>
              <Text style={s.reportText}>
                Report possible fake stickers, payment scams, or QR codes placed over legitimate signs.
              </Text>
              <TouchableOpacity
                style={[s.reportButton, reportedCurrentScan && s.reportButtonDone]}
                onPress={() => setReportVisible(true)}
                disabled={reportedCurrentScan}
              >
                <Text style={s.reportButtonText}>
                  {reportedCurrentScan ? "Report Submitted" : "Report QR Sticker"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {attack && attackTheme ? (
            <>
              <Text style={s.sectionLabel}>Detected attack pattern</Text>
              <View style={[s.attackCard, { backgroundColor: attackTheme.bg, borderColor: attackTheme.border }]}>
                <View style={s.attackHeader}>
                  <Text style={s.attackType}>{attack.type}</Text>
                  <View style={[s.attackSeverityPill, { backgroundColor: attackTheme.border }]}>
                    <Text style={[s.attackSeverityText, { color: attackTheme.text }]}>
                      {attack.severity.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Text style={[s.attackHint, { color: attackTheme.text }]}>
                  This URL matches a known suspicious behavior pattern.
                </Text>
              </View>
            </>
          ) : null}

          {googleWebRisk?.matched ? (
            <>
              <Text style={s.sectionLabel}>External threat intelligence</Text>
              <View style={s.webRiskCard}>
                <Text style={s.webRiskTitle}>Google Web Risk Match</Text>
                <Text style={s.webRiskText}>
                  Threat lists: {googleWebRisk.threat_types.join(", ")}
                </Text>
              </View>
            </>
          ) : null}

          {xai?.reasons?.length ? (
            <>
              <Text style={s.sectionLabel}>Why this verdict?</Text>
              {xai.reasons.map((reason, index) => (
                <View key={`${reason}-${index}`} style={s.reasonRow}>
                  <View style={[s.reasonDot, { backgroundColor: index === 0 ? theme.main : "#a78bfa" }]} />
                  <Text style={s.reasonText}>{reason}</Text>
                </View>
              ))}
            </>
          ) : null}

          <TouchableOpacity style={s.toggleBtn} onPress={() => setShowDetails((current) => !current)}>
            <Text style={s.toggleText}>{showDetails ? "Hide details ▲" : "Show details ▼"}</Text>
          </TouchableOpacity>

          {showDetails ? (
            <>
              {xai?.feature_contributions?.length ? (
                <>
                  <Text style={s.sectionLabel}>Feature contributions</Text>
                  {xai.feature_contributions.slice(0, 6).map((contribution, index) => {
                    const barWidth = Math.min(Math.abs(contribution.contribution) * 110, 100);
                    const color = contribColor(contribution.contribution);
                    return (
                      <View key={`${contribution.feature}-${index}`} style={s.contribRow}>
                        <View style={s.contribNameRow}>
                          <Text style={s.contribName}>
                            {FEATURE_LABELS[contribution.feature] ?? contribution.feature}
                          </Text>
                          <Text style={[s.contribScore, { color }]}>
                            {contribution.contribution > 0 ? "+" : ""}
                            {contribution.contribution.toFixed(2)}
                          </Text>
                        </View>
                        <View style={s.contribBarBg}>
                          <View
                            style={[s.contribBarFill, { width: `${barWidth}%` as const, backgroundColor: color }]}
                          />
                        </View>
                      </View>
                    );
                  })}
                </>
              ) : null}

              <Text style={s.sectionLabel}>Model breakdown</Text>
              <View style={s.modelCard}>
                {[
                  {
                    name: "Rule-based",
                    val: `${result.rules_based?.status ?? "N/A"} — ${result.rules_based?.risk_score ?? 0}% risk`,
                  },
                  {
                    name: "Transformer",
                    val: `${result.transformer_based?.status ?? "N/A"} — ${result.transformer_based?.risk_score ?? 0}% risk`,
                  },
                  {
                    name: "Google Web Risk",
                    val: googleWebRisk
                      ? googleWebRisk.matched
                        ? `Matched — ${googleWebRisk.threat_types.join(", ")}`
                        : googleWebRisk.checked
                          ? "No match"
                          : googleWebRisk.configured
                            ? `Unavailable — ${googleWebRisk.error ?? "lookup failed"}`
                            : "Not configured"
                      : "N/A",
                    accent: googleWebRisk?.matched ? "#ef4444" : undefined,
                  },
                  {
                    name: "Fusion (weighted)",
                    val: `${status} — ${risk}% risk`,
                    accent: theme.soft,
                  },
                ].map((model, index) => (
                  <View key={model.name} style={[s.modelRow, index === 3 && { borderBottomWidth: 0 }]}>
                    <Text style={s.modelName}>{model.name}</Text>
                    <Text style={[s.modelVal, model.accent ? { color: model.accent } : null]}>{model.val}</Text>
                  </View>
                ))}
              </View>

              <Text style={s.sectionLabel}>Scanned URL</Text>
              <View style={s.urlBox}>
                <Text style={s.urlText}>{result.qr_text}</Text>
              </View>

              {result.verified_qr?.destination_url ? (
                <>
                  <Text style={s.sectionLabel}>Verified destination</Text>
                  <View style={s.urlBox}>
                    <Text style={s.urlText}>{result.verified_qr.destination_url}</Text>
                  </View>
                </>
              ) : null}
            </>
          ) : null}
        </View>
      )}

      {parsedContent && !loading && parsedContent.type !== "url" && (
        <View style={s.card}>
          <View style={s.contentHeader}>
            <Text style={s.contentType}>{QR_TYPE_LABELS[parsedContent.type]}</Text>
          </View>

          <View style={s.verdictRow}>
            <View style={[s.verdictDot, { backgroundColor: nonUrlTheme.main }]} />
            <Text style={[s.verdictLabel, { color: nonUrlTheme.soft }]}>Safe</Text>
            <View style={[s.chip, { backgroundColor: nonUrlTheme.bg, borderColor: nonUrlTheme.chip }]}>
              <Text style={[s.chipText, { color: nonUrlTheme.soft }]}>No link detected</Text>
            </View>
          </View>

          <RiskGauge risk={0} />

          <View style={s.metricsRow}>
            <View style={s.metricBox}>
              <Text style={s.metricVal}>{nonUrlConfidence}%</Text>
              <Text style={s.metricLbl}>Confidence</Text>
            </View>
            <View style={s.metricDivider} />
            <View style={s.metricBox}>
              <Text style={[s.metricVal, { color: nonUrlTheme.soft }]}>0%</Text>
              <Text style={s.metricLbl}>Risk score</Text>
            </View>
          </View>

          <View style={[s.summaryBox, { borderLeftColor: nonUrlTheme.main }]}>
            <Text style={s.summaryText}>{nonUrlSummary}</Text>
          </View>

          <Text style={s.sectionLabel}>Why this verdict?</Text>
          {nonUrlReasons.map((reason, index) => (
            <View key={`${reason}-${index}`} style={s.reasonRow}>
              <View style={[s.reasonDot, { backgroundColor: index === 0 ? nonUrlTheme.main : "#a78bfa" }]} />
              <Text style={s.reasonText}>{reason}</Text>
            </View>
          ))}

          <TouchableOpacity style={s.toggleBtn} onPress={() => setShowDetails((current) => !current)}>
            <Text style={s.toggleText}>{showDetails ? "Hide details ▲" : "Show details ▼"}</Text>
          </TouchableOpacity>

          {showDetails ? (
            <>
              <Text style={s.sectionLabel}>Feature contributions</Text>
              {nonUrlFeatureContributions.map((contribution, index) => {
                const barWidth = Math.min(Math.abs(contribution.contribution) * 110, 100);
                const color = contribColor(contribution.contribution);
                return (
                  <View key={`${contribution.feature}-${index}`} style={s.contribRow}>
                    <View style={s.contribNameRow}>
                      <Text style={s.contribName}>{contribution.feature}</Text>
                      <Text style={[s.contribScore, { color }]}>
                        +{contribution.contribution.toFixed(2)}
                      </Text>
                    </View>
                    <View style={s.contribBarBg}>
                      <View
                        style={[s.contribBarFill, { width: `${barWidth}%` as const, backgroundColor: color }]}
                      />
                    </View>
                  </View>
                );
              })}

              <Text style={s.sectionLabel}>Model breakdown</Text>
              <View style={s.modelCard}>
                {[
                  { name: "Content parser", val: QR_TYPE_LABELS[parsedContent.type] },
                  { name: "URL analyzer", val: "Skipped — non-URL content" },
                  { name: "Risk score", val: "0% risk", accent: nonUrlTheme.soft },
                ].map((model, index) => (
                  <View key={model.name} style={[s.modelRow, index === 2 && { borderBottomWidth: 0 }]}>
                    <Text style={s.modelName}>{model.name}</Text>
                    <Text style={[s.modelVal, model.accent ? { color: model.accent } : null]}>{model.val}</Text>
                  </View>
                ))}
              </View>

              <Text style={s.sectionLabel}>Extracted content</Text>
              {nonUrlEntries.length > 0 ? (
                nonUrlEntries.map(([key, value]) => (
                  <View key={key} style={s.contentRow}>
                    <Text style={s.contentLabel}>{key.replace(/_/g, " ")}</Text>
                    <Text style={s.contentValue}>{value}</Text>
                  </View>
                ))
              ) : (
                <View style={s.contentBox}>
                  <Text style={s.contentValue}>{parsedContent.displayValue}</Text>
                </View>
              )}
            </>
          ) : null}
        </View>
      )}

      <Modal
        transparent
        animationType="fade"
        visible={reportVisible}
        onRequestClose={() => setReportVisible(false)}
      >
        <View style={s.modalBackdrop}>
          <View style={s.reportModal}>
            <Text style={s.modalTitle}>Report suspicious QR</Text>
            <Text style={s.modalHelp}>
              Add what you noticed. Location and notes are optional, but useful for spotting repeated fake stickers.
            </Text>

            <Text style={s.reportFieldLabel}>Reason</Text>
            <View style={s.reasonGrid}>
              {REPORT_REASONS.map((reason) => (
                <TouchableOpacity
                  key={reason.value}
                  style={[s.reasonChip, reportReason === reason.value && s.reasonChipActive]}
                  onPress={() => setReportReason(reason.value)}
                >
                  <Text style={[s.reasonChipText, reportReason === reason.value && s.reasonChipTextActive]}>
                    {reason.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.reportFieldLabel}>Location</Text>
            <TextInput
              value={reportLocation}
              onChangeText={setReportLocation}
              placeholder="e.g. Parking meter on Grafton Street"
              placeholderTextColor={MUTED}
              style={s.reportInput}
            />

            <Text style={s.reportFieldLabel}>Note</Text>
            <TextInput
              value={reportNote}
              onChangeText={setReportNote}
              placeholder="What made it look suspicious?"
              placeholderTextColor={MUTED}
              multiline
              maxLength={500}
              style={[s.reportInput, s.reportTextArea]}
            />

            <View style={s.modalActions}>
              <TouchableOpacity
                style={s.modalCancelButton}
                onPress={() => setReportVisible(false)}
                disabled={reportSubmitting}
              >
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.modalSubmitButton}
                onPress={handleSubmitReport}
                disabled={reportSubmitting}
              >
                {reportSubmitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={s.modalSubmitText}>Submit Report</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const BG = "#ecf0f5";
const CARD = "#ffffff";
const SURF = "#f0f4f9";
const BORDER = "#cbd5e1";
const PURPLE = "#4f46e5";
const TEXT = "#1f2937";
const MUTED = "#6b7280";
const SOFT = "#4f46e5";

const s = StyleSheet.create({
  container: { alignItems: "center", backgroundColor: BG, paddingTop: 56, paddingHorizontal: 18 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: BG, gap: 14 },
  mutedText: { color: MUTED, fontSize: 14 },

  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 22, width: "100%" },
  logoImage: { width: 50, height: 50, resizeMode: "contain" },
  appTitle: { fontSize: 17, fontWeight: "600", color: TEXT },
  appSub: { fontSize: 11, color: MUTED, marginTop: 1 },
  historyBtn: {
    marginLeft: "auto",
    backgroundColor: CARD,
    borderWidth: 0.5,
    borderColor: BORDER,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  historyBtnText: { color: PURPLE, fontSize: 12, fontWeight: "600" },
  accountBtn: {
    backgroundColor: "#eef2ff",
    borderWidth: 0.5,
    borderColor: PURPLE,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  accountBtnText: { color: PURPLE, fontSize: 12, fontWeight: "600" },
  signInPrompt: {
    width: "100%",
    backgroundColor: CARD,
    borderWidth: 0.5,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 12,
    marginTop: -10,
    marginBottom: 16,
  },
  signInPromptText: { color: MUTED, fontSize: 12.5, textAlign: "center" },
  signedInText: {
    width: "100%",
    color: MUTED,
    fontSize: 12,
    marginTop: -10,
    marginBottom: 16,
    textAlign: "center",
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: SURF,
    borderWidth: 0.5,
    borderColor: PURPLE,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#4ade80" },
  liveText: { fontSize: 11, color: SOFT },

  cameraWrap: {
    width: "100%",
    height: 240,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: PURPLE,
    marginBottom: 18,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  gestureLayer: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
  flashBtn: {
    position: "absolute",
    top: 34,
    right: 14,
    zIndex: 3,
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.26)",
    alignItems: "center",
    justifyContent: "center",
  },
  flashBtnActive: { backgroundColor: "#facc15", borderColor: "#fde68a" },
  flashBtnText: { color: "#f8fafc", fontSize: 13, fontWeight: "700", lineHeight: 14 },
  flashBtnTextActive: { color: "#713f12" },
  corner: { position: "absolute", width: 22, height: 22, borderColor: PURPLE, borderStyle: "solid" },
  cornerTL: { top: 14, left: 14, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 4 },
  cornerTR: { top: 14, right: 14, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 4 },
  cornerBL: { bottom: 14, left: 14, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 14, right: 14, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 4 },
  scanLine: { position: "absolute", left: 14, right: 14, height: 1.5, backgroundColor: "#4f46e5", top: "45%" },
  camHint: { fontSize: 12, color: MUTED, marginBottom: 14 },

  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  loadingText: { fontSize: 13, color: SOFT },

  card: { width: "100%", backgroundColor: CARD, borderRadius: 18, borderWidth: 0.5, borderColor: BORDER, padding: 18, marginBottom: 14 },
  contentHeader: { marginBottom: 10 },
  contentType: { fontSize: 18, fontWeight: "600", color: TEXT },
  contentRow: { paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: BORDER, gap: 4 },
  contentLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase", color: MUTED },
  contentValue: { fontSize: 13, color: TEXT, lineHeight: 20 },
  contentBox: { backgroundColor: SURF, borderRadius: 10, borderWidth: 0.5, borderColor: BORDER, padding: 12 },
  verdictRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  verdictDot: { width: 10, height: 10, borderRadius: 5 },
  verdictLabel: { fontSize: 22, fontWeight: "600" },
  chip: { marginLeft: "auto", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, borderWidth: 0.5 },
  chipText: { fontSize: 11, fontWeight: "500" },

  metricsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SURF,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: BORDER,
    marginBottom: 14,
    overflow: "hidden",
  },
  metricBox: { flex: 1, alignItems: "center", paddingVertical: 12 },
  metricVal: { fontSize: 20, fontWeight: "600", color: TEXT },
  metricLbl: { fontSize: 10, color: MUTED, marginTop: 2 },
  metricDivider: { width: 0.5, height: 36, backgroundColor: BORDER },

  summaryBox: { borderLeftWidth: 2.5, paddingLeft: 10, marginBottom: 14 },
  summaryText: { fontSize: 12.5, color: SOFT, lineHeight: 20 },
  reportPrompt: {
    backgroundColor: "#fff7ed",
    borderWidth: 0.5,
    borderColor: "#fed7aa",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  reportTitle: { color: TEXT, fontSize: 14, fontWeight: "700", marginBottom: 4 },
  reportText: { color: MUTED, fontSize: 12.5, lineHeight: 18, marginBottom: 10 },
  reportButton: {
    backgroundColor: "#f97316",
    borderRadius: 10,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  reportButtonDone: { backgroundColor: "#22c55e" },
  reportButtonText: { color: "#ffffff", fontSize: 12.5, fontWeight: "700" },
  verifiedBox: {
    backgroundColor: "#f0fdf4",
    borderWidth: 0.5,
    borderColor: "#86efac",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  disabledVerifiedBox: {
    backgroundColor: "#fef2f2",
    borderColor: "#fca5a5",
  },
  verifiedTitle: { color: "#166534", fontSize: 14, fontWeight: "700", marginBottom: 4 },
  verifiedText: { color: TEXT, fontSize: 12.5, lineHeight: 18 },
  warningText: { color: "#b91c1c", fontSize: 12.5, lineHeight: 18, marginTop: 6 },
  openWebsiteButton: {
    backgroundColor: PURPLE,
    borderRadius: 10,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginTop: 10,
  },
  openWebsiteText: { color: "#ffffff", fontSize: 12.5, fontWeight: "700" },

  attackCard: { borderRadius: 12, borderWidth: 0.5, padding: 12, marginBottom: 4 },
  attackHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  attackType: { flex: 1, fontSize: 15, fontWeight: "600", color: TEXT },
  attackSeverityPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  attackSeverityText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8 },
  attackHint: { fontSize: 12.5, lineHeight: 18 },
  webRiskCard: {
    backgroundColor: "#fef2f2",
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: "#fecaca",
    padding: 12,
    marginBottom: 4,
  },
  webRiskTitle: { color: "#b91c1c", fontSize: 14, fontWeight: "700", marginBottom: 4 },
  webRiskText: { color: TEXT, fontSize: 12.5, lineHeight: 18 },
  communityReportCard: {
    backgroundColor: "#fff7ed",
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: "#fed7aa",
    padding: 12,
    marginBottom: 4,
  },
  communityReportTitle: { color: "#c2410c", fontSize: 14, fontWeight: "700", marginBottom: 4 },
  communityReportText: { color: TEXT, fontSize: 12.5, lineHeight: 18 },

  sectionLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.9,
    textTransform: "uppercase",
    color: MUTED,
    marginTop: 14,
    marginBottom: 8,
  },
  reasonRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 7 },
  reasonDot: { width: 5, height: 5, borderRadius: 3, marginTop: 6, flexShrink: 0 },
  reasonText: { fontSize: 12.5, color: SOFT, flex: 1, lineHeight: 19 },

  toggleBtn: {
    alignSelf: "center",
    marginTop: 14,
    paddingVertical: 7,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: PURPLE,
  },
  toggleText: { color: "#4f46e5", fontSize: 13 },

  contribRow: { marginBottom: 8 },
  contribNameRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  contribName: { fontSize: 11, color: MUTED },
  contribScore: { fontSize: 11 },
  contribBarBg: { height: 4, backgroundColor: "#d1d5db", borderRadius: 3, overflow: "hidden" },
  contribBarFill: { height: "100%", borderRadius: 3 },

  modelCard: { backgroundColor: SURF, borderRadius: 10, borderWidth: 0.5, borderColor: BORDER, overflow: "hidden" },
  modelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
  },
  modelName: { fontSize: 12, color: MUTED },
  modelVal: { fontSize: 12, color: SOFT },

  urlBox: { backgroundColor: SURF, borderRadius: 8, borderWidth: 0.5, borderColor: BORDER, padding: 10, marginTop: 2 },
  urlText: { fontSize: 10.5, color: MUTED, lineHeight: 16 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.56)",
    justifyContent: "center",
    padding: 18,
  },
  reportModal: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
  },
  modalTitle: { color: TEXT, fontSize: 19, fontWeight: "700", marginBottom: 6 },
  modalHelp: { color: MUTED, fontSize: 12.5, lineHeight: 18, marginBottom: 14 },
  reportFieldLabel: {
    color: MUTED,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    marginBottom: 7,
  },
  reasonGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  reasonChip: {
    backgroundColor: SURF,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  reasonChipActive: { backgroundColor: PURPLE, borderColor: PURPLE },
  reasonChipText: { color: MUTED, fontSize: 12, fontWeight: "700" },
  reasonChipTextActive: { color: "#ffffff" },
  reportInput: {
    backgroundColor: SURF,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    color: TEXT,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  reportTextArea: { minHeight: 84, textAlignVertical: "top" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 2 },
  modalCancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 11,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelText: { color: TEXT, fontSize: 13, fontWeight: "700" },
  modalSubmitButton: {
    flex: 1,
    backgroundColor: PURPLE,
    borderRadius: 11,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  modalSubmitText: { color: "#ffffff", fontSize: 13, fontWeight: "700" },

  primaryBtn: {
    backgroundColor: PURPLE,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 36,
    marginTop: 4,
    marginBottom: 4,
  },
  primaryBtnText: { color: TEXT, fontSize: 14, fontWeight: "600", textAlign: "center" },
  scanAgainBtnText: { color: "#e5e7eb" },
});
