import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import QRCode from "react-native-qrcode-svg";
import { captureRef } from "react-native-view-shot";
import { scanURL } from "../services/api";
import type { BackendResult } from "../types/scan";

const BG = "#ecf0f5";
const CARD = "#ffffff";
const BORDER = "#cbd5e1";
const TEXT = "#111827";
const MUTED = "#6b7280";
const PURPLE = "#4f46e5";
const SOFT = "#eef2ff";

type QRGeneratorScreenProps = {
  initialError?: string;
  initialUrl?: string;
  onBack: () => void;
};

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isValidUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function visibleUrl(value: string) {
  if (value.length <= 72) return value;
  return `${value.slice(0, 34)}...${value.slice(-30)}`;
}

function getDomain(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function getStaticWarnings(value: string, scanResult: BackendResult | null) {
  const warnings: string[] = [];
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "http:") {
      warnings.push("Uses HTTP instead of HTTPS.");
    }
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(parsed.hostname)) {
      warnings.push("Uses a raw IP address instead of a domain.");
    }
    if (["bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "ow.ly"].includes(parsed.hostname.replace(/^www\./i, ""))) {
      warnings.push("Uses a shortened URL, so the final destination may be less obvious.");
    }
    if (/(login|verify|account|password|signin|wallet)/i.test(value)) {
      warnings.push("Contains account or credential-related wording.");
    }
    if (value.length > 120) {
      warnings.push("Long URL. Check that the visible destination is what you expect.");
    }
  } catch {
    return warnings;
  }

  const reasons = scanResult?.explanation?.reasons ?? [];
  return [...warnings, ...reasons.slice(0, 2)].slice(0, 4);
}

function formatGeneratedAt(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function QRGeneratorScreen({ initialError = "", initialUrl = "", onBack }: QRGeneratorScreenProps) {
  const [url, setUrl] = useState(initialUrl);
  const [generatedUrl, setGeneratedUrl] = useState("");
  const [generatedAt, setGeneratedAt] = useState("");
  const [error, setError] = useState(initialError);
  const [checkingSafety, setCheckingSafety] = useState(false);
  const [safetyResult, setSafetyResult] = useState<BackendResult | null>(null);
  const cardRef = useRef<View>(null);
  const generatedDomain = generatedUrl ? getDomain(generatedUrl) : "";
  const safetyStatus = safetyResult?.final?.status ?? "Unknown";
  const staticWarnings = generatedUrl ? getStaticWarnings(generatedUrl, safetyResult) : [];

  const generateAfterSafetyCheck = async (value: string) => {
    const normalized = normalizeUrl(value);
    setGeneratedUrl("");
    setGeneratedAt("");
    setSafetyResult(null);

    if (!normalized) {
      setError("Enter a URL to generate a QR code.");
      return;
    }
    if (!isValidUrl(normalized)) {
      setError("Enter a valid HTTP or HTTPS URL.");
      return;
    }

    setUrl(normalized);
    setError("");
    setCheckingSafety(true);

    try {
      const scanResult = await scanURL(normalized, "url");
      setSafetyResult(scanResult);

      const status = scanResult.final?.status ?? "Unknown";
      if (status === "Safe") {
        setGeneratedUrl(normalized);
        setGeneratedAt(new Date().toISOString());
        setError("");
        return;
      }

      setGeneratedUrl("");
      setError(
        status === "Unknown"
          ? "QRGuard could not confirm this URL is safe, so the QR code was not generated."
          : `QRGuard marked this URL as ${status}. The QR code was not generated.`
      );
    } catch (scanError) {
      setGeneratedUrl("");
      setError(scanError instanceof Error ? scanError.message : "QRGuard safety check failed.");
    } finally {
      setCheckingSafety(false);
    }
  };

  useEffect(() => {
    if (initialUrl) {
      const normalized = normalizeUrl(initialUrl);
      setUrl(normalized);
      if (isValidUrl(normalized)) {
        generateAfterSafetyCheck(normalized);
      }
    } else if (initialError) {
      setUrl("");
      setGeneratedUrl("");
      setGeneratedAt("");
      setSafetyResult(null);
      setError(initialError);
    }
  }, [initialError, initialUrl]);

  const handleGenerate = () => {
    generateAfterSafetyCheck(url);
  };

  const handleShareCard = async () => {
    if (!generatedUrl || !cardRef.current) {
      Alert.alert("Generate QR Code", "Generate a QR code before sharing.");
      return;
    }

    try {
      const sharingAvailable = await Sharing.isAvailableAsync();
      if (!sharingAvailable) {
        Alert.alert("Share unavailable", "Sharing is not available on this device.");
        return;
      }

      const uri = await captureRef(cardRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });

      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        dialogTitle: "Share QRGuard QR Code",
        UTI: "public.png",
      });
    } catch (shareError) {
      Alert.alert("Share Error", shareError instanceof Error ? shareError.message : "Unable to share this QR card.");
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={s.root}
    >
      <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <TouchableOpacity style={s.backButton} onPress={onBack}>
            <Text style={s.backButtonText}>Back</Text>
          </TouchableOpacity>
          <View style={s.headerTitleWrap}>
            <Image source={require("../../assets/QRGuard_logo.png")} style={s.logo} />
            <View>
              <Text style={s.title}>QR Generator</Text>
              <Text style={s.subtitle}>Create a QR code after a QRGuard safety check.</Text>
            </View>
          </View>
        </View>

        <View style={s.formCard}>
          <Text style={s.label}>Destination URL</Text>
          <TextInput
            value={url}
            onChangeText={(value) => {
              setUrl(value);
              setError("");
              setGeneratedUrl("");
              setGeneratedAt("");
              setSafetyResult(null);
            }}
            placeholder="https://www.google.com"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={[s.input, error && s.inputError]}
          />
          {error ? <Text style={s.errorText}>{error}</Text> : null}

          <TouchableOpacity style={[s.primaryButton, checkingSafety && s.disabledButton]} onPress={handleGenerate} disabled={checkingSafety}>
            {checkingSafety ? (
              <View style={s.buttonContent}>
                <ActivityIndicator color="#ffffff" />
                <Text style={s.primaryButtonText}>Checking with QRGuard...</Text>
              </View>
            ) : (
              <Text style={s.primaryButtonText}>Generate QR Code</Text>
            )}
          </TouchableOpacity>
        </View>

        {safetyResult?.final ? (
          <View style={[s.safetyCard, safetyResult.final.status === "Safe" && s.safetySafe, safetyResult.final.status === "Suspicious" && s.safetySuspicious, safetyResult.final.status === "Unsafe" && s.safetyUnsafe]}>
            <Text style={s.safetyTitle}>QRGuard safety check</Text>
            <Text style={s.safetyText}>
              {safetyResult.final.status} - {safetyResult.final.risk_score}% risk - {safetyResult.final.confidence}% confidence
            </Text>
            {safetyResult.explanation?.summary ? (
              <Text style={s.safetySummary}>{safetyResult.explanation.summary}</Text>
            ) : null}
          </View>
        ) : null}

        {generatedUrl ? (
          <>
            <View ref={cardRef} collapsable={false} style={s.shareCard}>
              <View style={s.brandRow}>
                <Image source={require("../../assets/QRGuard_logo.png")} style={s.cardLogo} />
                <View>
                  <Text style={s.cardTagline}>Generated with QRGuard</Text>
                </View>
              </View>

              <View style={s.safeBadge}>
                <Text style={s.safeBadgeText}>Checked by QRGuard: {safetyStatus}</Text>
              </View>

              <View style={s.qrFrame}>
                <QRCode
                  value={generatedUrl}
                  size={230}
                  backgroundColor="#ffffff"
                  color="#111827"
                  logo={require("../../assets/QRGuard_logo.png")}
                  logoSize={58}
                  logoBackgroundColor="#ffffff"
                  logoBorderRadius={8}
                  ecl="H"
                />
              </View>

              <Text style={s.destinationLabel}>Destination</Text>
              {generatedDomain ? <Text style={s.domainText}>{generatedDomain}</Text> : null}
              <Text style={s.destinationText}>{visibleUrl(generatedUrl)}</Text>

              {safetyResult?.final ? (
                <View style={s.cardMetaGrid}>
                  <View style={s.cardMetaBox}>
                    <Text style={s.cardMetaValue}>{safetyResult.final.risk_score}%</Text>
                    <Text style={s.cardMetaLabel}>Risk</Text>
                  </View>
                  <View style={s.cardMetaBox}>
                    <Text style={s.cardMetaValue}>{safetyResult.final.confidence}%</Text>
                    <Text style={s.cardMetaLabel}>Confidence</Text>
                  </View>
                </View>
              ) : null}

              {generatedAt ? <Text style={s.generatedAt}>Generated: {formatGeneratedAt(generatedAt)}</Text> : null}
            </View>

            <View style={s.detailsCard}>
              <Text style={s.detailsTitle}>QR content preview</Text>
              <Text style={s.detailsText}>{generatedUrl}</Text>
              {staticWarnings.length ? (
                <>
                  <Text style={s.detailsTitle}>Safety notes</Text>
                  {staticWarnings.map((warning, index) => (
                    <Text key={`${warning}-${index}`} style={s.warningText}>
                      {index + 1}. {warning}
                    </Text>
                  ))}
                </>
              ) : null}
            </View>

            <TouchableOpacity style={s.shareButton} onPress={handleShareCard}>
              <Text style={s.shareButtonText}>Share / Export QR Card</Text>
            </TouchableOpacity>
            <View style={s.actionRow}>
              <TouchableOpacity
                style={s.secondaryButton}
                onPress={async () => {
                  await Clipboard.setStringAsync(generatedUrl);
                  Alert.alert("Copied", "Destination URL copied.");
                }}
              >
                <Text style={s.secondaryButtonText}>Copy URL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.secondaryButton}
                onPress={async () => {
                  const summary = `QRGuard QR Code\nDestination: ${generatedUrl}\nStatus: ${safetyStatus}\nRisk: ${safetyResult?.final?.risk_score ?? "N/A"}%\nGenerated: ${generatedAt ? formatGeneratedAt(generatedAt) : "N/A"}`;
                  await Clipboard.setStringAsync(summary);
                  Alert.alert("Copied", "Safety summary copied.");
                }}
              >
                <Text style={s.secondaryButtonText}>Copy Summary</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={s.emptyPreview}>
            <Text style={s.emptyTitle}>QR preview will appear here</Text>
            <Text style={s.emptyText}>The generated QR code will directly encode the URL you enter.</Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  container: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 56,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 18,
  },
  backButton: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: PURPLE,
    borderRadius: 999,
    marginBottom: 16,
  },
  backButtonText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  headerTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logo: {
    width: 132,
    height: 44,
    resizeMode: "contain",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: TEXT,
  },
  subtitle: {
    fontSize: 13,
    color: MUTED,
    marginTop: 3,
  },
  formCard: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  label: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    color: TEXT,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  inputError: {
    borderColor: "#ef4444",
  },
  errorText: {
    color: "#dc2626",
    fontSize: 12,
    marginTop: 8,
  },
  primaryButton: {
    backgroundColor: PURPLE,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 12,
  },
  disabledButton: {
    opacity: 0.75,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  safetyCard: {
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 16,
  },
  safetySafe: {
    borderColor: "#86efac",
  },
  safetySuspicious: {
    borderColor: "#fed7aa",
  },
  safetyUnsafe: {
    borderColor: "#fecaca",
  },
  safetyTitle: {
    color: TEXT,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 5,
  },
  safetyText: {
    color: PURPLE,
    fontSize: 13,
    fontWeight: "700",
  },
  safetySummary: {
    color: MUTED,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 7,
  },
  shareCard: {
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    alignItems: "center",
  },
  brandRow: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  cardLogo: {
    width: 136,
    height: 42,
    resizeMode: "contain",
  },
  cardTagline: {
    color: MUTED,
    fontSize: 12,
    marginTop: 2,
  },
  safeBadge: {
    alignSelf: "stretch",
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#86efac",
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 16,
    alignItems: "center",
  },
  safeBadgeText: {
    color: "#166534",
    fontSize: 13,
    fontWeight: "800",
  },
  qrFrame: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    marginBottom: 16,
  },
  destinationLabel: {
    color: PURPLE,
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  destinationText: {
    color: TEXT,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  domainText: {
    color: TEXT,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 5,
    textAlign: "center",
  },
  cardMetaGrid: {
    alignSelf: "stretch",
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  cardMetaBox: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  cardMetaValue: {
    color: PURPLE,
    fontSize: 17,
    fontWeight: "800",
  },
  cardMetaLabel: {
    color: MUTED,
    fontSize: 11,
    marginTop: 2,
  },
  generatedAt: {
    color: MUTED,
    fontSize: 11.5,
    marginTop: 14,
    textAlign: "center",
  },
  detailsCard: {
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginTop: 14,
  },
  detailsTitle: {
    color: TEXT,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 7,
  },
  detailsText: {
    color: MUTED,
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 12,
  },
  warningText: {
    color: MUTED,
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 5,
  },
  shareButton: {
    backgroundColor: "#111827",
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 14,
  },
  shareButtonText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: SOFT,
    borderWidth: 1,
    borderColor: "#c7d2fe",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: PURPLE,
    fontSize: 12.5,
    fontWeight: "800",
  },
  emptyPreview: {
    backgroundColor: SOFT,
    borderWidth: 1,
    borderColor: "#c7d2fe",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
  },
  emptyTitle: {
    color: TEXT,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 6,
  },
  emptyText: {
    color: MUTED,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
});
