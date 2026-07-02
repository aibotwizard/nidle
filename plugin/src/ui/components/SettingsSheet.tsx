import type { ReactNode } from "react";
import {
  basenameMode,
  type MappingSettings,
  type ThemeGroup,
} from "../../shared/mapping/toFigma.js";
import { CloseIcon } from "./shared/icons.js";
import { Segmented } from "./shared/Segmented.js";
import { Toggle } from "./shared/Toggle.js";

export type ThemedGroup = Extract<ThemeGroup, { kind: "themed" }>;

function SettingsRow({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-meta">
        <div className="settings-h">{title}</div>
        <div className="settings-sub">{sub}</div>
      </div>
      {children}
    </div>
  );
}

export function SettingsSheet({
  settings,
  onUpdate,
  themedGroups,
  onClose,
}: {
  settings: MappingSettings;
  onUpdate: (patch: Partial<MappingSettings>) => void;
  themedGroups: ThemedGroup[];
  onClose: () => void;
}) {
  return (
    <div
      className="sheet-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet">
        <div className="sheet-head">
          <div className="sheet-title">Settings</div>
          <button className="iconbtn" title="Close settings" onClick={onClose}>
            {CloseIcon}
          </button>
        </div>
        <div className="sheet-body scroll">
          <SettingsRow
            title="Reference handling"
            sub="How to treat alias values like {color.blue.500}."
          >
            <Segmented
              options={[
                { id: "keepAlias", label: "Keep as alias" },
                { id: "resolve", label: "Resolve to raw value" },
              ]}
              value={settings.refMode}
              onChange={(id) => onUpdate({ refMode: id as MappingSettings["refMode"] })}
            />
          </SettingsRow>
          <SettingsRow
            title="Group separator"
            sub="Variable name segments are joined with this character."
          >
            <Segmented
              options={[
                { id: "slash", label: "/  Slash" },
                { id: "dot", label: ".  Dot" },
              ]}
              value={settings.separator}
              onChange={(id) => onUpdate({ separator: id as MappingSettings["separator"] })}
            />
          </SettingsRow>
          <SettingsRow
            title="Update existing variables"
            sub="Match by (collection, name) and overwrite values in place. When off, re-imports leave existing variables untouched."
          >
            <Toggle
              on={settings.updateExisting}
              onChange={(v) => onUpdate({ updateExisting: v })}
            />
          </SettingsRow>
          {themedGroups.length > 0 ? (
            <div className="theme-block">
              <div className="settings-h">Themes detected</div>
              <div className="settings-sub">
                Sibling files with matching shape are folded into modes of one collection.
              </div>
              {themedGroups.map((g) => (
                <div key={g.collection + g.dir} className="theme-row">
                  <div className="theme-row-head">
                    <span className="theme-collection">{g.collection}</span>{" "}
                    <span className="theme-dir mono">{(g.dir || "(root)") + "/"}</span>
                  </div>
                  {g.files.map((f) => (
                    <div key={f.file} className="theme-mode">
                      <span className="theme-mode-name">{basenameMode(f.file)}</span>{" "}
                      <span className="theme-mode-file mono">{f.file}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
