export function useToast() {
  function toast(message: string, type: 'success' | 'error' | 'info' = 'success', duration = 3500) {
    const api = (window as any).__tripteck_toasts;
    if (api?.add) {
      api.add(message, type, duration);
    }
  }

  return {
    success: (msg: string) => toast(msg, 'success'),
    error: (msg: string) => toast(msg, 'error'),
    info: (msg: string) => toast(msg, 'info'),
  };
}
