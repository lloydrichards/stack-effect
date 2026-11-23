type Umami = {
  readonly track: (
    eventName: string,
    eventData?: Record<string, string | number | boolean>,
  ) => void;
};

declare global {
  // Augmenting the global Window requires declaration merging.
  // oxlint-disable-next-line typescript/consistent-type-definitions
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
