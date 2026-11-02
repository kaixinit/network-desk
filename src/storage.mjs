const desktop = window.networkDeskDesktop;
const cached = { ...desktop?.preferences };
export const storage = desktop
  ? {
      getItem: (key) => cached[key] ?? null,
      setItem: (key, value) => {
        cached[key] = String(value);
        desktop
          .setPreference(key, String(value))
          .catch(() =>
            window.dispatchEvent(new Event("network-desk:storage-error")),
          );
      },
      removeItem: (key) => {
        delete cached[key];
        desktop
          .setPreference(key, null)
          .catch(() =>
            window.dispatchEvent(new Event("network-desk:storage-error")),
          );
      },
    }
  : window.localStorage;
export { desktop };
