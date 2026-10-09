/**
 * ImmersiveReturn — the way back out of the hidden space.
 *
 * A deliberate, ceremonial exit: a lit corridor leading back to the main space,
 * described as such. This is where the "camera pull-back" transition the brief
 * asks for is motivated by the content rather than applied for its own sake.
 *
 * It is also a redundancy: Escape, the header button, the browser back button and
 * the footer index all leave here too. A hidden page must never be a place a
 * visitor can get stuck.
 */

import { Link } from 'react-router-dom';
import { HOME_ROUTE } from '@/app/routes';
import { Icon } from '@/components/ui/Icon';
import { playSfx } from '@/store/useSoundStore';
import './immersive-return.css';

export function ImmersiveReturn() {
  return (
    <section className="ret" aria-labelledby="ret-title">
      <div className="ret__corridor" aria-hidden="true">
        {/* Nested frames receding toward a point: pure CSS perspective, no 3D
            context needed for something this simple. */}
        <span className="ret__frame" style={{ ['--d' as string]: 0 }} />
        <span className="ret__frame" style={{ ['--d' as string]: 1 }} />
        <span className="ret__frame" style={{ ['--d' as string]: 2 }} />
        <span className="ret__frame" style={{ ['--d' as string]: 3 }} />
        <span className="ret__light" />
      </div>

      <div className="ret__body">
        <h2 id="ret-title" className="ret__title">
          回到有光的地方
        </h2>
        <p className="ret__text">
          这里可以留到下一次。想回来的时候，入口一直都在原处——它不会消失，也不需要你记住任何密码。
        </p>

        <div className="ret__actions">
          <Link
            to={HOME_ROUTE.path}
            className="btn btn--solid btn--lg"
            onClick={() => playSfx('close')}
          >
            <Icon name="arrow-left" size={18} />
            <span>返回主空间</span>
          </Link>

          <Link to="/photography" className="btn btn--line btn--md" onClick={() => playSfx('navigate')}>
            <Icon name="camera" size={16} />
            <span>去看摄影</span>
          </Link>
        </div>

        <p className="ret__hint u-label">
          <Icon name="keyboard" size={12} /> Esc 也可以直接返回
        </p>
      </div>
    </section>
  );
}
