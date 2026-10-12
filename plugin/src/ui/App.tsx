import { useEffect, useMemo, useReducer } from "react";
import type { MappingSettings } from "../shared/settings.js";
import type { FileTokens } from "../shared/intake/types.js";
import { planForFiles } from "../shared/mapping/toFigma.js";
import { fromUploads } from "../shared/intake/tokenIntake.js";
import type { SandboxTransport } from "./io/transport.js";
import { mergeWithDefaults, type SettingsStorage } from "./io/settingsIO.js";
import { fromDrop, fromPicker, type IntakeFiles } from "./io/intake.js";
import { initialState, reducer, stepOf } from "./state/machine.js";
import { diagnose } from "./state/diagnostics.js";
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

  const selectedCount = state.files.filter((f) => f.selected).length;

  const plan = useMemo(() => {
    const fts: FileTokens[] = state.files
      .filter((f) => f.selected)
      .map((f) => ({ file: f.path, tokens: f.tokens }));
    return planForFiles(fts, state.settings);
  }, [state.files, state.settings]);

  const diagnostics = useMemo(
    () => diagnose(state.parseWarnings, plan.warnings, state.files),
    [state.parseWarnings, plan, state.files],
  );

  const handleIntake = async (intake: Promise<IntakeFiles>) => {
    const { uploads, warnings: unreadable } = await intake;
    const { files, warnings } = fromUploads(uploads);
    dispatch({ type: "filesLoaded", files, parseWarnings: [...unreadable, ...warnings] });
  };

  const handleStartImport = () => {
    dispatch({
      type: "importStarted",
      count: plan.variables.length,
      consoleLines: diagnostics.consoleLines,
    });
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
      <Stepper step={stepOf(state.phase)} />
      <div className="content scroll">
        {state.phase.kind === "source" ? (
          <StepSource
            files={state.files}
            onFilesPicked={(l) => void handleIntake(fromPicker(l))}
            onDropTransfer={(dt) => void handleIntake(fromDrop(dt))}
          />
        ) : state.phase.kind === "sets" ? (
          <StepSets
            files={state.files}
            onToggleFile={(path) => dispatch({ type: "fileToggled", path })}
          />
        ) : state.phase.kind === "preview" ? (
          <StepPreview
            plan={plan}
            selectedCount={selectedCount}
            diagnostics={diagnostics}
          />
        ) : (
          <StepImport
            phase={state.phase}
            warnings={diagnostics.dropped.length}
            log={state.log}
          />
        )}
      </div>
      <Footer
        phase={state.phase}
        filesCount={state.files.length}
        selectedCount={selectedCount}
        planVarCount={plan.variables.length}
        onNavigate={(to) => dispatch({ type: "navigated", to })}
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
