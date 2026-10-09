/**
 * SettingsTrigger — the button that opens the settings panel.
 *
 * Split from the panel itself so the trigger can live in the scene chrome while
 * the panel renders once, at the app root. Keeping a single mounted panel avoids
 * a dozen dialog instances and the focus-management bugs that come with them.
 */

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useUIStore } from '@/store/useUIStore';
import { playSfx } from '@/store/useSoundStore';

export function SettingsTrigger({ compact = false }: { compact?: boolean }) {
  const setOpen = useUIStore((s) => s.setSettingsOpen);
  const open = useUIStore((s) => s.settingsOpen);

  return (
    <Button
      variant="glass"
      size="sm"
      className="settings-trigger"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => {
        playSfx('open');
        setOpen(true);
      }}
      title="显示与声音设置"
    >
      <Icon name="settings" size={compact ? 16 : 17} />
      {compact ? <span className="visually-hidden">打开设置</span> : <span className="btn__label">设置</span>}
    </Button>
  );
}
