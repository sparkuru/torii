interface ExtensionStorageArea {
  get(keys?: string | string[] | Record<string, unknown>): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

interface BrowserTab {
  id?: number;
  title?: string;
  url?: string;
  active?: boolean;
  status?: string;
}

interface BrowserTabs {
  query(queryInfo: Record<string, never>): Promise<BrowserTab[]>;
  get(tabId: number): Promise<BrowserTab>;
  create(createProperties: { url: string }): Promise<BrowserTab>;
  update(tabId: number, updateProperties: { url: string }): Promise<BrowserTab>;
  onRemoved: { addListener(listener: (tabId: number) => void): void };
  onUpdated: {
    addListener(listener: (tabId: number, changeInfo: { status?: string; url?: string }, tab: BrowserTab) => void): void;
    removeListener(listener: (tabId: number, changeInfo: { status?: string; url?: string }, tab: BrowserTab) => void): void;
  };
}

interface BrowserAlarms {
  create(name: string, alarmInfo: { periodInMinutes: number }): Promise<void>;
  clear(name: string): Promise<boolean>;
  onAlarm: { addListener(listener: (alarm: { name: string }) => void): void };
}

interface ExtensionRuntime {
  onMessage: {
    addListener(listener: (message: unknown) => Promise<unknown> | unknown): void;
  };
  sendMessage(message: unknown): Promise<unknown>;
}

interface BrowserApi {
  storage: { local: ExtensionStorageArea };
  runtime: ExtensionRuntime;
  tabs: BrowserTabs;
  alarms: BrowserAlarms;
}

declare const browser: BrowserApi;
