import { useEffect, useMemo, useReducer } from "react";
import { planForFiles, type FileTokens, type MappingSettings } from "../shared/mapping/toFigma.js";
import { fromUploads } from "../shared/intake/tokenIntake.js";
import type { SandboxTransport } from "./io/transport.js";
import { mergeWithDefaults, type SettingsStorage } from "./io/settingsIO.js";
import { fromDrop, fromPicker, type IntakeFiles } from "./io/intake.js";
import {
  initialState,
  reducer,
  stepOf,
  type FileMeta,
  type LogLine,
} from "./state/machine.js";
import { TitleBar } from "./components/TitleBar.js";
import { Stepper } from "./components/Stepper.js";
import { Footer } from "./components/Footer.js";
import { StepSource } from "./components/StepSource.js";
import { StepSets } from "./components/StepSets.js";
import { StepPreview } from "./components/StepPreview.js";
import { StepImport } from "./components/StepImport.js";
import { SettingsSheet, type ThemedGroup } from "./components/SettingsSheet.js";

export function App({
  transport,
  storage,
}: {
  transport: SandboxTransport;
  storage: SettingsStorage;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Every sandbox message is an Action (Action ⊇ ToUI) — no translation.
  useEffect(() => transport.addMessageListener(dispatch), [transport]);

  // Initial settings hydrate; the reducer validates via mergeWithDefaults.
  useEffect(() => {
    let live = true;
    void storage.load().then((raw) => {
      if (live) dispatch({ type: "settings", settings: raw ?? {} });
    });
    return () => {
      live = false;
    };
  }, [storage]);

  const step = stepOf(state.phase);
  const importing = state.phase.kind === "importing";
  const done = state.phase.kind === "done";
  const progress =
    state.phase.kind === "importing" ? state.phase.progress : done ? 100 : 0;
  const result = state.phase.kind === "done" ? state.phase.result : undefined;

  const selectedCount = state.files.filter((f) => f.selected).length;

  const plan = useMemo(() => {
    const fts: FileTokens[] = state.files
      .filter((f) => f.selected)
      .map((f) => ({ file: f.path, tokens: f.tokens }));
    return planForFiles(fts, state.settings);
  }, [state.files, state.settings]);

  const handleIntake = async (intake: Promise<IntakeFiles>) => {
    const { uploads, parseFailures } = await intake;
    const { files: fileTokens, warnings } = fromUploads(uploads);

    // Surface parse-time warnings (unsupported $type, malformed values) so
    // the user sees them on Step 1 — they won't otherwise show until Step 3.
    const warningLines: LogLine[] = [
      ...warnings.map((w) => ({
        text: `${w.file} · ${w.path} — ${w.reason}`,
        tone: "err" as const,
      })),
      ...parseFailures.map((f) => ({
        text: `${f.path} — ${f.reason}`,
        tone: "err" as const,
      })),
    ];

    const files: FileMeta[] = fileTokens.map((ft) => {
      const parts = ft.file.split("/");
      const name = parts[parts.length - 1]!;
      const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "(root)";
      return { path: ft.file, name, folder, tokens: ft.tokens, selected: true };
    });
    files.sort((a, b) => (a.folder + a.name).localeCompare(b.folder + b.name));

    dispatch({ type: "filesLoaded", files, warningLines });
  };

  const handleStartImport = () => {
    dispatch({ type: "importStarted", count: plan.variables.length });
    transport.postCode({ type: "applyPlan", plan });
  };

  // Persist on the event, not in an effect — the reducer applies the same
  // merge, so store and state cannot disagree.
  const handleSettingsUpdate = (patch: Partial<MappingSettings>) => {
    dispatch({ type: "settingsChanged", patch });
    void storage.save(mergeWithDefaults({ ...state.settings, ...patch }));
  };

  const themedGroups = plan.themeGroups.filter(
    (g): g is ThemedGroup => g.kind === "themed",
  );

  return (
    <>
      <TitleBar
        onOpenSettings={() => dispatch({ type: "sheetToggled", open: true })}
        onClose={() => transport.postCode({ type: "close" })}
      />
      <Stepper step={step} />
      <div className="content scroll">
        {step === 1 ? (
          <StepSource
            files={state.files}
            onFilesPicked={(l) => void handleIntake(fromPicker(l))}
            onDropTransfer={(dt) => void handleIntake(fromDrop(dt))}
          />
        ) : step === 2 ? (
          <StepSets
            files={state.files}
            onToggleFile={(path) => dispatch({ type: "fileToggled", path })}
          />
        ) : step === 3 ? (
          <StepPreview plan={plan} selectedCount={selectedCount} />
        ) : (
          <StepImport
            importing={importing}
            done={done}
            progress={progress}
            result={result}
            planWarnings={plan.warnings.length}
            log={state.log}
          />
        )}
      </div>
      <Footer
        step={step}
        filesCount={state.files.length}
        selectedCount={selectedCount}
        planVarCount={plan.variables.length}
        importing={importing}
        done={done}
        onBack={() => dispatch({ type: "navigated", to: (step - 1) as 1 | 2 })}
        onNext={() => dispatch({ type: "navigated", to: (step + 1) as 2 | 3 })}
        onStartImport={handleStartImport}
        onReset={() => dispatch({ type: "reset" })}
        onClose={() => transport.postCode({ type: "close" })}
      />
      {state.settingsOpen ? (
        <SettingsSheet
          settings={state.settings}
          onUpdate={handleSettingsUpdate}
          themedGroups={themedGroups}
          onClose={() => dispatch({ type: "sheetToggled", open: false })}
        />
      ) : null}
    </>
  );
}
