import React, { useMemo } from 'react';

const facePoints = [
  [50, 3], [64, 8], [76, 20], [86, 38], [82, 58], [70, 78],
  [58, 91], [50, 97], [42, 91], [30, 78], [18, 58], [14, 38],
  [24, 20], [36, 8]
];

function pathFromPoints(points) {
  return points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ') + ' Z';
}

export default function JarvisFace({
  isListening,
  isThinking,
  ttsStatus,
  voiceLockEnabled,
  voiceAuth
}) {
  const state = useMemo(() => {
    if (isThinking) return 'thinking';
    if (ttsStatus === 'speaking') return 'speaking';
    if (isListening) return 'listening';
    if (voiceLockEnabled && !voiceAuth?.isAuthorized) return 'locked';
    return 'idle';
  }, [isListening, isThinking, ttsStatus, voiceLockEnabled, voiceAuth?.isAuthorized]);

  return (
    <aside className={`jarvis-face-console state-${state}`} aria-label={`VED assistant state ${state}`}>
      <div className="jarvis-face-header">
        <span>FACE NODE</span>
        <strong>{state.toUpperCase()}</strong>
      </div>

      <div className="jarvis-face-stage">
        <span className="face-ring face-ring-one" />
        <span className="face-ring face-ring-two" />
        <svg className="jarvis-face-svg" viewBox="0 0 100 100" role="img" aria-hidden="true">
          <path className="face-glow" d={pathFromPoints(facePoints)} />
          <path className="face-outline" d={pathFromPoints(facePoints)} />
          {facePoints.map(([x, y], index) => (
            <circle className="face-node" cx={x} cy={y} r="1.8" key={`${x}-${y}-${index}`} />
          ))}

          <path className="face-accent" d="M28 47 L40 51" />
          <path className="face-accent" d="M72 47 L60 51" />

          <g className="face-eye face-eye-left">
            <path d="M28 39 L36 34 L44 39 L36 43 Z" />
            <circle cx="36" cy="39" r="2.3" />
          </g>
          <g className="face-eye face-eye-right">
            <path d="M56 39 L64 34 L72 39 L64 43 Z" />
            <circle cx="64" cy="39" r="2.3" />
          </g>

          <path className="face-mouth" d="M34 66 C40 62, 45 70, 50 66 S60 62, 66 66" />
        </svg>
      </div>

      <div className="jarvis-face-readouts">
        <span>VOICE {voiceLockEnabled ? Math.round((voiceAuth?.confidence || 0) * 100) + '%' : 'OPEN'}</span>
        <span>TTS {ttsStatus?.toUpperCase?.() || 'IDLE'}</span>
      </div>
    </aside>
  );
}
