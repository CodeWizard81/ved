import React, { useEffect, useRef } from 'react';
import './TransitionEffect.css';

const TransitionEffect = ({ videoSrc, onComplete }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch(err => {
        console.error("Video play failed:", err);
        setTimeout(onComplete, 1000);
      });
    }
  }, [onComplete]);

  return (
    <div className="transition-overlay">
      <video
        ref={videoRef}
        className="transition-video"
        src={videoSrc}
        onEnded={onComplete}
        muted
        playsInline
      />
    </div>
  );
};

export default TransitionEffect;
