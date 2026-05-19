import React, { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { clearHistory, getHistory } from "../../storage/historyStorage";
import type { BackendResult } from "../types/scan";

const BG = "#ecf0f5";
const CARD = "#ffffff";
const BORDER = "#cbd5e1";
const TEXT = "#1f2937";
const MUTED = "#6b7280";
const PURPLE = "#4f46e5";
const DANGER = "#dc2626";

type LocalHistoryItem = {
  id: number;
  url: string;
  risk_score: number;
  confidence: number;
  status: string;
  verdict?: string;
  scan_type?: string;
  explanation_summary?: string;
  timestamp: string;
  result?: BackendResult;
};

type DisplayHistoryItem = LocalHistoryItem;

type Props = {
  refreshKey?: number;
  onBack: () => void;
};

function formatTime(timestamp: string) {
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return timestamp;
  }
}

function getContent(item: DisplayHistoryItem) {
  return item.url;
}

function getVerdict(item: DisplayHistoryItem) {
  return "verdict" in item && item.verdict ? item.verdict : item.status ?? "Unknown";
}

function getResult(item: DisplayHistoryItem) {
  return "result" in item ? item.result : undefined;
}

export default function HistoryScreen({ onBack, refreshKey = 0 }: Props) {
  const [history, setHistory] = useState<DisplayHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<DisplayHistoryItem | null>(null);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const storedHistory = await getHistory();
      setHistory(storedHistory);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load scan history.";
      Alert.alert("Error", message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [refreshKey]);

  const handleClearHistory = () => {
    Alert.alert(
      "Clear History",
      "This will remove all saved scan results from local storage.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await clearHistory();
              setSelectedItem(null);
              setHistory([]);
            } catch (error) {
              const message = error instanceof Error ? error.message : "Unable to clear scan history.";
              Alert.alert("Error", message);
            }
          },
        },
      ]
    );
  };

  const handleOpenURL = (item: DisplayHistoryItem) => {
    const url = getContent(item);
    const verdict = getVerdict(item);

    if (verdict === "Unsafe" || verdict === "Suspicious") {
      Alert.alert(
        " Warning",
        `This URL was marked as ${verdict.toLowerCase()}. Opening it may be risky. Are you sure?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Open Anyway",
            style: "destructive",
            onPress: async () => {
              try {
                await Linking.openURL(url);
              } catch {
                Alert.alert("Error", "Unable to open this URL.");
              }
            },
          },
        ]
      );
    } else {
      // Safe URL - open directly
      Linking.openURL(url).catch(() => {
        Alert.alert("Error", "Unable to open this URL.");
      });
    }
  };

  const renderItem = ({ item }: { item: DisplayHistoryItem }) => (
    <TouchableOpacity style={styles.card} onPress={() => setSelectedItem(item)} activeOpacity={0.85}>
      <Text style={styles.url} numberOfLines={2}>
        {getContent(item)}
      </Text>
      <View style={styles.metaRow}>
        <Text style={styles.meta}>Risk: {item.risk_score}%</Text>
        <Text style={styles.meta}>Status: {getVerdict(item)}</Text>
      </View>
      <Text style={styles.time}>{formatTime(item.timestamp)}</Text>
    </TouchableOpacity>
  );

  const selectedResult = selectedItem ? getResult(selectedItem) : null;

  if (selectedItem) {
    return (
      <ScrollView contentContainerStyle={styles.detailContainer}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setSelectedItem(null)}>
            <Text style={styles.secondaryButtonText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Scan Details</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.detailCard}>
          <Text style={styles.label}>Content</Text>
          <Text style={styles.detailText}>{getContent(selectedItem)}</Text>

          <View style={styles.detailGrid}>
            <View style={styles.detailMetric}>
              <Text style={styles.metricValue}>{selectedItem.risk_score}%</Text>
              <Text style={styles.metricLabel}>Risk</Text>
            </View>
            <View style={styles.detailMetric}>
              <Text style={styles.metricValue}>{selectedItem.confidence}%</Text>
              <Text style={styles.metricLabel}>Confidence</Text>
            </View>
          </View>

          <Text style={styles.label}>Verdict</Text>
          <Text style={styles.detailText}>{getVerdict(selectedItem)}</Text>

          <Text style={styles.label}>Explanation</Text>
          <Text style={styles.detailText}>
            {selectedItem.explanation_summary || selectedResult?.explanation?.summary || "No explanation saved."}
          </Text>

          {selectedResult?.explanation?.reasons?.length ? (
            <>
              <Text style={styles.label}>Reasons</Text>
              {selectedResult.explanation.reasons.map((reason, index) => (
                <Text key={`${reason}-${index}`} style={styles.reasonText}>
                  {index + 1}. {reason}
                </Text>
              ))}
            </>
          ) : null}

          <Text style={styles.label}>Scanned</Text>
          <Text style={styles.detailText}>{formatTime(selectedItem.timestamp)}</Text>

          {selectedItem.scan_type !== "dynamic" && selectedItem.scan_type !== "plain_text" && selectedItem.scan_type !== "email" && selectedItem.scan_type !== "phone" && selectedItem.scan_type !== "sms" && selectedItem.scan_type !== "vcard" && selectedItem.scan_type !== "location" && selectedItem.scan_type !== "calendar" ? (
            <TouchableOpacity
              style={[
                styles.openUrlButton,
                selectedItem.verdict === "Unsafe" && styles.openUrlButtonDanger,
                selectedItem.verdict === "Suspicious" && styles.openUrlButtonWarning,
              ]}
              onPress={() => handleOpenURL(selectedItem)}
            >
              <Text style={styles.openUrlButtonText}>
                {selectedItem.verdict === "Safe" ? " Open URL" : " Open URL"}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.secondaryButton} onPress={onBack}>
          <Text style={styles.secondaryButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Scan History</Text>
        <TouchableOpacity style={styles.clearButton} onPress={handleClearHistory}>
          <Text style={styles.clearButtonText}>Clear</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.scopeText}>
        Showing local scan history on this device.
      </Text>

      {loading ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Loading history...</Text>
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={history.length === 0 ? styles.emptyList : styles.list}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No scan history yet.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    paddingTop: 56,
    paddingHorizontal: 18,
  },
  detailContainer: {
    flexGrow: 1,
    backgroundColor: BG,
    paddingTop: 56,
    paddingHorizontal: 18,
    paddingBottom: 28,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    gap: 10,
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontWeight: "700",
    color: TEXT,
    textAlign: "center",
  },
  headerSpacer: { width: 78 },
  secondaryButton: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: TEXT,
    fontWeight: "600",
  },
  clearButton: {
    backgroundColor: "#fee2e2",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  clearButtonText: {
    color: DANGER,
    fontWeight: "700",
  },
  scopeText: {
    color: MUTED,
    fontSize: 12.5,
    marginBottom: 14,
    textAlign: "center",
  },
  list: {
    paddingBottom: 24,
    gap: 12,
  },
  emptyList: {
    flexGrow: 1,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 12,
  },
  url: {
    color: TEXT,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 6,
  },
  meta: {
    color: PURPLE,
    fontSize: 13,
    fontWeight: "500",
  },
  time: {
    color: MUTED,
    fontSize: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: MUTED,
    fontSize: 15,
  },
  detailCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
  },
  label: {
    color: MUTED,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginTop: 14,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  detailText: {
    color: TEXT,
    fontSize: 14,
    lineHeight: 21,
  },
  detailGrid: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  detailMetric: {
    flex: 1,
    backgroundColor: "#f0f4f9",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 12,
    alignItems: "center",
  },
  metricValue: {
    color: PURPLE,
    fontSize: 20,
    fontWeight: "700",
  },
  metricLabel: {
    color: MUTED,
    fontSize: 11,
    marginTop: 2,
  },
  reasonText: {
    color: TEXT,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 6,
  },
  openUrlButton: {
    backgroundColor: "#22c55e",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 16,
    alignItems: "center",
  },
  openUrlButtonWarning: { backgroundColor: "#f97316" },
  openUrlButtonDanger: { backgroundColor: "#ef4444" },
  openUrlButtonText: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
});
