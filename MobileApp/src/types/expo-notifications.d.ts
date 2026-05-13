declare module "expo-notifications" {
  export type NotificationResponse = {
    notification: {
      request: {
        content: {
          data?: Record<string, unknown>;
        };
      };
    };
  };

  export function setNotificationHandler(handler: {
    handleNotification: () => Promise<{
      shouldPlaySound: boolean;
      shouldSetBadge: boolean;
      shouldShowBanner: boolean;
      shouldShowList: boolean;
    }>;
  }): void;

  export function getPermissionsAsync(): Promise<{ status: string }>;
  export function requestPermissionsAsync(): Promise<{ status: string }>;
  export function getExpoPushTokenAsync(): Promise<{ data: string }>;
  export function getLastNotificationResponseAsync(): Promise<NotificationResponse | null>;
  export function addNotificationResponseReceivedListener(
    listener: (response: NotificationResponse) => void
  ): { remove: () => void };
}
