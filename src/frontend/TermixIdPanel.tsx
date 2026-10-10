import { useEffect, useState, useCallback } from "react";
import {
  Check,
  Copy,
  Fingerprint,
  KeyRound,
  Loader2,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  AddButton,
  Button,
  DocsLink,
  FakeSwitch,
  Field,
  FormFooter,
  GroupHeading,
  InlineView,
  Input,
  ListBadge,
  ListRow,
  ListRowAction,
  PanelShell,
  Segmented,
  SelectField,
  SwitchRow,
  TextAreaField,
  TextField,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { TermixIdApi } from "./api";
import type { LinkedStore } from "./linked-store";
import {
  errorMessage,
  type CredentialOption,
  type TermixIdCa,
  type TermixIdentity,
  type TermixIdentityKey,
} from "./types";
import { docsUrl } from "./docs";

const DOCS_URL = docsUrl();

const brandBtn =
  "border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand dark:border-accent-brand/40 dark:bg-transparent dark:hover:bg-accent-brand/10";

function CopyField({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("termixId.copyFailed"));
    }
  }
  return (
    <Field label={label}>
      <div className="flex items-stretch">
        <code className="flex h-8 min-w-0 flex-1 items-center overflow-x-auto whitespace-nowrap border border-r-0 border-border bg-muted/30 px-2 font-mono text-[11px] text-muted-foreground thin-scrollbar">
          {value}
        </code>
        <Button
          variant="outline"
          size="icon"
          onClick={() => void copy()}
          title={t("common.copy")}
          aria-label={t("common.copy")}
        >
          {copied ? (
            <Check className="size-3.5 text-accent-brand" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </Button>
      </div>
    </Field>
  );
}

function downloadText(filename: string, text: string) {
  // octet-stream so the browser/OS keeps the given extension instead of
  // appending .txt to a text/plain download.
  const blob = new Blob([text], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function TermixIdPanel({
  api,
  linked,
}: {
  api: TermixIdApi;
  linked: LinkedStore;
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState<TermixIdentity | null>(null);
  const [keys, setKeys] = useState<TermixIdentityKey[]>([]);
  const [ca, setCa] = useState<TermixIdCa | null>(null);
  const [credentials, setCredentials] = useState<CredentialOption[]>([]);
  const [linkedCredentialIds, setLinkedCredentialIds] = useState<Set<number>>(
    new Set(),
  );

  const refresh = useCallback(async () => {
    try {
      const [data, caData, linkedData, credData] = await Promise.all([
        api.me(),
        api.ca().catch(() => ({ ca: null })),
        api.linkedCredentialIds().catch(() => ({ credentialIds: [] })),
        // Pasting a key still works without the list.
        api.credentials().catch(() => ({ credentials: [] })),
      ]);
      setIdentity(data.identity);
      setKeys(data.keys);
      setCa(data.identity ? caData.ca : null);
      setLinkedCredentialIds(new Set(linkedData.credentialIds));
      setCredentials(credData.credentials);
    } catch {
      toast.error(t("termixId.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [api, t]);

  // Credential badges elsewhere follow what this panel changes.
  const changed = useCallback(async () => {
    await refresh();
    void linked.refresh();
  }, [refresh, linked]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground">
        <Loader2 className="animate-spin size-4" />
      </div>
    );
  }

  if (!identity) return <ClaimHandle api={api} onCreated={changed} />;

  return (
    <IdentityView
      api={api}
      identity={identity}
      keys={keys}
      ca={ca}
      credentials={credentials}
      linkedCredentialIds={linkedCredentialIds}
      onChanged={changed}
    />
  );
}

function ClaimHandle({
  api,
  onCreated,
}: {
  api: TermixIdApi;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [handle, setHandle] = useState("");
  const [description, setDescription] = useState("");
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "available" | "taken" | "invalid"
  >("idle");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const h = handle.trim().toLowerCase();
    if (!h) {
      setStatus("idle");
      return;
    }
    // Guard against an out-of-order response: if the input changed (effect
    // cleanup ran) before this request resolved, ignore its result.
    let cancelled = false;
    setChecking(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.checkHandle(h);
        if (cancelled) return;
        setStatus(
          !res.valid ? "invalid" : res.available ? "available" : "taken",
        );
      } catch {
        if (!cancelled) setStatus("idle");
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api, handle]);

  async function submit() {
    setSubmitting(true);
    try {
      await api.create(
        handle.trim().toLowerCase(),
        description.trim() || undefined,
      );
      toast.success(t("termixId.created"));
      onCreated();
    } catch (e) {
      toast.error(errorMessage(e, t("termixId.createFailed")));
    } finally {
      setSubmitting(false);
    }
  }

  const handleStatus = checking ? (
    <span className="text-muted-foreground">{t("termixId.checking")}</span>
  ) : status === "available" ? (
    <span className="text-accent-brand">{t("termixId.available")}</span>
  ) : null;
  const handleError =
    !checking && status === "taken"
      ? t("termixId.taken")
      : !checking && status === "invalid"
        ? t("termixId.invalidHandle")
        : undefined;

  return (
    <PanelShell
      chrome={false}
      footer={
        <FormFooter
          onSave={() => void submit()}
          saveLabel={t("termixId.create")}
          saving={submitting}
          disabled={status !== "available" || checking}
        />
      }
    >
      <div className="flex flex-col gap-4 p-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Fingerprint className="size-4 text-accent-brand" />
            <span className="flex-1 text-sm font-bold tracking-tight">
              {t("termixId.title")}
            </span>
            <DocsLink href={DOCS_URL} />
          </div>
          <p className="text-xs leading-snug text-muted-foreground">
            {t("termixId.claimIntro")}
          </p>
        </div>
        <Field
          label={t("termixId.handleLabel")}
          hint={handleStatus}
          error={handleError}
        >
          <div className="relative flex items-center">
            <span className="pointer-events-none absolute left-2.5 select-none text-xs text-muted-foreground">
              @
            </span>
            <Input
              value={handle}
              placeholder={t("termixId.handlePlaceholder")}
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={!!handleError}
              className="pl-6"
              onChange={(e) => setHandle(e.target.value)}
            />
          </div>
        </Field>
        <TextField
          label={t("termixId.descriptionLabel")}
          value={description}
          placeholder={t("termixId.descriptionPlaceholder")}
          onChange={setDescription}
        />
      </div>
    </PanelShell>
  );
}

function IdentityView({
  api,
  identity,
  keys,
  ca,
  credentials,
  linkedCredentialIds,
  onChanged,
}: {
  api: TermixIdApi;
  identity: TermixIdentity;
  keys: TermixIdentityKey[];
  ca: TermixIdCa | null;
  credentials: CredentialOption[];
  linkedCredentialIds: Set<number>;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [certKey, setCertKey] = useState<TermixIdentityKey | null>(null);
  const url =
    identity.resolverUrl ??
    `${window.location.origin}${identity.resolverPath ?? ""}`;
  const curl = `curl -fsSL ${url} >> ~/.ssh/authorized_keys`;

  async function remove() {
    const ok = await confirm({
      title: t("termixId.deleteConfirm"),
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.remove();
      toast.success(t("termixId.deleted"));
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, t("termixId.deleteFailed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AddKeyView
        open={adding}
        onClose={() => setAdding(false)}
        api={api}
        handle={identity.handle}
        credentials={credentials}
        linkedCredentialIds={linkedCredentialIds}
        onAdded={onChanged}
      />
      <IssueCertView
        api={api}
        handle={identity.handle}
        keyRow={certKey}
        onClose={() => setCertKey(null)}
      />
      <PanelShell
        chrome={false}
        toolbar={
          <>
            <Fingerprint className="size-4 shrink-0 text-accent-brand" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-bold tracking-tight text-accent-brand">
                @{identity.handle}
              </span>
              {identity.description && (
                <span className="truncate text-[11px] text-muted-foreground">
                  {identity.description}
                </span>
              )}
            </div>
            <DocsLink href={DOCS_URL} variant="icon" />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void remove()}
              disabled={busy}
              title={t("common.delete")}
              aria-label={t("common.delete")}
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 border-b border-border p-3">
          <CopyField label={t("termixId.resolverUrlLabel")} value={url} />
          <CopyField label={t("termixId.provisionLabel")} value={curl} />
        </div>
        <KeyList
          api={api}
          keys={keys}
          caEnabled={!!ca}
          onAdd={() => setAdding(true)}
          onIssueCert={setCertKey}
          onChanged={onChanged}
        />
        <CaSection
          api={api}
          handle={identity.handle}
          ca={ca}
          onChanged={onChanged}
        />
      </PanelShell>
    </>
  );
}

type AddMode = "generate" | "paste" | "import";

function AddKeyView({
  open,
  onClose,
  api,
  handle,
  credentials,
  linkedCredentialIds,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  api: TermixIdApi;
  handle: string;
  credentials: CredentialOption[];
  linkedCredentialIds: Set<number>;
  onAdded: () => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<AddMode>("generate");
  const [publicKey, setPublicKey] = useState("");
  const [label, setLabel] = useState("");
  const [saveToVault, setSaveToVault] = useState(true);
  const [credentialId, setCredentialId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedId = credentialId ? Number(credentialId) : null;
  const alreadyLinked =
    selectedId !== null && linkedCredentialIds.has(selectedId);

  function close() {
    setPublicKey("");
    setLabel("");
    setCredentialId("");
    onClose();
  }

  async function submit() {
    setSubmitting(true);
    try {
      if (mode === "generate") {
        const result = await api.generateKey("ed25519", saveToVault);
        downloadText(`termix-${handle}-ed25519.key`, result.privateKey);
        toast.success(
          saveToVault
            ? t("termixId.generatedSaved")
            : t("termixId.generatedOnly"),
        );
      } else if (mode === "paste") {
        await api.addKey({
          publicKey: publicKey.trim(),
          label: label.trim() || undefined,
        });
        toast.success(t("termixId.keyPublished"));
      } else if (selectedId !== null) {
        await api.addKey({ credentialId: selectedId });
        toast.success(t("termixId.imported"));
      }
      onAdded();
      close();
    } catch (e) {
      const fallback =
        mode === "generate"
          ? "termixId.generateFailed"
          : mode === "paste"
            ? "termixId.addKeyFailed"
            : "termixId.importFailed";
      toast.error(errorMessage(e, t(fallback)));
    } finally {
      setSubmitting(false);
    }
  }

  const modes: { value: AddMode; label: string }[] = [
    { value: "generate", label: t("termixId.generate") },
    { value: "paste", label: t("termixId.paste") },
    ...(credentials.length > 0
      ? [{ value: "import" as const, label: t("termixId.import") }]
      : []),
  ];

  const canSave =
    mode === "generate" ||
    (mode === "paste" && !!publicKey.trim()) ||
    (mode === "import" && selectedId !== null && !alreadyLinked);

  return (
    <InlineView
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={t("termixId.publishTitle")}
      icon={<KeyRound className="size-4" />}
      footer={
        <FormFooter
          onCancel={close}
          onSave={() => void submit()}
          saving={submitting}
          disabled={!canSave}
          status={
            mode === "import" && alreadyLinked ? (
              <span className="text-muted-foreground">
                {t("termixId.alreadyPublished")}
              </span>
            ) : undefined
          }
          saveLabel={
            mode === "generate"
              ? t("termixId.generate")
              : mode === "paste"
                ? t("termixId.add")
                : t("termixId.import")
          }
        />
      }
    >
      <Segmented<AddMode>
        value={mode}
        onChange={setMode}
        options={modes}
        className="self-start"
      />
      {mode === "generate" && (
        <>
          <p className="text-xs leading-snug text-muted-foreground">
            {t("termixId.generateTooltip")}
          </p>
          <SwitchRow
            label={t("termixId.saveToVault")}
            checked={saveToVault}
            onChange={setSaveToVault}
          />
        </>
      )}
      {mode === "paste" && (
        <>
          <TextAreaField
            label={t("termixId.publicKeyLabel")}
            value={publicKey}
            onChange={setPublicKey}
            placeholder={t("termixId.keyPlaceholder")}
            rows={4}
            mono
          />
          <TextField
            label={t("termixId.labelLabel")}
            value={label}
            onChange={setLabel}
            placeholder={t("termixId.labelPlaceholder")}
          />
        </>
      )}
      {mode === "import" && (
        <SelectField
          label={t("termixId.credentialLabel")}
          value={credentialId}
          onChange={setCredentialId}
          placeholder={t("termixId.selectCredential")}
          options={credentials.map((c) => ({
            value: String(c.id),
            label: linkedCredentialIds.has(c.id)
              ? t("termixId.credentialPublished", { name: c.name })
              : c.name,
          }))}
        />
      )}
    </InlineView>
  );
}

function IssueCertView({
  api,
  handle,
  keyRow,
  onClose,
}: {
  api: TermixIdApi;
  handle: string;
  keyRow: TermixIdentityKey | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [principals, setPrincipals] = useState("");
  const [issuing, setIssuing] = useState(false);

  function close() {
    setPrincipals("");
    onClose();
  }

  async function issue() {
    if (!keyRow) return;
    setIssuing(true);
    try {
      const res = await api.issueCertificate(keyRow.id, {
        principals: principals
          .split(",")
          .map((principal) => principal.trim())
          .filter(Boolean),
      });
      downloadText(
        `termix-${handle}-${keyRow.id}-cert.pub`,
        res.certificate + "\n",
      );
      toast.success(t("termixId.certIssued"));
      close();
    } catch (e) {
      toast.error(errorMessage(e, t("termixId.certIssueFailed")));
    } finally {
      setIssuing(false);
    }
  }

  return (
    <InlineView
      open={!!keyRow}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={t("termixId.issueCertTitle")}
      icon={<ScrollText className="size-4" />}
      footer={
        <FormFooter
          onCancel={close}
          onSave={() => void issue()}
          saving={issuing}
          disabled={!principals.trim()}
          saveLabel={t("termixId.issueCert")}
        />
      }
    >
      {keyRow && (
        <p className="text-xs leading-snug text-muted-foreground">
          {t("termixId.issueCertIntro", {
            name: keyRow.label || keyRow.comment || keyRow.keyType,
          })}
        </p>
      )}
      <TextField
        label={t("termixId.principalsLabel")}
        value={principals}
        onChange={setPrincipals}
        placeholder={t("termixId.principalsPlaceholder")}
        hint={t("termixId.principalsHint")}
        mono
      />
    </InlineView>
  );
}

function KeyList({
  api,
  keys,
  caEnabled,
  onAdd,
  onIssueCert,
  onChanged,
}: {
  api: TermixIdApi;
  keys: TermixIdentityKey[];
  caEnabled: boolean;
  onAdd: () => void;
  onIssueCert: (k: TermixIdentityKey) => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();

  async function toggle(k: TermixIdentityKey) {
    try {
      await api.setKeyEnabled(k.id, !k.enabled);
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, t("termixId.updateKeyFailed")));
    }
  }

  async function remove(k: TermixIdentityKey) {
    const ok = await confirm({
      title: t("termixId.removeKeyConfirm", {
        name: k.label || k.comment || k.keyType,
      }),
      confirmLabel: t("common.remove"),
    });
    if (!ok) return;
    try {
      await api.removeKey(k.id);
      toast.success(t("termixId.keyRemoved"));
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, t("termixId.removeKeyFailed")));
    }
  }

  return (
    <div className="flex flex-col border-b border-border">
      <GroupHeading
        title={t("termixId.keysTitle")}
        count={keys.length}
        action={
          <AddButton
            label={t("termixId.addKey")}
            onClick={onAdd}
            className="h-7"
          />
        }
        className="px-3 py-2"
      />
      {keys.length === 0 ? (
        <p className="px-3 pb-3 text-xs text-muted-foreground">
          {t("termixId.noKeys")}
        </p>
      ) : (
        <div className="border-t border-border/40 [&>*:last-child]:border-b-0">
          {keys.map((k, index) => (
            <ListRow
              key={k.id}
              stripe={index}
              tone={k.enabled ? "brand" : "muted"}
              dimmed={!k.enabled}
              icon={<KeyRound />}
              title={k.label || k.comment || k.keyType}
              badges={
                <>
                  <ListBadge tone="brand">{k.algorithm}</ListBadge>
                  {k.credentialId && (
                    <ListBadge>{t("termixId.vaultBadge")}</ListBadge>
                  )}
                </>
              }
              meta={<span className="font-mono">{k.publicKey}</span>}
              trailing={
                <FakeSwitch checked={k.enabled} onChange={() => toggle(k)} />
              }
              actions={
                <>
                  {caEnabled && k.algorithm.toUpperCase() === "ED25519" && (
                    <ListRowAction
                      label={t("termixId.issueCertTooltip")}
                      tone="brand"
                      onClick={() => onIssueCert(k)}
                    >
                      <ScrollText />
                    </ListRowAction>
                  )}
                  <ListRowAction
                    label={t("common.remove")}
                    tone="destructive"
                    onClick={() => void remove(k)}
                  >
                    <Trash2 />
                  </ListRowAction>
                </>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CaSection({
  api,
  handle,
  ca,
  onChanged,
}: {
  api: TermixIdApi;
  handle: string;
  ca: TermixIdCa | null;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();

  const caUrl = ca?.resolverUrl ?? "";
  const trustCmd = `curl -fsSL ${caUrl} | sudo tee /etc/ssh/${handle}-ca.pub && echo "TrustedUserCAKeys /etc/ssh/${handle}-ca.pub" | sudo tee -a /etc/ssh/sshd_config && (sudo systemctl reload ssh || sudo systemctl reload sshd)`;

  async function enable() {
    setBusy(true);
    try {
      await api.createCa();
      toast.success(t("termixId.caEnabled"));
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, t("termixId.caCreateFailed")));
    } finally {
      setBusy(false);
    }
  }

  async function rotate() {
    const ok = await confirm({
      title: t("termixId.caRotateConfirm"),
      confirmLabel: t("termixId.caRotate"),
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.rotateCa();
      toast.success(t("termixId.caRotated"));
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, t("termixId.caRotateFailed")));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: t("termixId.caDeleteConfirm"),
      confirmLabel: t("termixId.caDelete"),
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.removeCa();
      toast.success(t("termixId.caDeleted"));
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, t("termixId.caDeleteFailed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <GroupHeading
        title={t("termixId.caTitle")}
        action={
          !ca ? (
            <Button
              variant="outline"
              size="sm"
              className={brandBtn}
              onClick={() => void enable()}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="animate-spin size-3.5" />
              ) : (
                <ShieldCheck className="size-3.5" />
              )}
              {t("termixId.caEnable")}
            </Button>
          ) : (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void rotate()}
                disabled={busy}
              >
                <RefreshCw className="size-3.5" />
                {t("termixId.caRotate")}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => void remove()}
                disabled={busy}
                title={t("termixId.caDelete")}
                aria-label={t("termixId.caDelete")}
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          )
        }
      />
      <p className="text-xs leading-snug text-muted-foreground">
        {t("termixId.caIntro")}
      </p>
      {ca && (
        <>
          <CopyField label={t("termixId.caTrustLabel")} value={trustCmd} />
          <CopyField
            label={t("termixId.caPublicKeyLabel")}
            value={ca.publicKey}
          />
        </>
      )}
    </div>
  );
}
