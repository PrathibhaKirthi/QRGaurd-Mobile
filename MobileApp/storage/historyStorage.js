import AsyncStorage from "@react-native-async-storage/async-storage";

const HISTORY_KEY = "scan_history";

// HISTORY LOAD
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

// STATIC SCAN HISTORY
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

// ADVANCED SCAN HISTORY
export async function saveAdvancedScan(advancedScan, staticResult) {
  try {
    const existingHistory = await getHistory();
    
    // Create a normalized advanced scan entry similar to static scans
    const normalizedAdvancedScan = {
      id: advancedScan?.scan_id ?? Date.now(),
      url: advancedScan?.target_url ?? "",
      scan_type: "dynamic",
      qr_text: advancedScan?.qr_text ?? "",
      risk_score: Number(advancedScan?.llm_result?.risk_score ?? 0),
      confidence: Number(advancedScan?.llm_result?.confidence ?? 0),
      status: advancedScan?.status ?? "Unknown",
      verdict: advancedScan?.llm_result?.status ?? "Unknown",
      explanation_summary: advancedScan?.llm_result?.summary ?? "",
      
      // Store the full advanced scan data for detailed view
      advanced_scan: {
        scan_id: advancedScan?.scan_id,
        status: advancedScan?.status,
        evidence: advancedScan?.evidence,
        llm_result: advancedScan?.llm_result,
        screenshot_url: advancedScan?.screenshot_url,
        created_at: advancedScan?.created_at,
        completed_at: advancedScan?.completed_at,
        viewed_at: advancedScan?.viewed_at,
      },
      
      // Also store the static result if available
      static_result: staticResult ?? null,
      
      timestamp: advancedScan?.completed_at ?? new Date().toISOString(),
    };

    const updatedHistory = [normalizedAdvancedScan, ...existingHistory];
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));

    return updatedHistory;
  } catch (error) {
    console.error("Failed to save advanced scan to history:", error);
    throw error;
  }
}

// HISTORY LOOKUP
export async function getAdvancedScanById(scanId) {
  try {
    const history = await getHistory();
    return history.find((item) => item.advanced_scan?.scan_id === scanId || item.id === scanId);
  } catch (error) {
    console.error("Failed to retrieve advanced scan:", error);
    return null;
  }
}

// HISTORY CLEAR
export async function clearHistory() {
  try {
    await AsyncStorage.removeItem(HISTORY_KEY);
  } catch (error) {
    console.error("Failed to clear scan history:", error);
    throw error;
  }
}
