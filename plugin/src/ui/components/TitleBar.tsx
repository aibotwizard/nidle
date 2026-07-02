import { CloseIcon, GearIcon, LogoIcon } from "./shared/icons.js";

export function TitleBar({
  onOpenSettings,
  onClose,
}: {
  onOpenSettings: () => void;
  onClose: () => void;
}) {
  return (
    <div className="titlebar">
      <div className="logo">{LogoIcon}</div>
      <div className="title">Tokens → Variables</div>
      <div className="badge">W3C DTCG</div>
      <div className="spacer" />
      <button className="iconbtn" title="Settings" onClick={onOpenSettings}>
        {GearIcon}
      </button>
      <button className="iconbtn" title="Close" onClick={onClose}>
        {CloseIcon}
      </button>
    </div>
  );
}
