import type { BrowserCommand, BrowserCommandResult, BrowserTab } from "@torii/contracts";
import { SessionOperationError, type BrowserDriver } from "@torii/session";

export interface BrowserCommandTransport {
  dispatchCommand(command: BrowserCommand): Promise<BrowserCommandResult>;
}

export class WebExtensionDriver implements BrowserDriver {
  public constructor(private readonly transport: BrowserCommandTransport) {}

  public async listTabs(): Promise<BrowserTab[]> {
    const result = await this.transport.dispatchCommand({ kind: "list-tabs" });
    if (result.kind === "tabs") return result.tabs;
    throwResultError(result);
  }

  public async getTab(tabId: number): Promise<BrowserTab> {
    return this.requireTab(await this.transport.dispatchCommand({ kind: "get-tab", tabId }));
  }

  public async openTab(url: string): Promise<BrowserTab> {
    return this.requireTab(await this.transport.dispatchCommand({ kind: "open-tab", url }));
  }

  public async navigateTab(tabId: number, url: string): Promise<BrowserTab> {
    return this.requireTab(await this.transport.dispatchCommand({ kind: "navigate-tab", tabId, url }));
  }

  private requireTab(result: BrowserCommandResult): BrowserTab {
    if (result.kind === "tab") return result.tab;
    throwResultError(result);
  }
}

function throwResultError(result: BrowserCommandResult): never {
  throw new SessionOperationError(result.kind === "error" ? result.code : "INTERNAL_ERROR");
}
