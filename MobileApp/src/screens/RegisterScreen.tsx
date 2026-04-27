import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { register, type AuthUser } from "../services/api";

const BG = "#ecf0f5";
const CARD = "#ffffff";
const BORDER = "#cbd5e1";
const TEXT = "#1f2937";
const MUTED = "#6b7280";
const PURPLE = "#4f46e5";

type Props = {
  onBack: () => void;
  onLogin: () => void;
  onRegistered: (user: AuthUser) => void;
};

export default function RegisterScreen({ onBack, onLogin, onRegistered }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Missing details", "Enter an email and password.");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Password mismatch", "Both password fields must match.");
      return;
    }

    try {
      setLoading(true);
      const auth = await register(email, password);
      onRegistered(auth.user);
    } catch (error) {
      Alert.alert("Registration failed", error instanceof Error ? error.message : "Unable to create account.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.secondaryButton} onPress={onBack}>
          <Text style={styles.secondaryButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Business Register</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.card}>
        <Text style={styles.helperText}>Passwords must be at least 8 characters.</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={MUTED}
          style={styles.input}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={MUTED}
          style={styles.input}
        />

        <Text style={styles.label}>Confirm Password</Text>
        <TextInput
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Confirm password"
          placeholderTextColor={MUTED}
          style={styles.input}
        />

        <TouchableOpacity style={styles.primaryButton} onPress={handleRegister} disabled={loading}>
          {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Create Account</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkButton} onPress={onLogin}>
          <Text style={styles.linkText}>Already have an account?</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    paddingTop: 56,
    paddingHorizontal: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
    gap: 10,
  },
  title: {
    flex: 1,
    color: TEXT,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
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
  card: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 18,
  },
  helperText: {
    color: MUTED,
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 6,
  },
  label: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: "#f0f4f9",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    color: TEXT,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  primaryButton: {
    backgroundColor: PURPLE,
    borderRadius: 12,
    marginTop: 18,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { color: "#ffffff", fontWeight: "700", fontSize: 15 },
  linkButton: {
    alignItems: "center",
    marginTop: 16,
  },
  linkText: {
    color: PURPLE,
    fontWeight: "700",
  },
});
