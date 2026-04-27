import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import BusinessScreen from "./src/screens/BusinessScreen";
import HistoryScreen from "./src/screens/HistoryScreen";
import LoginScreen from "./src/screens/LoginScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import ScannerScreen from "./src/screens/ScannerScreen";
import { clearSession, getStoredUser, type AuthUser } from "./src/services/api";

type ScreenName = "scanner" | "history" | "business" | "login" | "register";

export default function App() {
  const [activeScreen, setActiveScreen] = useState<ScreenName>("scanner");
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const loadSession = async () => {
      const storedUser = await getStoredUser();
      setUser(storedUser);
      setAuthLoading(false);
    };

    loadSession();
  }, []);

  const handleLoggedIn = (nextUser: AuthUser) => {
    setUser(nextUser);
    setHistoryRefreshKey((currentValue) => currentValue + 1);
    setActiveScreen("scanner");
  };

  const handleLoggedOut = () => {
    setUser(null);
    setHistoryRefreshKey((currentValue) => currentValue + 1);
    setActiveScreen("scanner");
  };

  const handleAuthExpired = async () => {
    await clearSession();
    handleLoggedOut();
  };

  if (authLoading) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  if (activeScreen === "history") {
    return (
      <HistoryScreen
        refreshKey={historyRefreshKey}
        onBack={() => setActiveScreen("scanner")}
      />
    );
  }

  if (activeScreen === "business") {
    return (
      <BusinessScreen
        user={user}
        onBack={() => setActiveScreen("scanner")}
        onLogin={() => setActiveScreen("login")}
        onRegister={() => setActiveScreen("register")}
        onLoggedOut={handleLoggedOut}
        onAuthExpired={handleAuthExpired}
      />
    );
  }

  if (activeScreen === "login") {
    return (
      <LoginScreen
        onBack={() => setActiveScreen("business")}
        onRegister={() => setActiveScreen("register")}
        onLoggedIn={handleLoggedIn}
      />
    );
  }

  if (activeScreen === "register") {
    return (
      <RegisterScreen
        onBack={() => setActiveScreen("business")}
        onLogin={() => setActiveScreen("login")}
        onRegistered={handleLoggedIn}
      />
    );
  }

  return (
    <ScannerScreen
      onHistorySaved={() => setHistoryRefreshKey((currentValue) => currentValue + 1)}
      onOpenBusiness={() => setActiveScreen("business")}
      onOpenHistory={() => setActiveScreen("history")}
    />
  );
}

const styles = StyleSheet.create({
  loadingRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ecf0f5",
  },
});
