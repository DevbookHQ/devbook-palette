import React from 'react';
import electron from 'mainProcess';

import { Key } from '../Hotkey';
import Panel from '../Panel';

interface ModalHotkeysPanelProps {
  onOpenInVSCodeClick: (e: any) => void,
  onOpenInBrowserClick: (e: any) => void,
  onCloseClick: (e: any) => void,
}

function ModalHotkeysPanel({
  onOpenInVSCodeClick,
  onOpenInBrowserClick,
  onCloseClick,
}: ModalHotkeysPanelProps) {
  return (
    <Panel
      hotkeysLeft={[
        {
          text: 'Navigate',
          hotkey: [Key.ArrowUp, Key.ArrowDown],
          isSeparated: true
        },
      ]}
      hotkeysRight={[
        {
          text: 'Open in VSCode',
          hotkey: electron.remote.process.platform === 'darwin' ? [Key.Command, 'I'] : ['Alt +', 'I'],
          onClick: onOpenInVSCodeClick,
        },
        {
          text: 'Open in browser',
          hotkey: electron.remote.process.platform === 'darwin' ? [Key.Command, 'O'] : ['Alt +', 'O'],
          onClick: onOpenInBrowserClick,
        },
        {
          text: 'Close',
          hotkey: ['Esc'],
          onClick: onCloseClick,
        },
      ]}
    />
  );
}

export default ModalHotkeysPanel;
