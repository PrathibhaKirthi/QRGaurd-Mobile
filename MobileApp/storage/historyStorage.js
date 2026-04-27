import AsyncStorage from "@react-native-async-storage/async-storage";

const HISTORY_KEY = "scan_history";

export async function getHistory() {
  try {
    const storedHistory = await AsyncStorage.getItem(HISTORY_KEY);

    if (!storedHistory) {
      return [];
    }

    const parsedHistory = JSON.parse(storedHistory);
    return Array.isArray(parsedHistory) ? parsedHistory : [];
  } catch (error) {
    console.error("Failed to load scan history:", error);
    return [];
  }
}

export async function saveScan(result) {
  try {
    const existingHistory = await getHistory();
    const normalizedScan = {
      id: result?.id ?? Date.now(),
      url: result?.url ?? "",
      risk_score: Number(result?.risk_score ?? 0),
      confidence: Number(result?.confidence ?? 0),
      status: result?.status ?? "Unknown",
      verdict: result?.status ?? result?.verdict ?? "Unknown",
      explanation_summary: result?.explanation_summary ?? result?.result?.explanation?.summary ?? "",
      result: result?.result ?? null,
      timestamp: result?.timestamp ?? new Date().toISOString(),
    };

    const updatedHistory = [normalizedScan, ...existingHistory];
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));
    return updatedHistory;
  } catch (error) {
    console.error("Failed to save scan history:", error);
    throw error;
  }
}

export async function clearHistory() {
  try {
    await AsyncStorage.removeItem(HISTORY_KEY);
  } catch (error) {
    console.error("Failed to clear scan history:", error);
    throw error;
  }
}
