import AsyncStorage from "@react-native-async-storage/async-storage";
import { clearCloudHistory, fetchCloudHistory, getToken, saveCloudHistoryItem } from "../src/services/api";

const HISTORY_KEY = "scan_history";

// HISTORY LOAD: Prefer cloud history when signed in, otherwise use local device storage.
export async function getHistory() {
  try {
    const token = await getToken();
    if (token) {
      try {
        const cloudHistory = await fetchCloudHistory();
        if (Array.isArray(cloudHistory)) {
          return cloudHistory;
        }
      } catch (cloudError) {
        console.warn("Cloud history unavailable, using local history:", cloudError);
      }
    }

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

// STATIC SCAN HISTORY: Save normal QR scan results locally, then try cloud sync if signed in.
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

    const token = await getToken();
    if (token) {
      saveCloudHistoryItem(normalizedScan).catch((error) => {
        console.warn("Cloud history save failed:", error);
      });
    }

    return updatedHistory;
  } catch (error) {
    console.error("Failed to save scan history:", error);
    throw error;
  }
}

// ADVANCED SCAN HISTORY: Store dynamic sandbox evidence and verdict after Advanced Scan completes.
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

    const token = await getToken();
    if (token) {
      saveCloudHistoryItem(normalizedAdvancedScan).catch((error) => {
        console.warn("Cloud advanced scan history save failed:", error);
      });
    }

    return updatedHistory;
  } catch (error) {
    console.error("Failed to save advanced scan to history:", error);
    throw error;
  }
}

// HISTORY LOOKUP: Used to retrieve a saved Advanced Scan result by scan id.
export async function getAdvancedScanById(scanId) {
  try {
    const history = await getHistory();
    return history.find((item) => item.advanced_scan?.scan_id === scanId || item.id === scanId);
  } catch (error) {
    console.error("Failed to retrieve advanced scan:", error);
    return null;
  }
}

// HISTORY CLEAR: Clear cloud history when available, then clear local AsyncStorage.
export async function clearHistory() {
  try {
    const token = await getToken();
    if (token) {
      try {
        await clearCloudHistory();
      } catch (cloudError) {
        console.warn("Cloud history clear failed:", cloudError);
      }
    }

    await AsyncStorage.removeItem(HISTORY_KEY);
  } catch (error) {
    console.error("Failed to clear scan history:", error);
    throw error;
  }
}
