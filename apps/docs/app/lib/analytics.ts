type Umami = {
  readonly track: (
    eventName: string,
    eventData?: Record<string, string | number | boolean>,
  ) => void;
};

declare global {
  interface Window {
    umami?: Umami;
  }
}

export function trackEvent(
  eventName: string,
  eventData?: Record<string, string | number | boolean>,
) {
  window.umami?.track(eventName, eventData);
}
