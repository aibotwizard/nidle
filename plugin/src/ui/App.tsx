import { useReducer } from "react";
import type { SandboxTransport } from "./transport/types.js";
import type { SettingsStore } from "./settings/types.js";
import { fromUploads } from "../shared/intake/tokenIntake.js";
import { readJsonFiles } from "./intake/fileReader.js";
import { initialState, reducer, type FileMeta, type LogLine, type Step } from "./state/appState.js";
import { useSettings } from "./hooks/useSettings.js";
import { useSandboxMessages } from "./hooks/useSandboxMessages.js";
import { usePlan } from "./hooks/usePlan.js";
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
  settingsStore,
}: {
  transport: SandboxTransport;
  settingsStore: SettingsStore;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const settings = useSettings(settingsStore);
  const plan = usePlan(state.files, settings);
  useSandboxMessages(transport, dispatch);

  const selectedCount = state.files.filter((f) => f.selected).length;

  const handleFilesPicked = async (list: FileList | File[]) => {
    const { uploads, parseFailures } = await readJsonFiles(list);
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
    if (plan.variables.length === 0) {
      dispatch({ type: "importBlockedEmpty" });
      return;
    }
    dispatch({ type: "importStarted", count: plan.variables.length });
    transport.postCode({ type: "applyPlan", plan });
  };

  const themedGroups = plan.themeGroups.filter(
    (g): g is ThemedGroup => g.kind === "themed",
  );

  return (
    <>
      <TitleBar
        onOpenSettings={() => dispatch({ type: "settingsOpened" })}
        onClose={() => transport.postCode({ type: "close" })}
      />
      <Stepper step={state.step} />
      <div className="content scroll">
        {state.step === 1 ? (
          <StepSource files={state.files} onFilesPicked={(l) => void handleFilesPicked(l)} />
        ) : state.step === 2 ? (
          <StepSets
            files={state.files}
            onToggleFile={(path) => dispatch({ type: "fileToggled", path })}
          />
        ) : state.step === 3 ? (
          <StepPreview plan={plan} selectedCount={selectedCount} />
        ) : (
          <StepImport
            importing={state.importing}
            done={state.done}
            progress={state.progress}
            result={state.result}
            planWarnings={plan.warnings.length}
            log={state.log}
          />
        )}
      </div>
      <Footer
        step={state.step}
        filesCount={state.files.length}
        selectedCount={selectedCount}
        planVarCount={plan.variables.length}
        importing={state.importing}
        done={state.done}
        onBack={() => dispatch({ type: "stepChanged", step: (state.step - 1) as Step })}
        onNext={() => dispatch({ type: "stepChanged", step: (state.step + 1) as Step })}
        onStartImport={handleStartImport}
        onReset={() => dispatch({ type: "reset" })}
        onClose={() => transport.postCode({ type: "close" })}
      />
      {state.settingsOpen ? (
        <SettingsSheet
          settings={settings}
          onUpdate={settingsStore.update}
          themedGroups={themedGroups}
          onClose={() => dispatch({ type: "settingsClosed" })}
        />
      ) : null}
    </>
  );
}
