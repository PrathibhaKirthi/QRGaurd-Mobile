import React from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { REPORT_REASONS } from "../../constants/scanDisplay";
import type { QRReportReason } from "../../services/api";

type ReportSuspiciousQRModalProps = {
  visible: boolean;
  reason: QRReportReason;
  location: string;
  note: string;
  submitting: boolean;
  onClose: () => void;
  onReasonChange: (reason: QRReportReason) => void;
  onLocationChange: (location: string) => void;
  onNoteChange: (note: string) => void;
  onSubmit: () => void;
};

export default function ReportSuspiciousQRModal({
  visible,
  reason,
  location,
  note,
  submitting,
  onClose,
  onReasonChange,
  onLocationChange,
  onNoteChange,
  onSubmit,
}: ReportSuspiciousQRModalProps) {
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <View style={s.reportModal}>
          <Text style={s.modalTitle}>Report suspicious QR</Text>
          <Text style={s.modalHelp}>
            Add what you noticed. Location and notes are optional, but useful for spotting repeated fake stickers.
          </Text>

          <Text style={s.reportFieldLabel}>Reason</Text>
          <View style={s.reasonGrid}>
            {REPORT_REASONS.map((item) => (
              <TouchableOpacity
                key={item.value}
                style={[s.reasonChip, reason === item.value && s.reasonChipActive]}
                onPress={() => onReasonChange(item.value)}
              >
                <Text style={[s.reasonChipText, reason === item.value && s.reasonChipTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.reportFieldLabel}>Location</Text>
          <TextInput
            value={location}
            onChangeText={onLocationChange}
            placeholder="e.g. Parking meter on Grafton Street"
            placeholderTextColor={MUTED}
            style={s.reportInput}
          />

          <Text style={s.reportFieldLabel}>Note</Text>
          <TextInput
            value={note}
            onChangeText={onNoteChange}
            placeholder="What made it look suspicious?"
            placeholderTextColor={MUTED}
            multiline
            maxLength={500}
            style={[s.reportInput, s.reportTextArea]}
          />

          <View style={s.modalActions}>
            <TouchableOpacity style={s.modalCancelButton} onPress={onClose} disabled={submitting}>
              <Text style={s.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.modalSubmitButton} onPress={onSubmit} disabled={submitting}>
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={s.modalSubmitText}>Submit Report</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const CARD = "#ffffff";
const SURF = "#f0f4f9";
const BORDER = "#cbd5e1";
const PURPLE = "#4f46e5";
const TEXT = "#1f2937";
const MUTED = "#6b7280";

const s = StyleSheet.create({
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
});
