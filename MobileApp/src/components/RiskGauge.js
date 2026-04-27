import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { AnimatedCircularProgress } from "react-native-circular-progress";

function getRiskMeta(risk) {
  if (risk < 40) {
    return { label: "Safe", color: "#22c55e" };
  }

  if (risk < 70) {
    return { label: "Suspicious", color: "#f97316" };
  }

  return { label: "Unsafe", color: "#ef4444" };
}

export default function RiskGauge({ risk = 0 }) {
  const safeRisk = Math.max(0, Math.min(100, Number(risk) || 0));
  const { label, color } = getRiskMeta(safeRisk);

  return (
    <View style={styles.container}>
      <AnimatedCircularProgress
        size={180}
        width={16}
        fill={safeRisk}
        tintColor={color}
        backgroundColor="#e5e7eb"
        rotation={220}
        arcSweepAngle={280}
        duration={1200}
        lineCap="round"
      >
        {(fill) => (
          <View style={styles.innerContent}>
            <Text style={[styles.percentText, { color }]}>{Math.round(fill)}%</Text>
            <Text style={styles.caption}>Risk score</Text>
          </View>
        )}
      </AnimatedCircularProgress>
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  innerContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  percentText: {
    fontSize: 32,
    fontWeight: "700",
  },
  caption: {
    marginTop: 4,
    fontSize: 12,
    color: "#6b7280",
  },
  label: {
    marginTop: 14,
    fontSize: 16,
    fontWeight: "700",
  },
});
