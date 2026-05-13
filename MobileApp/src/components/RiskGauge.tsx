import React from "react";
import { StyleSheet, Text, View } from "react-native";

type RiskGaugeProps = {
  risk: number;
};

export default function RiskGauge({ risk }: RiskGaugeProps) {
  const normalizedRisk = Math.min(100, Math.max(0, Number.isFinite(risk) ? risk : 0));
  const color = normalizedRisk >= 70 ? "#ef4444" : normalizedRisk >= 40 ? "#f97316" : "#22c55e";

  return (
    <View style={s.wrap}>
      <View style={s.track}>
        <View style={[s.fill, { width: `${normalizedRisk}%`, backgroundColor: color }]} />
      </View>
      <View style={s.row}>
        <Text style={s.label}>Risk score</Text>
        <Text style={[s.value, { color }]}>{Math.round(normalizedRisk)}%</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { width: "100%", marginBottom: 14 },
  track: {
    height: 10,
    backgroundColor: "#e5e7eb",
    borderRadius: 999,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 999,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
  label: { color: "#6b7280", fontSize: 11, fontWeight: "600" },
  value: { fontSize: 12, fontWeight: "800" },
});
