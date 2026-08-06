interface ExtensionStorageArea {
  get(keys?: string | string[] | Record<string, unknown>): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
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
}

declare const browser: BrowserApi;
