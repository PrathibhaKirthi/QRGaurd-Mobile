import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import {
  clearSession,
  createBusinessQRCode,
  deleteBusinessQRCode,
  fetchBusinessQRCodes,
  updateBusinessQRCode,
  type AuthUser,
  type BusinessQRCode,
} from "../services/api";

const BG = "#ecf0f5";
const CARD = "#ffffff";
const BORDER = "#cbd5e1";
const TEXT = "#1f2937";
const MUTED = "#6b7280";
const PURPLE = "#4f46e5";
const DANGER = "#dc2626";

type Props = {
  user: AuthUser | null;
  onBack: () => void;
  onLogin: () => void;
  onRegister: () => void;
  onLoggedOut: () => void;
  onAuthExpired?: () => void;
};

const emptyForm = {
  title: "",
  business_name: "",
  destination_url: "",
  description: "",
  qr_type: "static" as const,
  active: true,
};

export default function BusinessScreen({
  user,
  onBack,
  onLogin,
  onRegister,
  onLoggedOut,
  onAuthExpired,
}: Props) {
  const [qrCodes, setQrCodes] = useState<BusinessQRCode[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<BusinessQRCode | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadQRCodes = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setQrCodes(await fetchBusinessQRCodes());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load QR codes.";
      if (message.includes("session")) {
        onAuthExpired?.();
      }
      Alert.alert("Error", message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQRCodes();
  }, [user?.id]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditing(null);
  };

  const startEdit = (qrCode: BusinessQRCode) => {
    setEditing(qrCode);
    setForm({
      title: qrCode.title,
      business_name: qrCode.business_name,
      destination_url: qrCode.destination_url,
      description: qrCode.description,
      qr_type: "static",
      active: qrCode.active,
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      if (editing) {
        await updateBusinessQRCode(editing.id, form);
      } else {
        await createBusinessQRCode(form);
      }
      resetForm();
      await loadQRCodes();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save QR code.";
      if (message.includes("session")) {
        onAuthExpired?.();
      }
      Alert.alert("Error", message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (qrCode: BusinessQRCode) => {
    Alert.alert("Delete QR code", "This removes it from your business account.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteBusinessQRCode(qrCode.id);
            await loadQRCodes();
          } catch (error) {
            Alert.alert("Error", error instanceof Error ? error.message : "Unable to delete QR code.");
          }
        },
      },
    ]);
  };

  const handleLogout = () => {
    Alert.alert("Log out", "Your business session will be removed from this device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          await clearSession();
          onLoggedOut();
        },
      },
    ]);
  };

  const renderQRCode = ({ item }: { item: BusinessQRCode }) => (
    <View style={styles.qrCard}>
      <View style={styles.qrPreview}>
        <QRCode value={item.qr_value} size={118} />
        <Text style={styles.verifiedBadge}>QRGuard Verified</Text>
        <Text style={styles.previewBusinessName} numberOfLines={2}>{item.business_name}</Text>
      </View>
      <View style={styles.qrInfo}>
        <Text style={styles.qrTitle}>{item.title}</Text>
        <Text style={styles.qrMeta}>{item.business_name}</Text>
        <Text style={styles.qrMeta} numberOfLines={2}>{item.destination_url}</Text>
        <View style={styles.badgeRow}>
          <Text style={[styles.badge, styles.typeBadge]}>Static</Text>
          <Text style={[styles.badge, item.verdict === "Safe" ? styles.safeBadge : styles.warnBadge]}>
            {item.verdict} · {item.risk_score}% risk
          </Text>
          <Text style={[styles.badge, item.active ? styles.activeBadge : styles.disabledBadge]}>
            {item.active ? "Active" : "Disabled"}
          </Text>
          <Text style={[styles.badge, styles.activeBadge]}>
            {item.scan_count} scans
          </Text>
        </View>
        <Text style={styles.verifyUrl} numberOfLines={2}>{item.qr_value}</Text>
        <Text style={styles.staticHint}>URL changes require generating a new QR image.</Text>
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.smallButton} onPress={() => startEdit(item)}>
            <Text style={styles.smallButtonText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteButton} onPress={() => handleDelete(item)}>
            <Text style={styles.deleteButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.secondaryButton} onPress={onBack}>
          <Text style={styles.secondaryButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Business</Text>
        <View style={styles.headerSpacer} />
      </View>

      {!user ? (
        <View style={styles.card}>
          <Text style={styles.helperText}>
            Business owners can log in to generate QRGuard-verified QR codes and manage their destinations.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={onLogin}>
            <Text style={styles.primaryButtonText}>Business Login</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryWideButton} onPress={onRegister}>
            <Text style={styles.secondaryWideButtonText}>Create Business Account</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <View style={styles.accountRow}>
              <View>
                <Text style={styles.label}>Signed in</Text>
                <Text style={styles.email}>{user.email}</Text>
              </View>
              <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                <Text style={styles.logoutButtonText}>Log Out</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.formTitle}>{editing ? "Edit verified QR" : "Create verified QR"}</Text>
            <Text style={styles.typeHelp}>
              Static QRs store the final URL directly, so they open without needing the QRGuard backend to be public.
            </Text>
            <TextInput
              value={form.title}
              onChangeText={(title) => setForm((current) => ({ ...current, title }))}
              placeholder="QR title"
              placeholderTextColor={MUTED}
              style={styles.input}
            />
            <TextInput
              value={form.business_name}
              onChangeText={(business_name) => setForm((current) => ({ ...current, business_name }))}
              placeholder="Business name"
              placeholderTextColor={MUTED}
              style={styles.input}
            />
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              value={form.destination_url}
              onChangeText={(destination_url) => setForm((current) => ({ ...current, destination_url }))}
              placeholder="https://example.com"
              placeholderTextColor={MUTED}
              style={styles.input}
            />
            <TextInput
              value={form.description}
              onChangeText={(description) => setForm((current) => ({ ...current, description }))}
              placeholder="Description"
              placeholderTextColor={MUTED}
              multiline
              blurOnSubmit
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
              style={[styles.input, styles.textArea]}
            />
            <TouchableOpacity style={styles.doneButton} onPress={Keyboard.dismiss}>
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Active</Text>
              <Switch value={form.active} onValueChange={(active) => setForm((current) => ({ ...current, active }))} />
            </View>
            <TouchableOpacity style={styles.primaryButton} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>{editing ? "Save Changes" : "Generate QR"}</Text>}
            </TouchableOpacity>
            {editing ? (
              <TouchableOpacity style={styles.cancelButton} onPress={resetForm}>
                <Text style={styles.cancelButtonText}>Cancel Edit</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={styles.sectionTitle}>Your QR codes</Text>
          {loading ? (
            <Text style={styles.emptyText}>Loading QR codes...</Text>
          ) : (
            <FlatList
              scrollEnabled={false}
              data={qrCodes}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderQRCode}
              ListEmptyComponent={<Text style={styles.emptyText}>No business QR codes yet.</Text>}
            />
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: BG,
    paddingTop: 56,
    paddingHorizontal: 18,
    paddingBottom: 28,
  },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 18, gap: 10 },
  title: { flex: 1, color: TEXT, fontSize: 22, fontWeight: "700", textAlign: "center" },
  headerSpacer: { width: 74 },
  secondaryButton: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryButtonText: { color: TEXT, fontWeight: "600" },
  card: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 16, padding: 18, marginBottom: 18 },
  helperText: { color: MUTED, fontSize: 14, lineHeight: 21, marginBottom: 18 },
  label: { color: MUTED, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginBottom: 4 },
  email: { color: TEXT, fontSize: 14, fontWeight: "700" },
  accountRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginBottom: 18 },
  formTitle: { color: TEXT, fontSize: 17, fontWeight: "700", marginBottom: 12 },
  typeSelector: {
    flexDirection: "row",
    backgroundColor: "#f0f4f9",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 4,
    marginBottom: 8,
  },
  typeOption: { flex: 1, alignItems: "center", borderRadius: 9, paddingVertical: 10 },
  typeOptionActive: { backgroundColor: PURPLE },
  typeOptionText: { color: MUTED, fontSize: 13, fontWeight: "700" },
  typeOptionTextActive: { color: "#ffffff" },
  typeHelp: { color: MUTED, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  input: {
    backgroundColor: "#f0f4f9",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    color: TEXT,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 10,
  },
  textArea: { minHeight: 72, textAlignVertical: "top" },
  doneButton: {
    alignSelf: "flex-end",
    backgroundColor: "#eef2ff",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: -2,
    marginBottom: 10,
  },
  doneButtonText: { color: PURPLE, fontSize: 12, fontWeight: "700" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  switchLabel: { color: TEXT, fontSize: 14, fontWeight: "600" },
  primaryButton: {
    backgroundColor: PURPLE,
    borderRadius: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  primaryButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  secondaryWideButton: {
    backgroundColor: "#eef2ff",
    borderWidth: 1,
    borderColor: PURPLE,
    borderRadius: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryWideButtonText: { color: PURPLE, fontSize: 15, fontWeight: "700" },
  logoutButton: { backgroundColor: "#fee2e2", borderRadius: 12, paddingHorizontal: 12, justifyContent: "center" },
  logoutButtonText: { color: DANGER, fontSize: 13, fontWeight: "700" },
  cancelButton: { alignItems: "center" },
  cancelButtonText: { color: MUTED, fontWeight: "700" },
  sectionTitle: { color: TEXT, fontSize: 18, fontWeight: "700", marginBottom: 12 },
  qrCard: {
    flexDirection: "row",
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    gap: 14,
  },
  qrPreview: { backgroundColor: "#ffffff", borderRadius: 10, padding: 8, alignSelf: "flex-start", alignItems: "center", width: 142 },
  verifiedBadge: {
    color: TEXT,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 8,
    textAlign: "center",
    textTransform: "uppercase",
  },
  previewBusinessName: {
    color: MUTED,
    fontSize: 10.5,
    lineHeight: 14,
    marginTop: 2,
    textAlign: "center",
  },
  qrInfo: { flex: 1 },
  qrTitle: { color: TEXT, fontSize: 15, fontWeight: "700", marginBottom: 4 },
  qrMeta: { color: MUTED, fontSize: 12.5, lineHeight: 18 },
  verifyUrl: { color: PURPLE, fontSize: 11.5, lineHeight: 16, marginTop: 8 },
  staticHint: { color: MUTED, fontSize: 11.5, lineHeight: 16, marginTop: 6 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  badge: { overflow: "hidden", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, fontSize: 11, fontWeight: "700" },
  safeBadge: { backgroundColor: "#dcfce7", color: "#166534" },
  warnBadge: { backgroundColor: "#ffedd5", color: "#c2410c" },
  activeBadge: { backgroundColor: "#eef2ff", color: PURPLE },
  typeBadge: { backgroundColor: "#e0f2fe", color: "#075985" },
  disabledBadge: { backgroundColor: "#fee2e2", color: DANGER },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  smallButton: { backgroundColor: "#eef2ff", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  smallButtonText: { color: PURPLE, fontWeight: "700", fontSize: 12 },
  deleteButton: { backgroundColor: "#fee2e2", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  deleteButtonText: { color: DANGER, fontWeight: "700", fontSize: 12 },
  emptyText: { color: MUTED, fontSize: 14, textAlign: "center", marginTop: 18 },
});
