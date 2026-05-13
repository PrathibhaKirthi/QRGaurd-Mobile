import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import HistoryScreen from "./src/screens/HistoryScreen";
import QRGeneratorScreen from "./src/screens/QRGeneratorScreen";
import ScannerScreen from "./src/screens/ScannerScreen";

type Screen = "scanner" | "history" | "generator";

export default function App() {
  const [screen, setScreen] = useState<Screen>("scanner");
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [sessionLoading, setSessionLoading] = useState(true);

  useEffect(() => {
    setSessionLoading(false);
  }, []);

  const handleHistorySaved = () => {
    setHistoryRefreshKey((current) => current + 1);
  };

  if (sessionLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#4f46e5" />
        <Text style={styles.loadingText}>Loading QRGuard...</Text>
      </View>
    );
  }

  if (screen === "history") {
    return (
      <HistoryScreen
        refreshKey={historyRefreshKey}
        onBack={() => setScreen("scanner")}
      />
    );
  }

  if (screen === "generator") {
    return (
      <QRGeneratorScreen
        onBack={() => setScreen("scanner")}
      />
    );
  }

  return (
    <ScannerScreen
      onHistorySaved={handleHistorySaved}
      onOpenHistory={() => setScreen("history")}
      onOpenGenerator={() => setScreen("generator")}
    />
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#ecf0f5",
  },
  loadingText: {
    color: "#6b7280",
    fontSize: 14,
  },
});
