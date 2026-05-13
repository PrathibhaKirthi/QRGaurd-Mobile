import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function getExpoPushTokenForAdvancedScan() {
  if (Platform.OS === "web") {
    return null;
  }

  const existingPermission = await Notifications.getPermissionsAsync();
  let finalStatus = existingPermission.status;

  if (existingPermission.status !== "granted") {
    const requestedPermission = await Notifications.requestPermissionsAsync();
    finalStatus = requestedPermission.status;
  }

  if (finalStatus !== "granted") {
    return null;
  }

  const token = await Notifications.getExpoPushTokenAsync();
  return token.data;
}

export function addAdvancedScanNotificationResponseListener(callback: (scanId: string) => void) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const scanId = response.notification.request.content.data?.scan_id;
    if (typeof scanId === "string" && scanId.length > 0) {
      callback(scanId);
    }
  });
}

export async function getLastAdvancedScanNotificationScanId() {
  const response = await Notifications.getLastNotificationResponseAsync();
  const scanId = response?.notification.request.content.data?.scan_id;
  return typeof scanId === "string" && scanId.length > 0 ? scanId : null;
}
