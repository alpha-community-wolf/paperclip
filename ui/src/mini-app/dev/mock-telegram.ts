/**
 * Mock Telegram WebApp environment for local development.
 * Import this at the top of main.tsx when developing outside Telegram.
 *
 * Usage: import "./dev/mock-telegram" (conditional import or env check)
 */

const noop = () => {};

const mockMainButton = {
  text: "",
  color: "#5ea2f0",
  textColor: "#ffffff",
  isVisible: false,
  isActive: true,
  show: noop,
  hide: noop,
  enable: noop,
  disable: noop,
  showProgress: noop,
  hideProgress: noop,
  onClick: noop,
  offClick: noop,
  setText(text: string) {
    this.text = text;
  },
  setParams: noop,
};

const mockBackButton = {
  isVisible: false,
  show() {
    this.isVisible = true;
  },
  hide() {
    this.isVisible = false;
  },
  onClick: noop,
  offClick: noop,
};

const mockHapticFeedback = {
  impactOccurred: noop,
  notificationOccurred: noop,
  selectionChanged: noop,
};

window.Telegram = {
  WebApp: {
    ready: noop,
    expand: noop,
    close: noop,
    initData: "",
    initDataUnsafe: {
      auth_date: Math.floor(Date.now() / 1000),
      hash: "",
    },
    colorScheme: "dark",
    themeParams: {},
    isExpanded: true,
    viewportHeight: window.innerHeight,
    viewportStableHeight: window.innerHeight,
    MainButton: mockMainButton,
    BackButton: mockBackButton,
    HapticFeedback: mockHapticFeedback,
    showConfirm: (_msg: string, cb: (confirmed: boolean) => void) => cb(true),
    showAlert: (_msg: string, cb?: () => void) => cb?.(),
    setHeaderColor: noop,
    setBackgroundColor: noop,
  },
};

console.log("[Mini App] Using mock Telegram WebApp environment");
