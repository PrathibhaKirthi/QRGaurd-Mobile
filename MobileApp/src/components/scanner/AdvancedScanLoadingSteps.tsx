import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

const ADVANCED_SCAN_STEPS = [
  "Preparing isolated browser",
  "Opening link in isolated browser",
  "Checking redirects",
  "Inspecting page behaviour",
  "Detecting forms and inputs",
  "Watching network requests",
  "Capturing page preview",
  "Reviewing sandbox evidence",
  "Generating explanation",
];

export default function AdvancedScanLoadingSteps() {
  const [stepIndex, setStepIndex] = useState(0);
  const [completing, setCompleting] = useState(false);
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslateY = useRef(new Animated.Value(12)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    let mounted = true;

    const runStep = () => {
      if (!mounted) return;

      setCompleting(false);
      textOpacity.setValue(0);
      textTranslateY.setValue(12);
      checkOpacity.setValue(0);
      checkScale.setValue(0.7);

      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(textTranslateY, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setTimeout(() => {
          if (!mounted) return;
          setCompleting(true);
          Animated.parallel([
            Animated.timing(textOpacity, {
              toValue: 0,
              duration: 360,
              easing: Easing.in(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(textTranslateY, {
              toValue: -18,
              duration: 360,
              easing: Easing.inOut(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(checkOpacity, {
              toValue: 1,
              duration: 180,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.spring(checkScale, {
              toValue: 1,
              friction: 5,
              tension: 140,
              useNativeDriver: true,
            }),
          ]).start(() => {
            setTimeout(() => {
              if (!mounted) return;
              setStepIndex((current) => (current + 1) % ADVANCED_SCAN_STEPS.length);
              runStep();
            }, 180);
          });
        }, 1350);
      });
    };

    runStep();

    return () => {
      mounted = false;
      textOpacity.stopAnimation();
      textTranslateY.stopAnimation();
      checkOpacity.stopAnimation();
      checkScale.stopAnimation();
    };
  }, [checkOpacity, checkScale, textOpacity, textTranslateY]);

  return (
    <View style={s.advancedLoadingBox}>
      <View style={s.advancedLoadingTrack}>
        <View style={s.advancedLoadingDot} />
        <Animated.Text
          style={[
            s.advancedLoadingText,
            {
              opacity: textOpacity,
              transform: [{ translateY: textTranslateY }],
            },
          ]}
          numberOfLines={1}
        >
          {ADVANCED_SCAN_STEPS[stepIndex]}
        </Animated.Text>
        <Animated.View
          style={[
            s.advancedDoneBadge,
            {
              opacity: checkOpacity,
              transform: [{ scale: checkScale }],
            },
          ]}
        >
          <Text style={s.advancedDoneMark}>Done</Text>
        </Animated.View>
      </View>
      <Text style={s.advancedLoadingHint}>
        {completing ? "Step complete" : "Advanced Scan is running"}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  advancedLoadingBox: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: "#c7d2fe",
    padding: 10,
    marginTop: 2,
  },
  advancedLoadingTrack: {
    height: 28,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  advancedLoadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4f46e5",
    flexShrink: 0,
  },
  advancedLoadingText: {
    color: "#1f2937",
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  advancedDoneBadge: {
    minWidth: 34,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#22c55e",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    paddingHorizontal: 7,
  },
  advancedDoneMark: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 12,
  },
  advancedLoadingHint: {
    color: "#6b7280",
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 5,
  },
});
