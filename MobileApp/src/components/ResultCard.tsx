import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { ScanResponse } from "../services/api";

interface Props {
  result: ScanResponse | null;
}

export default function ResultCard({ result }: Props) {
  if (!result) return null;

  const getColor = () => {
    switch (result.status) {
      case "green":
        return "#4CAF50";
      case "yellow":
        return "#FFC107";
      case "red":
        return "#F44336";
      default:
        return "#999";
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: getColor() }]}>
      <Text style={styles.text}>{result.message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    width: "80%",
    alignSelf: "center",
  },
  text: {
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    color: "#fff",
  },
});
