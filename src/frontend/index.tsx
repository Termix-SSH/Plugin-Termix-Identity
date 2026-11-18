import { useEffect, useReducer } from "react";
import { Fingerprint } from "lucide-react";
import {
  useTranslation,
  type DataResult,
  type Disposer,
  type TermixApp,
} from "@termix-ssh/plugin-sdk/frontend";
import { TermixIdPanel } from "./TermixIdPanel";
import { createTermixIdApi } from "./api";
import { createLinkedStore, type LinkedStore } from "./linked-store";

const VIEW = "termix-id";

/** The "ID" badge on a saved credential whose key is published, as a value. */
export function createCredentialBadgeValue(linked: LinkedStore) {
  return function useCredentialBadgeValue(
    context: Record<string, unknown>,
  ): DataResult {
    const { t } = useTranslation();
    const [, rerender] = useReducer((n: number) => n + 1, 0);
    useEffect(() => {
      linked.ensure();
      return linked.subscribe(rerender);
    }, []);
    const credentialId = Number(context.credentialId);
    if (!Number.isFinite(credentialId) || !linked.has(credentialId)) {
      return null;
    }
    return { shape: "badge", label: t("credentials.idBadge") };
  };
}

export function activate(app: TermixApp): void {
  const api = createTermixIdApi(app.api);
  const linked = createLinkedStore(api, () => app.hasPermission("use"));

  const Panel = () => (
    <div className="flex flex-col flex-1 min-h-0">
      <TermixIdPanel api={api} linked={linked} />
    </div>
  );

  // Publishing keys under a public handle means nothing to a standalone
  // desktop install, so the rail item waits for a connected remote server.
  let removeRailItem: Disposer | null = null;
  let hidden: boolean | null = null;
  const showRailItem = (hide: boolean) => {
    if (hide === hidden) return;
    hidden = hide;
    removeRailItem?.();
    removeRailItem = app.registerRailItem({
      id: VIEW,
      icon: Fingerprint,
      titleKey: "nav.termixId",
      group: "objects",
      after: "credentials",
      promotable: true,
      separatorAfter: true,
      permission: "use",
      hidden: hide,
    });
  };

  if (app.desktop.available) {
    let alive = true;
    const check = () =>
      void app.desktop.remoteServerUrl().then((url) => {
        if (alive) showRailItem(!url);
      });
    showRailItem(true);
    check();
    app.desktop.onRemoteServerChange(check);
    app.onDispose(() => {
      alive = false;
    });
  } else {
    showRailItem(false);
  }

  app.registerPanel(VIEW, Panel);
  app.registerTab(VIEW, Panel, {
    icon: Fingerprint,
    titleKey: "nav.termixId",
    hostless: true,
    singleton: true,
    panelFrame: true,
  });

  app.registerSlotContribution("credentials.badges", {
    actionId: "termix-identity.credentialBadge",
    titleKey: "credentials.idBadge",
    kind: "data",
    useValue: createCredentialBadgeValue(linked),
  });
}

export function deactivate(): void {
  // Registrations through app are disposed by core.
}
